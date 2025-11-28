// 调试弹窗
// alert("【调试】工作流+ID绑定版已加载！");

import { extension_settings, getContext } from "../../../extensions.js";
import { eventSource, event_types, saveSettingsDebounced, updateMessageBlock, appendMediaToMessage } from "../../../../script.js";
import { regexFromString } from '../../../utils.js';

const extensionName = "st-comfy-simplified";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const COMFY_API_URL = "http://127.0.0.1:8188"; 

const defaultSettings = {
    insertType: 'inline', 
    promptInjection: {
        enabled: false, 
        regex: '/<pic[^>]*\\sprompt="([^"]*)"[^>]*?>/g',
        prompt: "",
        position: 'deep_system',
        depth: 0
    },
    // 存储结构： { "WorkflowName": { data: JSON, nodeId: "6", outputNodeId: "9" } }
    savedWorkflows: {}, 
    activeWorkflowName: "" 
};

let loadedWorkflowData = null; // 当前加载的完整数据对象 (包含 json 和 id)

$(function () {
    (async function () {
        extension_settings[extensionName] = extension_settings[extensionName] || {};
        // 合并默认设置
        for (const key in defaultSettings) {
            if (!(key in extension_settings[extensionName])) {
                extension_settings[extensionName][key] = defaultSettings[key];
            }
        }
        
        // 尝试迁移旧数据 (防止旧版纯JSON数据导致报错)
        migrateOldData();

        // 初始化加载
        loadActiveWorkflowFromSettings();

        // 强制UI加载
        setInterval(() => {
            if ($("#comfy_ui_drawer").length > 0) return; 
            const container = $("#extensions_settings");
            if (container.length > 0) injectUI(container);
        }, 1000);

        eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, handlePromptInjection);
        eventSource.on(event_types.MESSAGE_RECEIVED, handleIncomingMessage);
    })();
});

// 数据迁移函数：将纯 JSON 转换为带 ID 的对象结构
function migrateOldData() {
    const s = extension_settings[extensionName];
    if (!s.savedWorkflows) return;

    for (const key in s.savedWorkflows) {
        const entry = s.savedWorkflows[key];
        // 如果该项没有 .data 属性，说明是旧版的纯 JSON，需要包裹一层
        if (!entry.data && !entry.nodeId) {
            console.log(`[Comfy] 迁移旧数据格式: ${key}`);
            s.savedWorkflows[key] = {
                data: entry,          // 原本的 JSON
                nodeId: "6",          // 默认值
                outputNodeId: ""      // 默认值
            };
        }
    }
}

function loadActiveWorkflowFromSettings() {
    const s = extension_settings[extensionName];
    if (s.activeWorkflowName && s.savedWorkflows && s.savedWorkflows[s.activeWorkflowName]) {
        loadedWorkflowData = s.savedWorkflows[s.activeWorkflowName];
        console.log(`[Comfy] 已加载工作流: ${s.activeWorkflowName} (In: ${loadedWorkflowData.nodeId}, Out: ${loadedWorkflowData.outputNodeId || 'Auto'})`);
    } else {
        loadedWorkflowData = null;
    }
}

async function injectUI(container) {
    let htmlContent = "";
    try { htmlContent = await $.get(`${extensionFolderPath}/settings.html`); } catch (e) {}

    const drawerHtml = `
    <div id="comfy_ui_drawer" class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>ComfyUI Pro 连接器</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content" style="display:none;">${htmlContent}</div>
    </div>`;

    container.prepend(drawerHtml);
    bindUIEvents();
    
    // 初始化 UI 状态
    updateGlobalSettingsUI();
    renderWorkflowList();
    // 如果有加载的工作流，立刻更新 ID 输入框的显示
    if (loadedWorkflowData) {
        updateIdInputs(loadedWorkflowData.nodeId, loadedWorkflowData.outputNodeId);
    }
}

function renderWorkflowList() {
    const s = extension_settings[extensionName];
    const $select = $("#comfy_workflow_select");
    $select.empty();
    
    $select.append(`<option value="" disabled ${!s.activeWorkflowName ? 'selected' : ''}>-- 请选择或导入 --</option>`);

    if (s.savedWorkflows) {
        Object.keys(s.savedWorkflows).forEach(name => {
            const selected = name === s.activeWorkflowName ? "selected" : "";
            $select.append(`<option value="${name}" ${selected}>${name}</option>`);
        });
    }
    
    updateStatusText();
}

function updateStatusText() {
    const s = extension_settings[extensionName];
    if (loadedWorkflowData) {
        $("#comfy_file_status").html(`✅ 当前: <b>${s.activeWorkflowName}</b>`).css("color", "#90ff90");
    } else {
        $("#comfy_file_status").text("(未加载工作流)").css("color", "#aaa");
    }
}

// 辅助函数：更新界面上的 ID 输入框
function updateIdInputs(nid, oid) {
    $("#comfy_node_id").val(nid || "6");
    $("#comfy_output_node_id").val(oid || "");
}

function bindUIEvents() {
    $("#comfy_ui_drawer .inline-drawer-toggle").off("click").on("click", function(e) {
        e.stopPropagation(); e.preventDefault();
        $(this).parent().find(".inline-drawer-content").slideToggle(200);
        $(this).find(".inline-drawer-icon").toggleClass("down up");
    });

    // 1. 上传并保存 (初始化 ID)
    $("#comfy_upload_json").on("change", function(e) {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const json = JSON.parse(ev.target.result);
                const name = file.name.replace(/\.json$/i, "");
                
                // 保存新结构：包含 JSON 和 默认 ID
                if (!extension_settings[extensionName].savedWorkflows) extension_settings[extensionName].savedWorkflows = {};
                
                // 如果已存在，保留之前的 ID 配置，只更新 JSON；如果是新的，用默认值
                const existing = extension_settings[extensionName].savedWorkflows[name];
                
                extension_settings[extensionName].savedWorkflows[name] = {
                    data: json,
                    nodeId: existing ? existing.nodeId : "6",
                    outputNodeId: existing ? existing.outputNodeId : ""
                };

                extension_settings[extensionName].activeWorkflowName = name;
                saveSettingsDebounced();
                
                loadActiveWorkflowFromSettings();
                renderWorkflowList();
                // 上传后，UI 也要更新为这个工作流的 ID
                updateIdInputs(extension_settings[extensionName].savedWorkflows[name].nodeId, extension_settings[extensionName].savedWorkflows[name].outputNodeId);
                
                toastr.success(`工作流 "${name}" 已导入`);
            } catch(err) { 
                console.error(err);
                toastr.error("JSON 解析错误"); 
            }
            $(this).val('');
        };
        reader.readAsText(file);
    });

    // 2. 下拉菜单切换 (自动加载对应的 ID)
    $("#comfy_workflow_select").on("change", function() {
        const name = $(this).val();
        if (name) {
            extension_settings[extensionName].activeWorkflowName = name;
            saveSettingsDebounced();
            loadActiveWorkflowFromSettings();
            updateStatusText();
            
            // 关键：切换工作流时，界面 ID 变更为该工作流保存的 ID
            if (loadedWorkflowData) {
                updateIdInputs(loadedWorkflowData.nodeId, loadedWorkflowData.outputNodeId);
            }
        }
    });

    // 3. 删除当前工作流
    $("#comfy_btn_delete_wf").on("click", function() {
        const name = extension_settings[extensionName].activeWorkflowName;
        if (!name || !extension_settings[extensionName].savedWorkflows[name]) return;
        
        if (confirm(`确定要删除工作流 "${name}" 吗?`)) {
            delete extension_settings[extensionName].savedWorkflows[name];
            extension_settings[extensionName].activeWorkflowName = "";
            saveSettingsDebounced();
            loadActiveWorkflowFromSettings();
            renderWorkflowList();
            updateIdInputs("6", ""); // 重置为默认
            toastr.info("工作流已删除");
        }
    });

    // 4. 保存 ID (保存到当前选中的工作流中)
    $("#comfy_btn_save_id").on("click", () => {
        const s = extension_settings[extensionName];
        const currentName = s.activeWorkflowName;

        if (!currentName || !s.savedWorkflows[currentName]) {
            toastr.warning("请先选择或导入一个工作流，才能保存 ID 配置。");
            return;
        }

        const nodeIdVal = $("#comfy_node_id").val();
        const outputIdVal = $("#comfy_output_node_id").val();

        // 更新内存对象
        s.savedWorkflows[currentName].nodeId = nodeIdVal;
        s.savedWorkflows[currentName].outputNodeId = outputIdVal;
        
        // 同时也更新一下 active 的缓存
        loadedWorkflowData.nodeId = nodeIdVal;
        loadedWorkflowData.outputNodeId = outputIdVal;

        saveSettingsDebounced();
        toastr.success(`已保存 "${currentName}" 的节点配置 (In:${nodeIdVal}, Out:${outputIdVal || 'Auto'})`);
    });

    $("#image_generation_insert_type").on("change", function() { extension_settings[extensionName].insertType = $(this).val(); saveSettingsDebounced(); });
    $("#prompt_injection_regex").on("input", function() { extension_settings[extensionName].promptInjection.regex = $(this).val(); saveSettingsDebounced(); });
    
    $("#comfy_btn_reset").on("click", (e) => { e.stopPropagation(); $("#comfy_global_status").text("状态已重置"); });
    $("#comfy_btn_generate").on("click", async (e) => { e.stopPropagation(); const p = $("#comfy_test_prompt").val(); if(p) await runComfyGeneration(p, "manual"); });
    $("#comfy_ui_drawer .inline-drawer-content").on("click", (e) => e.stopPropagation());
}

function updateGlobalSettingsUI() {
    const s = extension_settings[extensionName];
    if(!s) return;
    $("#image_generation_insert_type").val(s.insertType || "inline");
    $("#prompt_injection_regex").val(s.promptInjection.regex);
}

async function handlePromptInjection(eventData) {
    // 禁用注入，由世界书控制
}

async function handleIncomingMessage() {
    const s = extension_settings[extensionName];
    if (!s || s.insertType === 'disabled') return;

    const context = getContext();
    const lastMsgId = context.chat.length - 1;
    const message = context.chat[lastMsgId];

    if (!message || message.is_user) return;

    try {
        const imgRegex = regexFromString(s.promptInjection.regex); 
        let matches = [];
        if (imgRegex.global) {
            matches = [...message.mes.matchAll(imgRegex)].map(m => m[1]);
        } else {
            const m = message.mes.match(imgRegex);
            if (m) matches.push(m[1]);
        }

        if (matches.length > 0) {
            if (!loadedWorkflowData) {
                toastr.warning("⚠️ 拦截：未选择工作流");
                return;
            }

            setTimeout(async () => {
                for (const prompt of matches) {
                    toastr.info(`生成中: ${prompt.substring(0,10)}...`);
                    const imgUrl = await runComfyGeneration(prompt, "auto");
                    
                    if (imgUrl) {
                        if (s.insertType === 'inline') {
                            if (!message.extra) message.extra = {};
                            if (!message.extra.image_swipes) message.extra.image_swipes = [];
                            message.extra.image_swipes.push(imgUrl);
                            message.extra.image = imgUrl;
                            message.extra.title = prompt;
                            message.extra.inline_image = true; 
                            
                            const msgEl = $(`.mes[mesid="${lastMsgId}"]`);
                            appendMediaToMessage(message, msgEl); 
                        } 
                        else if (s.insertType === 'replace') {
                            const originalTagMatch = message.mes.match(imgRegex);
                            if (originalTagMatch) {
                                const htmlTag = `<br><img src="${imgUrl}" title="${prompt}" style="max-width:80%; border-radius:5px; cursor:pointer;" onclick="window.open(this.src)"><br>`;
                                message.mes = message.mes.replace(originalTagMatch[0], htmlTag);
                                updateMessageBlock(lastMsgId, message);
                            }
                        }
                    } else {
                        toastr.error("生成失败");
                    }
                }
                context.saveChat();
            }, 100);
        }
    } catch (err) { console.error(err); }
}

async function runComfyGeneration(promptText, mode) {
    if (!loadedWorkflowData || !loadedWorkflowData.data) { 
        if(mode === 'manual') alert("请先选择或导入 API JSON！");
        return null; 
    }

    // 从当前加载的配置中读取 ID，而不是全局设置
    const nodeId = loadedWorkflowData.nodeId || "6";
    const outputId = loadedWorkflowData.outputNodeId || "";
    
    try {
        const workflow = JSON.parse(JSON.stringify(loadedWorkflowData.data));
        const targetNode = workflow[nodeId];
        
        if (!targetNode || !targetNode.inputs) throw new Error(`节点 ID ${nodeId} 不存在 (请检查当前工作流配置)`);

        const allowed = ["text", "opt_text", "string", "text_positive", "positive", "prompt", "wildcard_text"];
        let found = false;
        for (const k of allowed) {
            if (k in targetNode.inputs) {
                targetNode.inputs[k] = promptText; 
                found = true;
                break;
            }
        }
        if (!found) throw new Error("输入节点无文本字段");

        const res = await fetch(`${COMFY_API_URL}/prompt`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ prompt: workflow })
        });
        
        if (!res.ok) throw new Error("API 连接失败");
        const data = await res.json();
        const pid = data.prompt_id;
        
        const url = await waitForImageSafe(pid, outputId);
        
        if (mode === 'manual') window.open(url, "_blank");
        return url;

    } catch (err) {
        console.error(err);
        if (mode === 'manual') alert(err.message);
        return null;
    }
}

async function waitForImageSafe(promptId, targetOutputId) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const timer = setInterval(async () => {
            attempts++;
            if (attempts > 600) { clearInterval(timer); reject(new Error("超时")); return; }
            try {
                const hRes = await fetch(`${COMFY_API_URL}/history/${promptId}`);
                const hData = await hRes.json();
                
                if (hData[promptId] && hData[promptId].outputs) {
                     clearInterval(timer);
                     const outputs = hData[promptId].outputs;
                     let imgInfo = null;

                     if (targetOutputId && outputs[targetOutputId]) {
                         if (outputs[targetOutputId].images && outputs[targetOutputId].images.length > 0) {
                             imgInfo = outputs[targetOutputId].images[0];
                         }
                     } else {
                         for (const key in outputs) {
                             if (outputs[key].images && outputs[key].images.length > 0) {
                                 imgInfo = outputs[key].images[0];
                                 break;
                             }
                         }
                     }

                     if (imgInfo) {
                         resolve(`${COMFY_API_URL}/view?filename=${imgInfo.filename}&subfolder=${imgInfo.subfolder}&type=${imgInfo.type}`);
                     } else {
                         reject(new Error("无图片输出"));
                     }
                     return;
                }
            } catch (e) { }
        }, 1000);
    });
}
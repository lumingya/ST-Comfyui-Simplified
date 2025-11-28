# ST-Comfyui-Simplified
SillyTavern 的 ComfyUI 连接插件，简化复杂配置过程为 导出-导入-填写节点id 三个步骤


<ai写的介绍>

这是一个为 SillyTavern 设计的高级 ComfyUI 连接插件。它允许你在酒馆对话中通过简单的标签触发图像生成，支持导入多种 ComfyUI 工作流（API 格式），并为每个工作流单独配置节点 ID，解决了传统插件只能使用固定工作流的痛点。
✨ 主要功能 (Features)

    多工作流管理 (Multi-Workflow Support)：

        支持导入 ComfyUI 的 API 格式 JSON 文件。

        可以在插件面板中下拉切换不同的绘画风格（例如：SDXL 写实、二次元、SD1.5 等不同工作流）。

        配置记忆：插件会记住每个工作流对应的输入/输出节点 ID，切换工作流时自动应用配置。

    灵活的节点映射 (Custom Node Mapping)：

        输入节点 (Input Node)：自定义提示词（Prompt）发送给哪个节点（通常是 CLIP Text Encode 节点 ID，默认为 6）。

        输出节点 (Output Node)：自定义从哪个节点获取图片（留空支持自动搜索 SaveImage/PreviewImage 节点）。

        无需修改代码即可适配复杂的 ComfyUI 工作流。

    智能触发 (Smart Triggering)：

        正则匹配：使用正则表达式监听对话内容（默认支持 <pic prompt="你的描述"> 格式）。

        插入模式：

            Inline：将生成的图片作为附件追加到消息中（支持多图）。

            Replace：直接替换对话中的触发标签，将图片嵌入文本流中。

    便捷的 UI 面板：

        内置于扩展栏的独立面板。

        支持一键删除不需要的工作流。

        提供手动测试框，无需触发对话即可测试当前工作流是否正常工作。
🛠️ 使用指南 (Usage Guide)
1. 准备 ComfyUI

    确保你的本地 ComfyUI 正在运行（默认地址 http://127.0.0.1:8188）。

    在 ComfyUI 设置中，开启 "Enable Dev mode Options"（开发者模式）。

2. 导出工作流

    在 ComfyUI 中搭建好你想要的工作流。

    点击菜单中的 "Save (API Format)" 按钮保存 .json 文件（注意：不是普通的 Save，是 API 格式）。

    提示：请记住你的文本输入节点（CLIP Text Encode）的 ID 编号（在节点标题上方可以看到）。

3. 导入插件

    在 SillyTavern 插件面板打开 ComfyUI Pro 连接器。

    点击 "导入新工作流 (.json)"，选择刚才保存的文件。

    在面板中设置 输入节点 ID（通常是 6，或者是你工作流中负责接收正向提示词的那个节点 ID）。

    点击 "保存节点 ID"。

4. 开始生成

    手动测试：在插件底部的测试框输入内容，点击“测试生成”。

    对话触发：在聊天或世界书中使用触发词，例如：
    code Code

        
    这里是一只可爱的小猫 <pic prompt="cute cat, white fur, blue eyes">

      

    系统会自动拦截该指令，调用 ComfyUI 生成图片并返回到对话中。

⚙️ 高级配置

    Regex (正则表达式)：
    默认配置为：/<pic[^>]*\sprompt="([^"]*)"[^>]*?>/g
    你可以根据需要修改正则来适配不同的触发格式，例如适配世界书的特定指令。

    插入类型 (Insert Type)：

        行内追加：适合生成多张图，图片会像表情包一样显示在消息下方。

        替换标签：适合图文混排，生成的图片会准确出现在标签所在的位置。

⚠️ 常见问题

    Q: 点击生成后报错 "API 连接失败"？

        A: 请检查 ComfyUI 是否已启动，且没有被防火墙拦截。

    Q: 生成了图片但全是噪点/全黑？

        A: 请检查“输入节点 ID”是否填写正确。如果填错了 ID，提示词可能没发送给正确的节点。

    Q: 如何找到节点 ID？

        A: 在 ComfyUI 开启开发者模式后，每个节点的左上角或标题栏会显示一个小数字，那个就是 ID。

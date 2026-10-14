# drawit 使用指南

drawit 是本地技术图示编辑器。安装版打开后会启动随包会话，不需要安装 Node。首次启动显示“二分查找”示例。

## 新建、打开与保存

工具栏的加号新建图示，文件夹按钮打开文档列表。修改后状态栏显示“未保存”；点击保存按钮或按 Ctrl/Cmd+S。切换文档前先保存。文档标题可在右侧修改。

默认文件位置：

- Windows：`%APPDATA%\drawit\documents`
- macOS：`~/Library/Application Support/drawit/documents`
- Linux：`$XDG_DATA_HOME/drawit/documents`，未设置时是 `~/.local/share/drawit/documents`

工程文件被外部修改时会提示。点击“保留当前内容”继续编辑，或明确点击“重新加载”读入外部文件；重新加载会丢弃当前未保存修改。

`DRAWIT_HOME` 可以覆盖数据目录。工程格式是 `.drawit.json`，保留对象 ID 和语义字段。“文件”菜单可以导入工程或导出 SVG、PNG。

## 绘图与整理

点击或拖入左侧组件。组件库及其分类可折叠。选中对象后，右侧按几何、文字与内容、样式分组编辑属性。

“排列”菜单支持对齐、分布、吸附到网格和自动布局。对齐需要至少两个节点，分布需要至少三个。排列只在明确操作时运行；勾选“固定位置”后，自动布局不移动该节点。

时序图先放生命线，再放消息与激活条，在属性面板选择对应生命线。消息的横向端点跟随生命线，Y 决定时间顺序；激活条高度表示持续时间。表格可逐格编辑表头和内容，并选择起始行列、跨行跨列范围来合并或取消合并。分层架构使用容器和有向连线。目标标注可以选择目标对象并显示箭头。

## 快捷键

macOS 使用 Cmd，Windows/Linux 使用 Ctrl。输入框、文本域、下拉框和可编辑文本拥有焦点时，编辑器不抢占按键。

| 按键 | 功能 |
| --- | --- |
| Ctrl/Cmd+Z | 撤销 |
| Ctrl/Cmd+Shift+Z 或 Ctrl/Cmd+Y | 重做 |
| Ctrl/Cmd+S | 保存 |
| Ctrl/Cmd+C / X / V | 复制 / 剪切 / 粘贴选中对象 |
| Ctrl/Cmd+D | 原位复制，生成新 ID |
| Ctrl/Cmd+A | 全选 |
| Ctrl/Cmd+G | 组合 |
| Delete / Backspace | 删除 |
| 方向键 | 轻移一个网格；选中父容器时子节点随父容器移动 |
| Ctrl/Cmd+0 | 适应画布 |
| Ctrl/Cmd+加号 / 减号 | 放大 / 缩小 |
| Esc | 取消选择 |

复制容器会包含子节点及内部连线；复制时序图对象会保留必要的生命线引用。粘贴产生新 ID 并偏移位置。系统剪贴板不可用时，当前编辑器仍保留内部对象剪贴板。

## 把图交给 Agent

在安装版的状态栏点击“复制 MCP 配置”，将显示的 JSON 放入 Cursor 或 Claude Desktop 的 MCP 配置。它引用安装版可执行文件和随包运行时，端口由应用自动发现。开发版接入见 [mcp.md](mcp.md)。

Agent 应先读版本和对象 ID，再带 `expectedRevision` 修改。`diagram_catalog` 可查询组件和示例；`diagram_save` 显式保存。修改后调用 `diagram_review_snapshot`，检查 PNG 中的重叠、裁切、箭头和标签，按 ID 局部修正并再次审查。工具成功只表示图已生成。

编辑器关闭时 Agent 可以读写工程文件；`diagram_open_editor` 返回 `EDITOR_NOT_RUNNING`。编辑器打开时所有工具修改同一份内存文档。会话暂时不可连接时，请重新连接后重试。

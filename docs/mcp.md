# 接入 MCP

这份文档说明怎样把 drawit 接入 Agent 工具，以及工具怎样调用。

## 接入方法

### 安装版

先打开编辑器，在底部状态栏点击“复制 MCP 配置”。生成的 JSON 用于各 Agent 工具。命令使用当前系统的 drawit 程序和随包运行时，端口由应用发现。使用安装版时，本机不需要全局 Node。

### 开发版

在仓库根目录执行：

```sh
pnpm install
pnpm dev
```

开发入口是 `tsx packages/mcp/src/index.ts`。把下面的 JSON 写进 Agent 配置，并把路径换成仓库的绝对路径。Windows 路径在 JSON 里写成双反斜线。`pnpm` 需要在开发环境的 PATH 中。

```json
{
  "mcpServers": {
    "drawit": {
      "command": "pnpm",
      "args": ["--silent", "--dir", "/absolute/path/to/drawit", "mcp"]
    }
  }
}
```

若设置了 `DRAWIT_HOME`，MCP 和编辑器使用同一个目录。

### 配置 Codex

> codex 的 mcp 配置相对用户不友好

打开 [Codex 配置文件](~/.codex/config.toml)，确认已有的 `drawit` 项如下，避免重复添加：

```toml
[mcp_servers.drawit]
command = "/Applications/drawit.app/Contents/MacOS/drawit"
args = ["--mcp", "--runtime", "/Applications/drawit.app/Contents/Resources/runtime"]
enabled = true

[mcp_servers.drawit.env]
DRAWIT_HOME = "~/Library/Application Support/drawit"
```

**参数必须分别写成数组元素**，不能合成一个字符串。遵循 Codex 官方的 [MCP 配置格式](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)。

保存后重启 Codex。在 MCP 列表中确认 `drawit` 已连接；终端也可执行：

```sh
codex mcp list
```

## 工具调用

### 工具

- 发现与读取：`diagram_catalog`、`diagram_get`、`diagram_get_view`、`diagram_list`
- 文档：`diagram_create`、`diagram_save`、`diagram_open_editor`
- 修改：`diagram_add_nodes`、`diagram_update_nodes`、`diagram_delete_elements`、`diagram_connect_nodes`
- 事务：`diagram_apply_operations`、`diagram_preview_operations`
- 布局：`diagram_auto_layout`，方向为 TB、LR、BT、RL；`pinned` 的节点保持原位
- 验证与输出：`diagram_validate`、`diagram_render`、`diagram_review_snapshot`

`diagram_apply_operations` 支持 `addNodes`、`updateNodes`、`deleteElements`、`connect`、`updateDocument`、`group`、`ungroup`、`align`、`distribute`、`snapToGrid`。时序消息需要 `sourceId` 和 `targetId`。激活条需要 `lifelineId`，并引用同一容器内的生命线。表格合并以表头为第 0 行。

### 调用顺序

`diagram_get` 返回完整 `document`（含标题、画布、语义字段及样式），`diagram_get_view` 返回选择、视口和绝对坐标投影。两者都提供当前 revision。MCP 保存和导出仍限于数据目录，不接受桌面目录句柄或任意绝对路径。

1. `diagram_catalog` 查询组件类型、适用场景、属性 schema、必填字段和最小示例。
2. `diagram_get` 或 `diagram_get_view` 读取当前版本和对象 ID。
3. 用写工具做局部修改，并带上 `expectedRevision`。一批操作一次提交；失败则整批回滚。
4. `diagram_review_snapshot` 返回 PNG，以及带 ID 的清单。对照重叠、裁切、出界、箭头和标签，按 ID 修改后再审查一次。工具成功表示图已经生成。
5. `diagram_save` 保存。当前图 `dirty: false` 之后可以新建或切换。需要导出文件时调用 `diagram_render`。

### 会话与错误

`REVISION_CONFLICT` 和 `VALIDATION_ERROR` 不改变文档。重新读取版本后再试。`diagram_open_editor` 不启动窗口；编辑器未运行时返回 `EDITOR_NOT_RUNNING`，此时工具直接读写工程文件。编辑器打开时，工具只转发到当前会话。会话暂时连不上时，拒绝本次操作，并在重新连接后重试。日志写在 stderr。

stdio 接受 `initialize` 协议 `2024-11-05`、`2025-03-26`、`2025-06-18`，以及 `2026-07-28` 信封。协议变更和打包形态见 [maintenance.md](maintenance.md)。

### 选择组件

先读 `diagram_catalog`：每项包含 usage、semanticFields、compositionOrder、最小 example 和可直接用于 `diagram_apply_operations` 的 exampleOperations。默认省略详细几何与样式 schema；需要时传 `{ "includeSchema": true }`。目录数据来自同一个注册表，unsupported 列出尚未实现的规划图种。不要用匿名矩形冒充不支持的类型。

类、ER 实体、ER 联系、状态、泳道、数轴、张量、里程碑分别使用 class、entity、relationship、state、swimlane、axis、tensor、timeline。数轴的 ticks 是 `{ value, label? }` 数组；里程碑使用 milestones 的 `{ date, label }` 数组，日期为有效 YYYY-MM-DD。有 parentId 的节点坐标相对父容器或泳道。时序消息和激活条示例包含必要的生命线。

创建输入按类型校验，未知类型、错误字段或坏掉的语义关系拒绝整批。短字段列表保留有默认值的关键语义字段。需要实际绘制尺寸时查看 `diagram_get` 的 `view.nodes.renderedWidth/renderedHeight`；不要根据存储的最小宽高推断长文本节点的边界。

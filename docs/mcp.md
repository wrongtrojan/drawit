# 接入 MCP

安装版先打开编辑器，在状态栏点击“复制 MCP 配置”。生成的 JSON 可用于 Cursor 和 Claude Desktop；命令使用当前系统的 drawit 可执行文件与随包运行时，用户不需要全局 Node，也不需要手填端口。

## 开发版

在仓库根目录运行 `pnpm install`、`pnpm dev`。MCP 的开发入口是 `tsx packages/mcp/src/index.ts`。可使用仓库的 `.cursor/mcp.json`，或将下例中的仓库路径替换为实际绝对路径：

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

Windows 中路径使用 JSON 的双反斜线。`pnpm` 必须在开发环境的 PATH 中。安装版用状态栏生成的配置。若自定义 `DRAWIT_HOME`，MCP 与编辑器必须使用同一目录。

## 建议调用顺序

1. `diagram_catalog` 查询组件类型、适用场景、属性 schema、必填字段和最小示例。
2. `diagram_get` 或 `diagram_get_view` 读取当前版本与对象 ID。
3. 用写工具进行局部修改，带上 `expectedRevision`。一批操作原子提交，失败则整批回滚。
4. `diagram_review_snapshot` 返回 PNG 图像块及带 ID 的清单。检查重叠、裁切、出界、箭头和标签；按 ID 修改并再次审查。工具成功只表示图已生成。
5. `diagram_save` 保存；当前图 `dirty: false` 后可新建或切换。需要导出文件时调用 `diagram_render`。

`REVISION_CONFLICT` 和 `VALIDATION_ERROR` 不改变文档内容。重新读取版本后重试。`diagram_open_editor` 不启动窗口，编辑器关闭时返回 `EDITOR_NOT_RUNNING`。编辑器打开时 MCP 仅转发到会话；会话不可用时拒绝操作，不直接写打开的文件。日志只写 stderr。

## 工具

- 发现与读取：`diagram_catalog`、`diagram_get`、`diagram_get_view`、`diagram_list`
- 文档：`diagram_create`、`diagram_save`、`diagram_open_editor`
- 修改：`diagram_add_nodes`、`diagram_update_nodes`、`diagram_delete_elements`、`diagram_connect_nodes`
- 事务：`diagram_apply_operations`、`diagram_preview_operations`
- 布局：`diagram_auto_layout`（TB / LR / BT / RL）；`pinned` 保持原位
- 验证与输出：`diagram_validate`、`diagram_render`、`diagram_review_snapshot`

`diagram_apply_operations` 支持 `addNodes`、`updateNodes`、`deleteElements`、`connect`、`updateDocument`、`group`、`ungroup`、`align`、`distribute`、`snapToGrid`。时序消息需要 `sourceId`、`targetId`，激活条需要 `lifelineId`，引用同一容器内的生命线。表格合并以表头为第 0 行。

stdio 保持 legacy 服务，测试覆盖 `2024-11-05`、`2025-03-26`、`2025-06-18`，同时接受 `2026-07-28` 现代信封。现代 `initialize` 兼容入口映射到 SDK 的 `server/discover`。开发客户端继续使用 tsx 入口；桌面内部使用经过冒烟测试的 CJS 包，避免 ESM 动态 require 问题。

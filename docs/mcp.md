# 接入 MCP

先自己打开编辑器，再让 Agent 使用 MCP。Cursor 不会启动绘图窗口。MCP 进程只做校验和转发：编辑器已打开时，工具改的是你正在看的那份图；编辑器没打开时，工具只能读写文档目录，`diagram_open_editor` 返回 `EDITOR_NOT_RUNNING`。

```powershell
pnpm dev
```

日志走 stderr，不占用 stdout。

## Cursor 配置

本仓库的 `.cursor/mcp.json` 和用户目录的 Cursor MCP 配置都已加入 drawit。Windows 上用 `node.exe` 直接运行 TypeScript 入口：

```json
{
  "mcpServers": {
    "drawit": {
      "command": "D:\\Scoop\\apps\\nodejs\\current\\node.exe",
      "args": [
        "D:\\UniversityStudy\\Profession\\ComputerScience\\个人项目\\drawit\\packages\\mcp\\node_modules\\tsx\\dist\\cli.mjs",
        "D:\\UniversityStudy\\Profession\\ComputerScience\\个人项目\\drawit\\packages\\mcp\\src\\index.ts"
      ]
    }
  }
}
```

## 建议调用顺序

1. `diagram_get` 或 `diagram_get_view` 读取当前版本和对象 id。
2. 用 `diagram_add_nodes`、`diagram_connect_nodes`、`diagram_update_nodes` 或 `diagram_apply_operations` 做局部修改，并带上 `expectedRevision`。
3. 调用 `diagram_review_snapshot`。返回的 PNG 会作为图像交给模型。请看重叠、裁切、出界、箭头和标签，再按清单里的 id 修改。工具成功只表示图片已生成。
4. 需要文件时再调用 `diagram_render`。

版本不一致时返回 `REVISION_CONFLICT`，文档不会被旧快照覆盖。批量操作失败时整批回滚。

## 工具

- `diagram_create`、`diagram_get`、`diagram_get_view`、`diagram_list`、`diagram_open_editor`
- `diagram_add_nodes`、`diagram_update_nodes`、`diagram_delete_elements`、`diagram_connect_nodes`
- `diagram_apply_operations`、`diagram_preview_operations`
- `diagram_auto_layout`：方向 `TB`、`LR`、`BT`、`RL`。`pinned` 节点保持原位。
- `diagram_validate`
- `diagram_render`：导出 SVG 或 PNG
- `diagram_review_snapshot`：把审查图交回给当前模型

自动布局只在显式调用时运行。

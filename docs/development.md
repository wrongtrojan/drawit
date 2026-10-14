# drawit 开发与运行

后续做什么见 [evolution.md](evolution.md)。绘图回归样本见 [scenarios.md](scenarios.md)。

drawit 是本地技术图示编辑器。图形的唯一事实来源是 `DiagramDocument`。桌面界面和 MCP 都通过本机会话修改同一份文档。

## 环境

- Node.js 20 或更高版本
- pnpm 10 或更高版本
- Rust stable 与 Visual Studio C++ 构建工具（仅打包或 `tauri dev` 需要）
- Windows 上的 WebView2

## 安装

在仓库根目录执行：

```powershell
pnpm install
node scripts/icons.mjs
```

## 启动编辑器

```powershell
pnpm dev
```

这个命令会启动本机会话，并在 `http://127.0.0.1:1420` 打开 Vite 界面。首次启动会写入示例图“二分查找”。

桌面壳：

```powershell
pnpm --filter @drawit/desktop tauri dev
```

## 保存位置

默认数据目录是 `%APPDATA%\drawit`。

- `documents\*.drawit.json`：工程文件
- `exports\`：MCP 导出的 SVG 和 PNG
- `session.json`：本机端口和令牌，只监听 `127.0.0.1`

可以用 `DRAWIT_HOME` 改到其他目录。编辑器不会因为磁盘上的文件变化而静默覆盖未保存内容。

## 检查

```powershell
pnpm test
pnpm typecheck
```

## 安装包

```powershell
pnpm --filter @drawit/desktop tauri build
```

Windows 安装包由 NSIS 生成，产物在 `apps/desktop/src-tauri/target/release/bundle/nsis`。安装后的桌面程序仍需要本机 Node 会话；开发时用 `pnpm dev` 同时启动会话和界面。

# drawit 开发与运行

使用指南见 [guide.md](guide.md)，架构与验收要求见 [evolution.md](evolution.md)，绘图回归提示见 [scenarios.md](scenarios.md)，MCP 接入见 [mcp.md](mcp.md)。

唯一事实来源是 `DiagramDocument`。GUI 与 MCP 都使用本机会话和同一个 `DocumentController`。React Flow 只投影文档。

## 环境与启动

- Node.js 20+、pnpm 10+
- 打包：Rust stable 与系统桌面构建工具（Windows 的 Visual Studio C++ / WebView2，macOS 的 Xcode Command Line Tools，Linux 的 WebKitGTK 构建依赖）

仓库根目录运行：

```sh
pnpm install
pnpm dev
```

浏览器地址 `http://127.0.0.1:1420`，首次启动创建“二分查找”示例。开发桌面壳：

```sh
pnpm --filter @drawit/desktop tauri dev
```

## 数据目录

- Windows：`%APPDATA%\drawit`
- macOS：`~/Library/Application Support/drawit`
- Linux：`$XDG_DATA_HOME/drawit` 或 `~/.local/share/drawit`
- `DRAWIT_HOME` 覆盖上述路径

目录内 `documents/*.drawit.json` 为工程，`exports/` 为输出，`session.json` 记录随机端口、令牌和 PID。Host 仅监听 `127.0.0.1`。编辑器不轮询磁盘覆盖内存。MCP 发现活着的 Host 但无法连接时返回失败，禁止直接改该文件。

## 检查

```sh
pnpm test
pnpm typecheck
pnpm --filter @drawit/desktop build
pnpm bundle:runtime
pnpm test:runtime
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

集成测试需要本机 loopback 端口；受限环境中需放行本地监听。`test:runtime` 清空子进程 PATH，验证随包 Node、握手、工具目录、示例文档、审查 PNG、Host 退出及离线编辑器错误。

## 桌面打包

在目标操作系统与 CPU 架构上执行：

```sh
pnpm --filter @drawit/desktop tauri build
```

构建钩子生成图标、打包私有 Node 运行时与平台 resvg 原生库、构建前端。MCP 与 Session Host 打包为 CJS，保留原有 WebSocket 协议。安装后的 Rust 桌面壳管理 Host 的生命周期；`--mcp --runtime <安装资源目录>` 是复制配置使用的 stdio 入口。

默认构建平台支持的安装包：Windows NSIS/MSI、macOS app/dmg、Linux deb/rpm/AppImage。可通过 `--bundles nsis`、`--bundles dmg`、`--bundles deb` 精确选择。产物位于 `apps/desktop/src-tauri/target/release/bundle/`。

在不支持 Finder 美化的 macOS 构建环境中，可先用 `tauri build --bundles app` 构建，再在根目录执行 `pnpm package:dmg`；它使用系统 hdiutil 生成包含应用及 Applications 链接的安装镜像。

跨系统不能复用 `runtime/`；该目录由当前构建机器的 Node 和原生依赖生成，且不提交到版本控制。公开分发仍需目标平台的签名与安装验收。Windows/Linux 的无全局 Node 安装验收需在各自系统运行。

## 本轮实现与后续

已加入组件目录和保存工具、旧协议/现代信封测试、快捷键、文档列表、紧凑浅色工具栏、可折叠组件库、分组属性面板、表格合并、生命线/消息/激活条、目标标注箭头、显式对齐/分布/网格操作以及排版公式的审查 PNG。

类图、ER、泳道等仍未提供专用语义图元。树与图保持近似布局。外部文件变化会提示，只有点击“重新加载”才替换当前内容，并继续增加版本号。场景提示的自动化结构/渲染测试不能代替由 Agent 仅凭提示生成图后的人工视觉验收。

## 本机验证记录

macOS arm64 已通过 44 项回归测试、全工作区类型检查和 Rust stable 的 release 应用构建。实际 `.app` 内的 MCP 可执行入口与私有 Session Host 在清空 PATH 后通过 initialize、tools/list、文档读取、审查 PNG、进程退出与离线错误测试。DMG 使用上述 hdiutil 路径生成。浏览器验证了文档列表、全选/原位复制、输入框保护、撤销/重做和保存；六份新图元工程已做保存往返与 PNG 检查。

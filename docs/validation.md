# 本轮验证记录

日期：2026-10-14。平台：macOS / Apple Silicon。远端 main 的 b063306 已合并；稳定性和保存分别提交为 02f75fd、aba467b，视觉及整合修正随本轮最终提交归档。

| 项目 | 结果与范围 |
| --- | --- |
| TypeScript 测试 | 136 项通过：core 54、layout 2、render 36、session 5、MCP 13、desktop 26。全量 135 项与追加的 App StrictMode/重连用例分别通过 |
| 类型检查 | 所有工作区通过 |
| Rust 文件代理 | 3 项通过：目录句柄绑定/一次性、中文目录写入/重启记忆、目录替换与链接拒绝 |
| 前端与 Mac Tauri 构建 | 最终 .app 构建成功，包含私有 Node、渲染 Worker、字体和文件代理 |
| 私有运行时冒烟 | 无 PATH Node 时 initialize、工具目录、完整工程读取、审查 PNG、Host 退出与离线错误通过；验证过程中修复 diagram_get 漏掉完整 document 的问题 |
| 依赖审计 | pnpm audit 及 --prod 均无已知漏洞；Vitest、tinypool、xmldom 已采用修复版 |
| 随机操作序列 | 4 个固定种子、共 1200 步，检查事务回滚、引用有效、版本单调、撤销重做和 JSON 往返 |
| 六张学术图 | 公式无转换错误、边界覆盖、字体子集/OFL、保存往返及固定随包字体 PNG 基线回归通过；人工检查布局、字体、括号、箭头和配色 |
| 原有场景 | 远端 16 份工程保留并重新生成预览；矩阵乘法样本同步为新规范 |
| Mac 原生导出 | 正式 .app 的系统目录框、中文/空格目录、SVG/PNG 实际落盘、取消不写入、记忆最近导出目录通过 |
| Mac 原生保存 | 首次保存取消保留未保存状态；选择目录保存成功；再次保存直接沿用目录通过。另存为与重启记忆有接口/代理回归，未另做最终包实机验证 |
| 退出保护 | 窗口关闭和 Cmd+Q/菜单退出保护已接入；最终 Cmd+Q 交互未另做实机验证 |
| 原空白窗口 | 原 Mac 包超过 3000 次修订未复现；按用户要求跳过，根因仍待现场堆栈确认 |
| 长时间压力检查 | 新 Mac 包修订超过 2000 次后按用户要求停止，未声明完成 10000 次/30 分钟；本轮不再延长 |
| Windows / 原生 WebView 故障 | Windows 由用户验收；WebView 进程级故障恢复未实机验证 |

Mac 产物：`apps/desktop/src-tauri/target/release/bundle/macos/drawit.app`。产物和 runtime 为本机生成，未提交到 Git；Windows 必须在 Windows 上重新构建。

此记录区分代码实现、自动化回归和实机验收。未验证的跨平台行为、原现场根因不能写作全部通过；当前已确认缺陷的修正和使用方法见 [evaluation.md](evaluation.md)、[guide.md](guide.md)、[academic-style.md](academic-style.md)。

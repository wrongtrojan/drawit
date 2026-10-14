# 交接说明

这份说明交给下一位继续改 drawit 的人。三件事都还没改代码：绘制过程中窗口变空白、保存时要能选系统文件夹、数学图的字体图形和布局要往参考图靠。已经固定的架构、运行和打包见 [maintenance.md](maintenance.md)。给人用的操作见 [guide.md](guide.md)。绘图样本见 [scenarios.md](scenarios.md)。

不要在这一轮放开 MCP 或会话的路径限制。工程仍然以 `DiagramDocument` 为唯一事实来源。

## 空白窗口

安装版 `D:\Tool\drawit\drawit.exe` 在绘制过程中，客户区会变成一整片页面底色 `#e7ebf0`。这个颜色是 [apps/desktop/src/styles.css](../apps/desktop/src/styles.css) 里 `:root` 的背景。标题栏仍可最小化、关闭。工具栏、画布、状态栏和「正在连接」都不在。

当时核对过的运行状态：

- WebView2 渲染进程还在，GPU 崩溃计数是 0。页面来源是内嵌的 `http://tauri.localhost`，不是启动失败后的空白页。
- 本机会话仍在 `127.0.0.1` 上监听。工程已经写入 `%APPDATA%\drawit\documents`。
- 不关闭旧窗口、再启动一次 `drawit.exe` 时，`session.log` 出现 `A drawit session is already running`。新窗口能画出同一份图，旧窗口保持这片底色。

所以这不是安装包缺前端资源，也不是会话退出。窗口壳和数据都还在，是这一块页面的界面树被卸掉之后没有再挂上。

### 复现

按这次实际发生的路径：

1. 打开安装版，确认能看到工具栏和画布。不要用 `pnpm dev` 的浏览器页代替。开发版走 Vite，不会复现这次的安装版窗口。
2. 在已经打开的窗口里连续绘制一张带公式和容器子节点的图。这次对应的工程标题是「多头注意力计算过程」。节点里有 `equation`，公式由 KaTeX 放进 SVG 的 `foreignObject`。子节点带 `parentId`，放进 `container`。修订通过会话连续推到界面，不是一次画完再打开。
3. 绘制过程中客户区变为纯底色，并且不再出现「正在连接」。若只是还没连上会话，画面中央会有这句文字。
4. 不要关闭旧窗口，再启动 `drawit.exe`。新窗口正常显示同一份工程，旧窗口仍然是空底色。

这次还没有收成「点一下必现」的最小步骤。冷启动、缺前端资源、会话退出都不能解释这片底色。

### 可能原因

按和现场的吻合程度：

1. 渲染抛错后，整棵 React 树被卸掉。[apps/desktop/src/main.tsx](../apps/desktop/src/main.tsx) 和 [apps/desktop/src/App.tsx](../apps/desktop/src/App.tsx) 没有错误边界，也没有重新挂载。样式表还在，所以留下 `#e7ebf0`。会话和窗口壳不受影响。之后的修订到达已经卸掉的树上，旧窗口不会自己恢复。新窗口是一块新的页面，重新连上还活着的会话，所以能画出已保存的工程。
2. 连续修订的中间状态让 [apps/desktop/src/ShapeNode.tsx](../apps/desktop/src/ShapeNode.tsx) 或 React Flow 抛错。公式走 `renderNodeInner` 的 `foreignObject`，节点又放在 React Flow 的 CSS `transform` 下面。子节点的 `parentId` 若先于父容器出现，React Flow 也会在渲染期失败。
3. [apps/desktop/src/Canvas.tsx](../apps/desktop/src/Canvas.tsx) 在 `document` 或 `selection` 变化时整表替换节点。绘制过程中若选择来回变化，有机会打出 “Maximum update depth exceeded”，同样卸掉根组件。

### 建议改法

加错误边界。出错时保留错误文字，并提供「重新加载此窗口」。单个节点渲染失败时只跳过该节点，不要拆掉整页。公式导出继续走已有的 SVG 路径，避免再靠 `foreignObject` 把窗口弄白。不要为了这个 bug 放开路径限制。

## 保存位置

现在的「保存」只写数据目录。`safeDocumentPath` 把工程固定在 `%APPDATA%\drawit\documents\<id>.drawit.json`。[packages/core/src/node.ts](../packages/core/src/node.ts) 的 `safeExportPath` 拒绝路径分隔符，导出只能落在 `exports/` 里的文件名。工具栏保存不打开系统对话框。

目标：保存和导出都先打开系统选择文件夹对话框，用户选定目录后再写入。建议用 Tauri 2 的 `@tauri-apps/plugin-dialog`，调用 `open({ directory: true })`。

约束：

- 只有用户刚刚选中的绝对目录可以被会话接受。先确认它是存在的目录，再写入。
- MCP 的 `fileName` 仍只能是 `exports/` 下的文件名，不能因为界面能选目录就把任意路径交给工具。
- 用户还没选目录时，保持现在的数据目录行为。

## 图形演进

参照的是两张教学图：Position Encoding 和 Layer Norm。共同感觉是白底、细黑外框、顶部居中的浅蓝圆角标题条、按角色着色的浅色矩阵、细网格、括号和维度字在图形外侧、运算符是图形之间的文字而不是方框。当前图更像流程图：圆角矩形、较粗描边、虚线容器，矩阵格子被撑得又宽又扁。

下面的数字是下一轮的目标，不是已经实现的默认值。文档默认仍是 [packages/core/src/document.ts](../packages/core/src/document.ts) 里的 `Segoe UI, sans-serif` 和 14px。

### 字体

界面 chrome 继续用 Segoe UI。图内和界面分开。

- 标题：微软雅黑，加粗，深蓝色（约 `#1e3a8a`），约 22px。放在胶囊条里，不要直接铺在画布上。
- 格子里的数字和下标：13–15px，水平垂直居中。
- 变量名：Cambria 或 Times New Roman，斜体。中文说明仍用微软雅黑。
- 运算符（`=`、`+`、减号）：约 20–24px，不放进带描边的矩形。

### 图形

矩阵和向量是这一轮的主体。相关代码在 [packages/core/src/contentLayout.ts](../packages/core/src/contentLayout.ts) 的 `labelWidth`、`labelHeight`，以及 [packages/render/src/svg.ts](../packages/render/src/svg.ts) 的 `gridBody`。

现在的差距：

- 单元格最小宽度被抬到 64，行高最小 36，格子又宽又扁。
- 矩阵只在高亮格上涂色和描边，普通格没有网格线。
- 括号是一枚 28px 的 `{` 或 `[` 字符，贴在节点盒子里面，而不是沿矩阵外侧的一条括号路径。
- 高亮色是整格琥珀色。参考图是整张矩阵一种浅色，只把参与示意的格子再变深一点。
- 容器默认虚线框。这种数学图不要用虚线容器当分组。

改成：

- 每一格都画 1px 浅灰边（约 `#cbd5e1`）。单元格接近正方形，边长约 36–44px。
- 整表用低饱和角色色：粉约 `#fde2e4`，蓝约 `#dbeafe`，绿约 `#dcfce7`。高亮只改对应格的填充，不给整张矩阵再套一层色。
- 大括号用贴在矩阵外侧的路径。行、列下标写在格外，例如 `0`、`1`、`…`、`d-1`，约 11px，颜色约 `#475569`。
- 标题做成胶囊条：高约 48，圆角为高度的一半，填充 `#dbeafe`，无描边或只用 1px `#bfdbfe`，左右内边距约 28px，放在画布上方正中。
- 画布四周留 24–32px。最外一层用 1.5px 近黑描边。矩阵格子本身不要圆角。

### 布局

一条公式从左到右读。矩阵和向量落在同一条垂直中线上。运算符放在对象之间的空隙里，相对这条中线垂直居中，左右留白约 48–72px。维度说明放在括号旁边，不放进格子。省略号是格子里的 `…`，不要另画一个文本框盖住网格。

不要只靠手写坐标把对象凑齐。在现有显式布局之外，加一种「同一行按中心对齐」的操作，供界面和 Agent 使用。自动布局仍然只在显式调用时运行。

### 顺序和验收

1. 先改矩阵、向量和标题条的绘制尺寸与颜色。
2. 再加外侧括号和格外下标。
3. 再提供同一行中心对齐。
4. 公式导出继续走已有的 SVG 路径，编辑器里也不要让 `foreignObject` 再次弄白窗口。

验收时重画「Position Encoding」和「Layer Norm」各一张。对照五件事：标题是顶部居中的胶囊条；格子接近正方形并且每格都有细边；括号和维度在图形外侧；运算符是空隙里的文字；对象之间的留白接近 48–72px。工具返回成功只表示图已经生成，不算这张图合格。

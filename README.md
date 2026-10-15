# drawit

drawit 是本地技术图示编辑器。窗口里的修改，和 Agent 通过 MCP 做的修改，写进同一份文档；每次提交带版本号。图保存在本机。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/guide.md](docs/guide.md) | 使用指南 |
| [docs/mcp.md](docs/mcp.md) | MCP 配置、调用顺序和工具 |
| [docs/maintenance.md](docs/maintenance.md) | 维护指南 |
| [docs/scenarios.md](docs/scenarios.md) | 常用场景范例 |
| [docs/academic.md](docs/academic.md) | 学术图验收范例 |

## 桌面版快照

图为 Windows 端使用 cursor composer 2.5 绘制计算机体系结构图，prompt 为 "请使用 drawit 绘制一张计算机体系结构图"。

![桌面版快照](docs/images/desktop_windows.png)

图为 Mac 端使用 gpt6-sol 绘制的计算机存储体系结构图, prompt 为 "请使用 drawit 绘制一张计算机存储体系结构图, 要求内容详尽, 且样式美观"。

![桌面版快照](docs/images/desktop_mac.png)

## 能画什么

- 矩形、圆角矩形、椭圆、菱形、三角形、多边形、文本、注释、容器和图片
- 流程图：起止、处理、判断、输入输出
- 数组、栈、队列、树和图
- 公式、矩阵、向量和括号
- 时序图：生命线、消息、激活条
- 表格，以及单元格合并
- 类图、ER 实体与联系、状态图、泳道
- 数轴、张量和里程碑
- 分层容器，和指向某个对象的标注箭头
- 直线、折线、曲线和贝塞尔连线

可以撤销、重做、组合、对齐、分布、吸附到网格和自动布局。工程保存为 `.drawit.json`，并可以导出 SVG 或 PNG。

## 开始使用

安装版打开即可。第一次启动会打开二分查找示例。之后的操作见 [docs/guide.md](docs/guide.md)。

从源码运行需要 Node.js 20+ 和 pnpm 10+：

```sh
pnpm install
pnpm dev
```

界面在 `http://127.0.0.1:1420`。桌面壳、测试和安装包见 [docs/maintenance.md](docs/maintenance.md)。

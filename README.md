# drawit

drawit 是本地技术图示编辑器。窗口里的修改，和 Agent 通过 MCP 做的修改，写进同一份文档；每次提交带版本号。图保存在本机。

## 文档

| 文档 | 读者 | 内容 |
| --- | --- | --- |
| [docs/guide.md](docs/guide.md) | 使用界面的人 | 绘图、快捷键、保存，以及怎样把图交给 Agent |
| [docs/mcp.md](docs/mcp.md) | 接入 Agent 的人 | MCP 配置、调用顺序和工具 |
| [docs/maintenance.md](docs/maintenance.md) | 修改代码的人 | 架构、检查和打包 |
| [docs/scenarios.md](docs/scenarios.md) | 做绘图回归的人 | 交给 Agent 的固定提示词 |
| [docs/academic-style.md](docs/academic-style.md) | 做学术图的人 | 默认字号、配色、矩阵与 arrangeRow 规范 |
| [docs/evaluation.md](docs/evaluation.md) | 维护与发布的人 | 本轮改动、空白窗口与未验收项 |

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

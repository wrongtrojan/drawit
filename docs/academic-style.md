# 学术绘图规范

首轮覆盖数学、计算机和 AI 教学图。样本使用 drawit 的语义节点与事务重绘，工程可继续编辑；参考网页的插图不作为随包图片或图标使用。远端整理的 16 条场景保留在 [scenarios.md](scenarios.md)，六张学术验收图另放在 [examples/academic](../examples/academic)。

## 参考与许可

2026-10-14 核对以下一手来源。图号和章节用于找到借鉴对象；提炼的是组织方法，不复制原图。

| 来源与位置 | 借鉴内容 | 许可及使用方式 |
| --- | --- | --- |
| [D2L · 11.6.3，式 11.6.2](https://d2l.ai/chapter_attention-mechanisms-and-transformers/self-attention-and-positional-encoding.html#positional-encoding) | 位置与通道分开标注；编码相加后形状不变 | [D2L 许可](https://github.com/d2l-ai/d2l-en#license-summary)：正文 CC-BY-SA 4.0，示例代码修改版 MIT。仅据数学定义原创重绘，未分发原图 |
| [D2L · 11.7.3](https://d2l.ai/chapter_attention-mechanisms-and-transformers/transformer.html#residual-connection-and-layer-normalization)，图 11.7.1 的 Add & Norm | 残差支路；Layer Norm 沿特征维归一化 | 同上；原创图，不复制模型架构图片 |
| [Distill · Computing Receptive Fields](https://distill.pub/2019/computing-receptive-fields/)，Computing receptive fields 段图 | 局部高亮与邻接关系；图和公式分别承载结构与定义 | 文章底部 Reuse 说明 CC-BY 4.0；带第三方来源说明的插图不自动适用。项目未复制素材 |
| [Distill · A Gentle Introduction to GNN](https://distill.pub/2021/gnn-intro/)，Message passing 图组 | 邻居图、特征与聚合向量的组合；共享消息/更新函数 | 同上，CC-BY 4.0 原创图组可按署名要求复用；本项目使用自身图元重绘 |
| [PGF/TikZ 官方手册](https://pgf-tikz.github.io/pgf/pgfmanual.pdf)，Matrices、Decorations 章节 | 网格对齐、外部括号与标签 | 手册和软件各自的许可由源发行包说明；只参考几何组织方式，未复制手册图或宏代码 |
| [3Blue1Brown · Linear transformations and matrices](https://www.3blue1brown.com/lessons/linear-transformations/) 的基向量与矩阵示意 | 变量跨图一致用色；变换前后保持语义映射 | 网页未明确给出随意再分发图片的许可，未复制图片或视频帧 |
| [Nature · Preparing figures](https://research-figure-guide.nature.com/figures/preparing-figures-our-specifications/) 的 Colour、Font choices | 可读标签、颜色辨识、矢量及可编辑文字 | 仅作为可读性参考。drawit 的像素字号是教学图规范，不宣称符合某期刊最终印刷要求 |

图内普通字形来自 [Noto CJK](https://github.com/notofonts/noto-cjk) 的 Noto Sans SC，拉丁扩展来自 [Noto Sans](https://fonts.google.com/noto/specimen/Noto+Sans)。Regular、Bold 和 [SIL OFL 1.1](../assets/fonts/OFL.txt) 随包提供。SVG 保留 `<text>`，嵌入所需字形子集和许可证；PNG 使用同一随包字体。公式和数学变量走 MathJax 路径 SVG，并保留 LaTeX 源。界面字体保持原有设置。

## 参数与字段

| 项目 | 默认参数 |
| --- | --- |
| 背景、描边 | 白底；主要描边 1.5px；网格 1px `#cbd5e1` |
| 字号 | 正文 16px；索引/说明 13px；标题 25px；运算符 27px；行距系数约 1.33 |
| 标题胶囊 | 圆角 26px，填充 `#dbeafe`，字色 `#1e3a8a` |
| 角色色 | 蓝 `#dbeafe`，粉 `#fde2e4`，绿 `#dcfce7`，中性 `#f8fafc` |
| 高亮 | 对应色加深为 `#93c5fd`、`#f9a8b3`、`#86efac`、`#cbd5e1` |
| 矩阵、向量 | 短内容默认 46px 方格；外侧路径括号；索引和维度位于格外 |
| 横向公式排布 | 默认间距 72px；按主体中心对齐，间距计算包含装饰范围 |

颜色必须与名称、索引或标记一起表达意义。保留远端的查询、键、值、输出预设及用户自定义配色；显式自定义优先于默认规范。缺省字体及历史内建默认样式映射到新规范。渲染投影不改工程 id、内容、坐标或 pinned，不凭视觉猜测增加标题或维度。

`style.role` 支持 `body | title | operator | variable | caption`，`style.tone` 支持 `neutral | blue | pink | green`。矩阵/向量增加 `rowLabels`、`columnLabels`、`dimensionLabel` 和 `cellFormat: plain | math`；标签数量不能超过对应维度。属性面板可编辑这些字段。目录中新增 `math.title` 与 `math.operator`。

长内容增加网格尺寸或换行，不缩小普通字号。显式宽高作为最小外框，通过均匀放大方格满足。重复投影保持尺寸一致；括号、索引、维度参与连接、越界及导出边界。曲线、折点与外侧连线标签也进入导出边界。

GUI 的“排列 → 同一行”与 MCP 共用 `arrangeRow`：

```json
{"op":"arrangeRow","nodeIds":["a","times","b","equals","c"],"gap":72,"startX":40,"centerY":240}
```

按输入顺序排列；节点须有相同父容器。`startX` 和 `centerY` 使用父容器内坐标。固定节点作为锚点；多个固定位置不相容时整批拒绝，失败不移动任何对象。支持撤销。打开旧工程不会自动布局。

## 六张验收图

| 示例 | 数学关系与检查重点 |
| --- | --- |
| [Position Encoding](../examples/academic/position-encoding.png) | X、P、Z 都是 3×4；sin/cos 定义；对应位置相加 |
| [Layer Norm](../examples/academic/layer-norm.png) | 每个 token 沿特征维 d 求均值/方差；gamma、beta 不跨 token 统计 |
| [矩阵乘法](../examples/academic/matrix-multiplication.png) | 2×3 乘 3×2 得 2×2；首个结果 58；同行/列/结果格高亮 |
| [Scaled Attention](../examples/academic/scaled-attention.png) | QKᵀ 按 sqrt(d_k) 缩放；逐行 softmax；乘 V 得输出；两位小数 |
| [残差块](../examples/academic/residual-block.png) | X 与 F(X) 形状一致；恒等支路进入加法；无虚构维度变换 |
| [GNN 消息传递](../examples/academic/gnn-message-passing.png) | 邻居向中心发送消息；sum 聚合与顺序无关；共享 phi、psi |

同目录保存对应 `.drawit.json` 与 `.svg`。生成命令：

```sh
pnpm --filter @drawit/mcp exec tsx ../../scripts/write-academic-examples.ts
pnpm examples
```

六图已检查输出中的字体、括号、维度、配色和留白。首轮视觉检查发现并修复了重投影尺寸增长、帽子公式估宽、窄运算符标签以及中英混排缺字。自动回归检查数学图无公式错误、尺寸覆盖、保存往返和可编辑字体子集。渲染成功仍不等同于所有工程视觉合格；原生 WebView 与 Windows 字体输出须实机复核。

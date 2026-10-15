# 学术场景范例

六张图用于检查矩阵、公式、配色与排版是否一致。工程与导出在 [`examples/academic/`](../examples/academic)；16 条通用场景见 [scenarios.md](scenarios.md) 与 [`examples/scenarios/`](../examples/scenarios)。

缺省字号、间距与 `style.role` 以代码 [`packages/core/src/academic.ts`](../packages/core/src/academic.ts) 为准；属性面板可改 `fontSize` 与各语义字段。

## 六张图

| 文件前缀 | 检查重点 |
| --- | --- |
| `position-encoding` | Token 嵌入 X 与位置编码 P 同形相加得 Z；sin/cos 按通道定义 |
| `layer-norm` | 沿特征维 d 对单个 token 归一化；γ、β 仿射；不跨 token 混统计 |
| `matrix-multiplication` | 2×3 · 3×2 → 2×2；高亮行/列/结果格；c₁₁=58 |
| `scaled-attention` | softmax(QKᵀ/√d_k)；按行归一；再乘 V；数值两位小数 |
| `residual-block` | Y = X + F(X)；形状一致；恒等支路进加法 |
| `gnn-message-passing` | 邻居消息聚合到中心 v；sum 与顺序无关；共享 φ、ψ |

同目录含 `.drawit.json`（可编辑）、`.svg`、`.png`。

```sh
pnpm examples:academic
```

`examples:academic` 会同步更新 [`examples/scenarios/math-matrix.drawit.json`](../examples/scenarios/math-matrix.drawit.json)，与 scenarios 里的「矩阵乘法」样本一致。

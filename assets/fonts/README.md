# 随包字体

- Noto Sans SC Regular / Bold：Google Fonts 的 Noto Sans SC v41 静态 TTF。
- Noto Sans Regular / Bold：Google Fonts 的 Noto Sans v42 静态 TTF，补充数学下标等拉丁字形。
- 版权所有信息保留在字体 name 表中；许可为 [SIL OFL 1.1](OFL.txt)。

来源：[Noto CJK 项目](https://github.com/notofonts/noto-cjk)、[Noto Sans](https://fonts.google.com/noto/specimen/Noto+Sans)。本地文件不依赖联网加载。SVG 中仅嵌入实际使用的字形子集及许可证，保留文字对象。

`scripts/font-metrics.mjs` 根据 Regular 字体生成 `packages/core/src/fontMetrics.ts`。更换字体后须重新生成宽度表、六张学术图及既有场景预览，并核对中英混排、下标和换行。

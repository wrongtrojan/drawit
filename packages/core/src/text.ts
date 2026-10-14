export function estimateCharWidth(fontSize: number): number {
  return Math.max(1, fontSize * 0.56);
}

export function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const width = Math.max(1, maxWidth);
  for (const paragraph of text.split(/\r?\n/)) {
    const chars = Array.from(paragraph);
    if (!chars.length) { lines.push(""); continue; }
    let offset = 0;
    while (offset < chars.length) {
      let measured = 0;
      let end = offset;
      let space = -1;
      while (end < chars.length) {
        const char = chars[end]!;
        const charWidth = /[\u2e80-\uffff]/u.test(char) || char.codePointAt(0)! > 0xffff ? fontSize : estimateCharWidth(fontSize);
        if (measured + charWidth > width && end > offset) break;
        measured += charWidth;
        if (char === " ") space = end;
        end++;
      }
      if (end < chars.length && space > offset) end = space;
      lines.push(chars.slice(offset, end).join("").trimEnd());
      offset = end;
      while (chars[offset] === " ") offset++;
    }
  }
  return lines.length ? lines : [""];
}

export function lineHeight(fontSize: number): number {
  return fontSize * 1.25;
}

export function textBlockHeight(lineCount: number, fontSize: number): number {
  return Math.max(1, lineCount) * lineHeight(fontSize);
}

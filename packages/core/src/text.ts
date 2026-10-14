export function estimateCharWidth(fontSize: number): number {
  return Math.max(1, fontSize * 0.56);
}

export function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const maxChars = Math.max(1, Math.floor(Math.max(1, maxWidth) / estimateCharWidth(fontSize)));
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    let rest = paragraph;
    while (rest.length > maxChars) {
      let breakAt = rest.lastIndexOf(" ", maxChars);
      if (breakAt <= 0) breakAt = maxChars;
      lines.push(rest.slice(0, breakAt).trimEnd());
      rest = rest.slice(breakAt).trimStart();
    }
    lines.push(rest);
  }
  return lines.length > 0 ? lines : [""];
}

export function lineHeight(fontSize: number): number {
  return fontSize * 1.25;
}

export function textBlockHeight(lineCount: number, fontSize: number): number {
  return Math.max(1, lineCount) * lineHeight(fontSize);
}

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Font } from "fonteditor-core";
import { escapeXml } from "./svg.js";
declare const __DRAWIT_BUNDLED__: boolean;
export const fontDirectory = typeof __DRAWIT_BUNDLED__ !== "undefined" && __DRAWIT_BUNDLED__ ? join(dirname(process.argv[1]!), "fonts") : fileURLToPath(new URL("../../../assets/fonts/", import.meta.url));
const sources = new Map<string, Promise<Buffer>>();
const subsets = new Map<string, string>();
/** Keep editable SVG text portable without embedding the entire CJK font. */
export async function embedDiagramFonts(svg: string): Promise<string> {
  const text = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]!).join("").replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value))).replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"');
  const codes = [...new Set([...text].map((character) => character.codePointAt(0)!))].sort((a, b) => a - b);
  if (!codes.length) return svg;
  const key = codes.join(",");
  let css = subsets.get(key);
  if (!css) {
    css = "";
    for (const [name, weight, family, filePrefix] of [["Regular", 400, "Noto Sans SC", "NotoSansSC"], ["Bold", 700, "Noto Sans SC", "NotoSansSC"], ["Regular", 400, "Noto Sans", "NotoSans"], ["Bold", 700, "Noto Sans", "NotoSans"]] as const) {
      const file = join(fontDirectory, `${filePrefix}-${name}.ttf`);
      if (!sources.has(file)) sources.set(file, readFile(file));
      const font = Font.create(await sources.get(file)!, { type: "ttf", subset: codes, hinting: false });
      const subset = font.write({ type: "ttf", toBuffer: true, hinting: false });
      css += `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/ttf;base64,${subset.toString("base64")}) format('truetype');}`;
    }
    subsets.set(key, css);
    if (subsets.size > 16) subsets.delete(subsets.keys().next().value!);
  }
  // The license travels with standalone exports as well as the installation.
  const license = await readFile(join(fontDirectory, "OFL.txt"), "utf8");
  return svg.replace("<defs>", `<defs><style>${css}</style><metadata>${escapeXml(license)}</metadata>`);
}

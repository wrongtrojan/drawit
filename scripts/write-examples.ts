import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "../packages/core/src/index.ts";
import { renderReviewPng } from "../packages/render/src/png.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = resolve(root, "examples/scenarios");
const output = resolve(root, "examples/scenarios/fig");
await mkdir(output, { recursive: true });
const files = (await readdir(input)).filter((file) => file.endsWith(".drawit.json")).sort();
for (const file of files) {
  const document = parseDocument(JSON.parse(await readFile(resolve(input, file), "utf8")));
  const review = await renderReviewPng(document, { annotateIds: false });
  const name = file.replace(/\.drawit\.json$/, ".png");
  await writeFile(resolve(output, name), review.png);
  console.error(`${name} ${review.png.length}`);
}
console.error(`Wrote ${files.length} figures to ${output}`);

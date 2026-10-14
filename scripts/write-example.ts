import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBinarySearchExample } from "../packages/core/src/example.ts";

const root = dirname(fileURLToPath(import.meta.url));
const target = join(root, "..", "examples", "binary-search.drawit.json");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(createBinarySearchExample(), null, 2)}\n`);

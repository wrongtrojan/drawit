import { cp, mkdir, chmod, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "packages/mcp/package.json"));
const { build } = require("esbuild");
const out = join(root, "apps/desktop/src-tauri/runtime");
await rm(out, { recursive: true, force: true });
await mkdir(join(out, "node_modules/@resvg"), { recursive: true });
await cp(join(root, "assets/fonts"), join(out, "fonts"), { recursive: true });
// Bundle on the target OS/architecture. The installed app uses this private runtime.
const nodeName = process.platform === "win32" ? "node.exe" : "node";
await cp(process.execPath, join(out, nodeName));
await chmod(join(out, nodeName), 0o755);
await cp(dirname(require.resolve("@resvg/resvg-js")), join(out, "node_modules/@resvg/resvg-js"), { recursive: true, dereference: true });
const suffix = process.platform === "linux" ? `${process.platform}-${process.arch}-${process.report.getReport().header.glibcVersionRuntime ? "gnu" : "musl"}` : process.platform === "win32" ? `${process.platform}-${process.arch}-msvc` : `${process.platform}-${process.arch}`;
const binding = `@resvg/resvg-js-${suffix}`;
await cp(dirname(createRequire(require.resolve("@resvg/resvg-js")).resolve(binding)), join(out, "node_modules", binding), { recursive: true, dereference: true });
for (const [entry, file] of [["packages/session/src/main.ts", "session.cjs"], ["packages/mcp/src/index.ts", "mcp.cjs"], ["packages/render/src/render.worker.ts", "render-worker.cjs"]]) {
  await build({ entryPoints: [join(root, entry)], outfile: join(out, file), bundle: true, platform: "node", format: "cjs", target: "node20", define: { __DRAWIT_BUNDLED__: "true" }, external: ["@resvg/resvg-js"], logLevel: "warning" });
}
await writeFile(join(out, "build.json"), JSON.stringify({ platform: process.platform, arch: process.arch, node: process.version }, null, 2));
console.error(`Bundled drawit runtime for ${process.platform}/${process.arch}`);

import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") throw new Error("DMG packaging requires macOS");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = join(root, "apps/desktop/src-tauri/target/release/bundle");
const stage = await mkdtemp(join(tmpdir(), "drawit-dmg-"));
const output = join(bundle, "dmg", `drawit_0.1.0_${process.arch}.dmg`);
try {
  await cp(join(bundle, "macos/drawit.app"), join(stage, "drawit.app"), { recursive: true });
  await symlink("/Applications", join(stage, "Applications"));
  await mkdir(dirname(output), { recursive: true });
  await new Promise((resolve, reject) => {
    const child = spawn("hdiutil", ["create", "-volname", "drawit", "-srcfolder", stage, "-format", "UDZO", "-ov", output], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`hdiutil exited ${code}`)));
  });
  console.error(`Packaged ${output}`);
} finally { await rm(stage, { recursive: true, force: true }); }

import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export function drawitHome(platform = process.platform, env = process.env, userHome = homedir()): string {
  if (env.DRAWIT_HOME) return resolve(env.DRAWIT_HOME);
  if (platform === "win32") return join(env.APPDATA ?? join(userHome, "AppData", "Roaming"), "drawit");
  if (platform === "darwin") return join(userHome, "Library", "Application Support", "drawit");
  const base = env.XDG_DATA_HOME && isAbsolute(env.XDG_DATA_HOME) ? env.XDG_DATA_HOME : join(userHome, ".local", "share");
  return join(base, "drawit");
}


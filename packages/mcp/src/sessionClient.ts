import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import WebSocket from "ws";
import { drawitHome } from "@drawit/core/node";
import type { SessionResponse } from "@drawit/session/protocol";

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function callSession(body: Record<string, unknown>, home = drawitHome()): Promise<SessionResponse | null> {
  let hello: { port?: number; token?: string; pid?: number };
  try {
    hello = JSON.parse(await readFile(join(home, "session.json"), "utf8")) as { port?: number; token?: string; pid?: number };
  } catch {
    return null;
  }
  if (!hello.port || !hello.token || !hello.pid || !pidAlive(hello.pid)) return null;
  const requestId = randomUUID();
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${hello.port}`);
    const timer = setTimeout(() => {
      socket.close();
      resolve(null);
    }, 15000);
    socket.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    socket.on("open", () => socket.send(JSON.stringify({ ...body, requestId, token: hello.token })));
    socket.on("message", (data) => {
      const parsed = JSON.parse(data.toString()) as SessionResponse & { type?: string };
      if (parsed.type === "response" && parsed.requestId === requestId) {
        clearTimeout(timer);
        socket.close();
        resolve(parsed);
      }
    });
  });
}

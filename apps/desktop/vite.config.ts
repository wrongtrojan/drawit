import { readFileSync } from "node:fs";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function sessionEndpoint(): string {
  const home = process.env.DRAWIT_HOME || join(process.env.APPDATA || "", "drawit");
  try {
    return readFileSync(join(home, "session.json"), "utf8");
  } catch {
    return JSON.stringify({ error: "session not ready" });
  }
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "drawit-session",
      configureServer(server) {
        server.middlewares.use("/__drawit/session", (_request, response) => {
          response.setHeader("content-type", "application/json");
          const body = sessionEndpoint();
          response.statusCode = body.includes("session not ready") ? 503 : 200;
          response.end(body);
        });
      },
    },
  ],
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
  },
  clearScreen: false,
});

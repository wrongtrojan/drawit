import { serveStdio, StdioServerTransport, type ServeStdioOptions } from "@modelcontextprotocol/server/stdio";
import type { Transport, JSONRPCMessage } from "@modelcontextprotocol/server";
import { createServer } from "./tools.js";

// The SDK's modern wire calls initialization server/discover. Accept clients
// that retain initialize while attaching the modern envelope as well.
export function serveDrawitStdio(options: ServeStdioOptions = {}) {
  const underlying = options.transport ?? new StdioServerTransport();
  const initializing = new Set<string | number>();
  const transport: Transport = {
    async start() {
      underlying.onclose = () => transport.onclose?.();
      underlying.onerror = (error) => transport.onerror?.(error);
      underlying.onmessage = (message, extra) => {
        if ("method" in message && "id" in message && message.method === "initialize") {
          const meta = message.params?._meta as Record<string, unknown> | undefined;
          if (meta?.["io.modelcontextprotocol/protocolVersion"] === "2026-07-28") {
            initializing.add(message.id);
            message = { ...message, method: "server/discover", params: { _meta: meta } };
          }
        }
        transport.onmessage?.(message, extra);
      };
      await underlying.start();
    },
    async send(message: JSONRPCMessage, sendOptions) {
      if ("id" in message && message.id !== undefined && initializing.delete(message.id) && "result" in message) {
        message = { ...message, result: { ...message.result, protocolVersion: "2026-07-28", serverInfo: { name: "drawit", version: "0.1.0" } } };
      }
      await underlying.send(message, sendOptions);
    },
    async close() { await underlying.close(); },
  };
  return serveStdio(createServer, { ...options, legacy: "serve", transport });
}

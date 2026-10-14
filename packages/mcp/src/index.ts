import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./tools.js";

console.error("drawit MCP server listening on stdio");
void serveStdio(createServer);

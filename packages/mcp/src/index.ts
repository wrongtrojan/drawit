import { serveDrawitStdio } from "./stdio.js";

console.error("drawit MCP server listening on stdio");
serveDrawitStdio({ onerror: (error) => console.error(error.message) });

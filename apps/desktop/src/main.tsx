import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { reportError } from "./diagnostics.js";
import "@xyflow/react/dist/style.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing root");
window.addEventListener("error", (event) => reportError(event.error ?? new Error("window error")));
window.addEventListener("unhandledrejection", (event) => reportError(event.reason));
createRoot(root, { onUncaughtError: (error) => { reportError(error); root.textContent = "界面启动失败。请重新打开此窗口；工程仍在本机会话中。"; }, onCaughtError: () => undefined }).render(<StrictMode><ErrorBoundary scope="application"><App /></ErrorBoundary></StrictMode>);

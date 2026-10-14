import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "katex/dist/katex.min.css";
import "@xyflow/react/dist/style.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing root");
createRoot(root).render(<StrictMode><App /></StrictMode>);

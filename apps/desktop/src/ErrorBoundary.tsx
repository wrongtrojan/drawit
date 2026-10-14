import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "./diagnostics.js";

export class ErrorBoundary extends Component<{ children: ReactNode; scope: "application" | "canvas" | "node"; nodeId?: string; resetKey?: string | number }, { failed: boolean; recovery: number }> {
  state = { failed: false, recovery: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { reportError(error, info.componentStack ?? undefined, { nodeId: this.props.nodeId }); }
  componentDidUpdate(previous: Readonly<typeof this.props>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return <span className="boundary-content" key={this.state.recovery}>{this.props.children}</span>;
    return <div className={`error-recovery ${this.props.scope}`} role="alert">
      <strong>{this.props.scope === "node" ? `对象 ${this.props.nodeId} 暂时无法绘制` : "绘图界面遇到错误，工程仍保留在会话中"}</strong>
      <button onClick={() => this.setState(({ recovery }) => ({ failed: false, recovery: recovery + 1 }))}>重新加载{this.props.scope === "node" ? "此对象" : "此窗口"}</button>
    </div>;
  }
}

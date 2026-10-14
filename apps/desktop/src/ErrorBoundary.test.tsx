import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary.js";
vi.mock("./diagnostics.js", () => ({ reportError: vi.fn() }));
afterEach(cleanup);
it("keeps the editor shell and allows explicit recovery from a canvas render failure", () => {
  let broken = true;
  const Throwing = () => { if (broken) throw new Error("injected render failure"); return <div>画布已恢复</div>; };
  const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
  render(<><div>工具栏</div><ErrorBoundary scope="canvas"><Throwing /></ErrorBoundary></>);
  expect(screen.getByText("工具栏")).toBeTruthy(); expect(screen.getByRole("alert")).toBeTruthy();
  broken = false; fireEvent.click(screen.getByText("重新加载此窗口")); expect(screen.getByText("画布已恢复")).toBeTruthy(); quiet.mockRestore();
});
// @vitest-environment jsdom

// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App.js";
const harness = vi.hoisted(() => ({ clients: [] as Array<any>, revision: 0 }));
vi.mock("./sessionClient.js", async (original) => {
  const module = await original<typeof import("./sessionClient.js")>();
  return { ...module, discoverSession: async () => ({ port: 1000, token: "test" }), EditorSocket: class {
    connected = false; connections = 0; closed = 0; subscriptions = 0;
    onDisconnect: (() => void) | null = null; onEvent = null; onProtocolError = null;
    constructor() { harness.clients.push(this); }
    async connect() { this.connections++; this.connected = true; }
    close() { this.closed++; this.connected = false; }
    async request(body: { type: string }) {
      if (body.type === "subscribe") this.subscriptions++;
      return { type: "response", requestId: "test", ok: true, sessionId: "host", documentEpoch: 0, dirty: false, records: [], document: body.type === "subscribe" ? { schemaVersion: 1, documentId: "strict", title: "StrictMode", revision: harness.revision, canvas: { width: 1000, height: 800 }, nodes: [], edges: [] } : undefined };
    }
  } };
});
vi.mock("./Canvas.js", () => ({ Canvas: ({ document }: { document: { revision: number } }) => <div>画布版本 {document.revision}</div> }));
vi.mock("./Palette.js", () => ({ Palette: () => null }));
vi.mock("./Properties.js", () => ({ Properties: () => null }));
vi.mock("./Toolbar.js", () => ({ Toolbar: () => null }));
vi.mock("./StatusBar.js", () => ({ StatusBar: () => null }));
afterEach(() => { vi.useRealTimers(); harness.clients = []; harness.revision = 0; });
it("keeps one active subscription through StrictMode, reconnects and cleans the unmounted effect", async () => {
  const mounted = render(<StrictMode><App /></StrictMode>);
  await screen.findByText("画布版本 0");
  const active = harness.clients.filter((client) => client.connected);
  expect(active).toHaveLength(1); expect(active[0].subscriptions).toBe(1);
  expect(harness.clients.some((client) => client.closed > 0 && client.connections === 0)).toBe(true);
  vi.useFakeTimers(); harness.revision = 4;
  await act(async () => { active[0].connected = false; active[0].onDisconnect(); await vi.advanceTimersByTimeAsync(301); });
  expect(screen.getByText("画布版本 4")).toBeTruthy(); expect(active[0].connections).toBe(2); expect(active[0].subscriptions).toBe(2);
  mounted.unmount(); expect(active[0].connected).toBe(false); expect(active[0].onDisconnect).toBeNull(); expect(active[0].onEvent).toBeNull(); expect(vi.getTimerCount()).toBe(0);
});

import { isContainerNode, componentById, parseDocument, type ComponentDefinition, type DiagramDocument, type DiagramOperation, type Issue, type NodePatch, type OperationRecord } from "@drawit/core";
import type { Connection, ReactFlowInstance } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "./Canvas.js";
import { Palette } from "./Palette.js";
import { Properties } from "./Properties.js";
import { captureElements, pasteElements, duplicateElements } from "./project.js";
import { discoverSession, EditorSocket, RevisionGate } from "./sessionClient.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { diagnosticContext, reportError } from "./diagnostics.js";
import type { SessionResponse } from "@drawit/session/protocol";
import { StatusBar } from "./StatusBar.js";
import { isEditingTarget, isMac, shortcut, type EditorAction } from "./keyboard.js";
import { Toolbar } from "./Toolbar.js";
import { saveDocument, exportDocument, externalFile, nativeInvoke } from "./nativeFiles.js";

export function App() {
  const socket = useRef(new EditorSocket());
  const flow = useRef<ReactFlowInstance | null>(null);
  const [document, setDocument] = useState<DiagramDocument | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [warnings, setWarnings] = useState<Issue[]>([]);
  const [records, setRecords] = useState<OperationRecord[]>([]);
  const [message, setMessage] = useState("正在连接");
  const [logOpen, setLogOpen] = useState(false);
  const [history, setHistory] = useState({ undo: false, redo: false });
  const revision = useRef(0);
  const documentId = useRef<string | undefined>(undefined);
  const gate = useRef(new RevisionGate());
  const selectionRef = useRef<string[]>([]);
  const clipboard = useRef<DiagramDocument | null>(null);
  const [documents, setDocuments] = useState<NonNullable<SessionResponse["documents"]> | null>(null);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [externalChanged, setExternalChanged] = useState(false);
  const [externalNative, setExternalNative] = useState(false);
  const [savePath, setSavePath] = useState<string | null>(null);
  const fileBusy = useRef(false);
  const [mcpConfig, setMcpConfig] = useState<string | null>(null);

  const select = useCallback((ids: string[]) => {
    if (selectionRef.current.slice().sort().join("\0") === ids.slice().sort().join("\0")) return;
    selectionRef.current = ids;
    setSelection(ids);
    void socket.current.request({ type: "setView", selection: ids }).catch(() => setMessage("选择未同步：会话已断开"));
  }, []);

  const refreshLog = useCallback(async () => {
    const response = await socket.current.request({ type: "log" });
    if (response.ok && response.records) setRecords(response.records);
  }, []);

  const accept = useCallback((response: SessionResponse, authoritative = false) => {
    if (!gate.current.accept(response, authoritative)) return;
    if (response.document) {
      const ids = selectionRef.current.filter((id) => response.document!.nodes.some((node) => node.id === id) || response.document!.edges.some((edge) => edge.id === id));
      selectionRef.current = ids;
      setSelection(ids);
      setDocument(response.document);
      revision.current = response.document.revision;
      documentId.current = response.document.documentId;
      diagnosticContext({ documentId: response.document.documentId, revision: response.document.revision });
    }
    if (response.dirty !== undefined) setDirty(response.dirty);
    if (response.warnings) setWarnings(response.warnings);
    if (response.canUndo !== undefined || response.canRedo !== undefined) {
      setHistory({ undo: Boolean(response.canUndo), redo: Boolean(response.canRedo) });
    }
  }, []);

  const apply = useCallback(async (operations: DiagramOperation[]) => {
    if (!operations.length || !socket.current.connected) return;
    const response = await socket.current.request({ type: "apply", expectedDocumentId: documentId.current, expectedRevision: revision.current, operations, source: "gui" }).catch((error) => { setMessage(error instanceof Error ? error.message : "会话请求失败"); return null; });
    if (!response) return;
    if (!response.ok) {
      setMessage(response.message ?? "操作没有执行");
      accept(response);
      if (response.code === "REVISION_CONFLICT") {
        const latest = await socket.current.request({ type: "get" });
        accept(latest);
      }
      return;
    }
    accept(response);
    setMessage(response.operationId ? `已应用 ${response.operationId}` : "已更新");
    await refreshLog();
  }, [accept, refreshLog]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let subscribed = false;
    const client = new EditorSocket();
    socket.current = client;
    const retry = () => {
      if (cancelled) return;
      subscribed = false; setConnected(false);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => void connect(), Math.min(5000, 300 * 2 ** Math.min(failures++, 5)));
    };
    client.onDisconnect = () => { if (!cancelled) { setMessage("本机会话已断开，正在重新连接；写入已暂停"); retry(); } };
    client.onProtocolError = (error) => { reportError(error); setMessage("会话消息无效；当前工程未被替换"); };
    client.onEvent = (event) => {
      if (cancelled || !subscribed || !gate.current.accept(event)) return;
      if (event.document) accept({ ...event, type: "response", requestId: "event", ok: true });
      if (event.event === "externalChange") { setExternalNative(false); setExternalChanged(true); setMessage("工程文件被外部修改；当前内容未被覆盖"); }
      if (event.event === "view" && event.view && selectionRef.current.slice().sort().join("\0") !== event.view.selection.slice().sort().join("\0")) {
        selectionRef.current = event.view.selection; setSelection(event.view.selection);
      }
      if (event.record) setMessage(`${event.record.source} 更新到版本 ${event.record.revision}`);
    };
    const connect = async () => {
      try {
        const session = await discoverSession();
        if (cancelled) return;
        await client.connect(session.port, session.token);
        if (cancelled) return;
        const snapshot = await client.request({ type: "subscribe" });
        if (cancelled) return;
        if (!snapshot.ok || !snapshot.document) throw new Error("会话未返回有效工程");
        accept(snapshot, true); subscribed = true; failures = 0; setConnected(true);
        setMessage(`${snapshot.document.title} · 版本 ${snapshot.document.revision}`);
        await refreshLog();
      } catch (error) {
        if (!cancelled) { client.close(); setMessage(error instanceof Error ? error.message : "会话未就绪"); retry(); }
      }
    };
    void connect();
    return () => { cancelled = true; clearTimeout(retryTimer); client.onDisconnect = null; client.onEvent = null; client.close(); };
  }, [accept, refreshLog]);

  const request = useCallback(async (body: Record<string, unknown>, success?: string) => {
    try {
      const response = await socket.current.request(body);
      if (!response.ok) { setMessage(response.message ?? "操作失败"); return false; }
      accept(response);
      if (success) setMessage(success);
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "会话请求失败"); return false; }
  }, [accept]);

  const save = useCallback(async (force = false) => {
    if (!documentId.current || !socket.current.connected || fileBusy.current) return;
    fileBusy.current = true;
    try {
      const result = await saveDocument(socket.current, documentId.current, force);
      if (result.cancelled) return setMessage("已取消保存；未写入文件");
      if (result.response) accept(result.response);
      const path = result.receipt?.path ?? result.response?.path;
      if (path) setSavePath(path);
      setMessage(`已保存版本 ${result.response?.savedRevision ?? result.response?.revision} 到 ${path}${result.response?.dirty ? "；新修改仍未保存" : ""}`);
    } catch (error) { setMessage(`保存失败：${error instanceof Error ? error.message : String(error)}；未保存状态保留`); }
    finally { fileBusy.current = false; }
  }, [accept]);

  useEffect(() => {
    if (!document || !connected || !nativeInvoke()) return;
    let cancelled = false; let checking = false; setSavePath(null);
    const check = async () => {
      if (checking) return; checking = true;
      try { const value = await externalFile(document.documentId); if (!cancelled && value) { if (value.path) setSavePath(value.path); if (value.changed) { setExternalChanged(true); setExternalNative(true); } } }
      catch { if (!cancelled) { setExternalChanged(true); setExternalNative(true); setMessage("选定保存目录或文件已失效，请重新选择"); } }
      finally { checking = false; }
    };
    void check(); const timer = setInterval(() => void check(), 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [document?.documentId, connected]);

  const action = useCallback(async (name: EditorAction) => {
    if (!document) return;
    const nodeIds = selection.filter((id) => document.nodes.some((node) => node.id === id));
    const edgeIds = selection.filter((id) => document.edges.some((edge) => edge.id === id));
    if (name === "save") return save();
    if (name === "undo" || name === "redo") return request({ type: name, expectedDocumentId: documentId.current, expectedRevision: revision.current, source: "gui" });
    if (name === "selectAll") return select([...document.nodes.map((node) => node.id), ...document.edges.map((edge) => edge.id)]);
    if (name === "escape") return select([]);
    if (name === "fit") { void flow.current?.fitView(); return; }
    if (name === "zoomIn" || name === "zoomOut") { void flow.current?.zoomTo(Math.max(0.1, Math.min(2, (flow.current?.getZoom() ?? 1) + (name === "zoomIn" ? 0.1 : -0.1)))); return; }
    if (name === "copy" || name === "cut") {
      if (!nodeIds.length && !edgeIds.length) return;
      clipboard.current = captureElements(document, selection);
      await navigator.clipboard?.writeText(JSON.stringify({ format: "drawit-clipboard", document: clipboard.current })).catch(() => undefined);
      setMessage(name === "copy" ? "已复制选中对象" : "已剪切选中对象");
      if (name === "cut") await apply([{ op: "deleteElements", nodeIds, edgeIds }]);
      return;
    }
    if (name === "paste") {
      // The in-app clipboard also works when system clipboard permissions are unavailable.
      try {
        const data = JSON.parse(await navigator.clipboard.readText());
        if (data.format === "drawit-clipboard") clipboard.current = parseDocument(data.document);
      } catch { /* Keep the in-app clipboard when system clipboard access is unavailable. */ }
      if (clipboard.current) await apply(pasteElements(clipboard.current));
      return;
    }
    if (name === "duplicate") return apply(duplicateElements(document, selection, 0));
    if (name === "group" && nodeIds.length) return apply([{ op: "group", nodeIds }]);
    if (name === "delete" && nodeIds.length + edgeIds.length) return apply([{ op: "deleteElements", nodeIds, edgeIds }]);
    const delta = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[name as "left" | "right" | "up" | "down"];
    if (delta && nodeIds.length) {
      const grid = document.canvas.gridSize ?? 20;
      const updates = document.nodes.filter((node) => nodeIds.includes(node.id) && !(node.parentId && nodeIds.includes(node.parentId))).map((node) => ({ id: node.id, patch: { x: node.x + delta[0]! * grid, y: node.y + delta[1]! * grid } }));
      await apply([{ op: "updateNodes", updates }]);
    }
  }, [apply, document, request, save, select, selection]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isEditingTarget(event.target) || event.isComposing) return;
      const name = shortcut(event, isMac());
      if (!name) return;
      event.preventDefault();
      void action(name).catch((error) => setMessage(error instanceof Error ? error.message : "操作失败"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [action]);

  const createComponent = (component: ComponentDefinition, position?: { x: number; y: number }) => {
    if (!document) return;
    const node = component.create();
    node.x = position?.x ?? 80 + document.nodes.length * 16;
    node.y = position?.y ?? 80 + document.nodes.length * 12;
    const lines = document.nodes.filter((item) => item.type === "lifeline");
    if (node.type === "message" || node.type === "activation") {
      const line = lines.find((item) => selection.includes(item.id)) ?? lines[0];
      if (!line) { setMessage("请先添加生命线"); return; }
      node.parentId = line.parentId;
      node.y = Math.max(line.y + 64, position?.y ?? line.y + 100);
      if (node.type === "message") { node.sourceId = line.id; node.targetId = (lines.find((item) => item.id !== line.id && item.parentId === line.parentId) ?? line).id; }
      else node.lifelineId = line.id;
    }
    if (node.type === "annotation") node.targetId = document.nodes.find((item) => selection.includes(item.id))?.id;
    void apply([{ op: "addNodes", nodes: [node] }]);
  };

  if (!document) {
    return <main className="loading">{message}</main>;
  }

  const onDrop = (event: React.DragEvent) => {
    const id = event.dataTransfer.getData("application/drawit-component");
    const component = componentById(id);
    const instance = flow.current;
    if (!component || !instance) return;
    const position = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    createComponent(component, position);
  };

  return (
    <div className={`app ${!connected ? "is-offline" : ""} ${paletteCollapsed ? "palette-collapsed" : ""}`}>
      <Toolbar
        canUndo={history.undo}
        canRedo={history.redo}
        onNew={() => void socket.current.request({ type: "create", title: "未命名图示", source: "gui" }).then((response) => {
          if (!response.ok) return setMessage(response.message ?? "无法新建");
          accept(response);
          setMessage("已新建");
        })}
        onOpen={() => void socket.current.request({ type: "list" }).then((response) => {
          if (!response.ok) return setMessage(response.message ?? "无法读取文档库");
          setDocuments(response.documents ?? []);
        }).catch(() => setMessage("无法读取文档库"))}
        onImport={(file) => void file.text().then(async (text) => {
          const response = await socket.current.request({ type: "import", json: JSON.parse(text), source: "gui" });
          if (!response.ok) return setMessage(response.message ?? "导入失败");
          accept(response);
          setMessage("已导入");
        }).catch(() => setMessage("导入失败"))}
        onSave={() => void action("save")}
        onSaveAs={() => void save(true)}
        onUndo={() => void action("undo")}
        onRedo={() => void action("redo")}
        onCopy={() => void action("copy")}
        onCut={() => void action("cut")}
        onPaste={() => void action("paste")}
        onArrange={(op, axis) => {
          const nodeIds = selection.filter((id) => document.nodes.some((node) => node.id === id));
          if (op === "snapToGrid" && nodeIds.length) void apply([{ op, nodeIds }]);
          if (op === "align" && nodeIds.length >= 2) void apply([{ op, nodeIds, axis: axis as "left" | "center" | "right" | "top" | "middle" | "bottom" }]);
          if (op === "distribute" && nodeIds.length >= 3) void apply([{ op, nodeIds, axis: axis as "horizontal" | "vertical" }]);
        }}
        onLayout={(direction) => void socket.current.request({ type: "layout", expectedDocumentId: documentId.current, expectedRevision: revision.current, direction, source: "gui" }).then((response) => {
          if (!response.ok) return setMessage(response.message ?? "布局失败");
          accept(response);
          setMessage("已自动布局");
        })}
        onFit={() => flow.current?.fitView()}
        onZoom={(delta) => flow.current?.zoomTo((flow.current.getZoom() ?? 1) + delta)}
        onExport={(format) => {
          if (fileBusy.current || !connected) return;
          fileBusy.current = true;
          void exportDocument(socket.current, document.documentId, format).then((result) => {
            if (result.cancelled) return setMessage("已取消导出；未写入文件");
            if (result.receipt) return setMessage(`已导出版本 ${result.receipt.revision} 到 ${result.receipt.path}`);
            const response = result.response!;
            const blob = format === "svg" ? new Blob([response.svg ?? ""], { type: "image/svg+xml" }) : new Blob([Uint8Array.from(atob(response.pngBase64 ?? ""), (char) => char.charCodeAt(0))], { type: "image/png" });
            const url = URL.createObjectURL(blob); const link = window.document.createElement("a");
            link.href = url; link.download = `${document.title}.${format}`; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage(`已导出到 ${response.exportPath ?? "下载目录"}`);
          }).catch((error) => setMessage(`导出失败：${String(error)}`)).finally(() => { fileBusy.current = false; });
        }}
        onDelete={() => {
          const nodeIds = selection.filter((id) => document.nodes.some((node) => node.id === id));
          const edgeIds = selection.filter((id) => document.edges.some((edge) => edge.id === id));
          if (nodeIds.length + edgeIds.length === 0) return;
          void apply([{ op: "deleteElements", nodeIds, edgeIds }]);
        }}
        onDuplicate={() => void action("duplicate")}
        onGroup={() => {
          const nodeIds = selection.filter((id) => document.nodes.some((node) => node.id === id));
          if (nodeIds.length === 0) return;
          void apply([{ op: "group", nodeIds }]);
        }}
        onUngroup={() => {
          const container = document.nodes.find((node) => selection.includes(node.id) && isContainerNode(node));
          if (!container) return setMessage("请选择一个容器");
          void apply([{ op: "ungroup", containerId: container.id }]);
        }}
        onLayer={(delta) => {
          const node = document.nodes.find((item) => item.id === selection[0]);
          if (!node) return;
          void apply([{ op: "updateNodes", updates: [{ id: node.id, patch: { zIndex: (node.zIndex ?? 0) + delta } }] }]);
        }}
      />
      <Palette collapsed={paletteCollapsed} onToggle={() => setPaletteCollapsed((value) => !value)} onCreate={createComponent} />
      <main className="canvas" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
        <ErrorBoundary scope="canvas" resetKey={document.documentId}><Canvas
          readOnly={!connected}
          document={document}
          selection={selection}
          onInit={(instance) => { flow.current = instance; }}
          onSelection={select}
          onMove={(id, x, y) => void apply([{ op: "updateNodes", updates: [{ id, patch: { x, y } }] }])}
          onResize={(id, width, height) => void apply([{ op: "updateNodes", updates: [{ id, patch: { width, height } }] }])}
          onConnect={(connection: Connection) => {
            if (!connection.source || !connection.target) return;
            const handle = (value: string | null | undefined) => value === "top" || value === "right" || value === "bottom" || value === "left" ? value : undefined;
            void apply([{ op: "connect", edges: [{ source: connection.source, target: connection.target, sourceHandle: handle(connection.sourceHandle), targetHandle: handle(connection.targetHandle) }] }]);
          }}
        /> </ErrorBoundary>
      </main>
      {externalChanged ? <div className="external-warning" role="alert"><span>工程文件已被外部修改。</span><button onClick={() => void (async () => {
        try {
          if (externalNative) {
            const value = await externalFile(document.documentId, true);
            if (!value?.payload) throw new Error("外部文件不可读");
            const ok = await request({ type: "reloadSnapshot", json: JSON.parse(value.payload), expectedDocumentId: document.documentId, expectedRevision: revision.current, source: "gui" }, "已重新加载外部文件");
            if (ok) { await externalFile(document.documentId, false, value.fingerprint); setExternalChanged(false); }
          } else if (await request({ type: "reload", expectedDocumentId: document.documentId, source: "gui" }, "已重新加载外部文件")) setExternalChanged(false);
        } catch (error) { setMessage(`重新加载失败：${String(error)}`); }
      })()}>重新加载{dirty ? "（丢弃未保存修改）" : ""}</button><button onClick={() => setExternalChanged(false)}>保留当前内容</button></div> : null}
      <Properties
        document={document}
        selection={selection}
        onPatch={(id, patch: NodePatch) => void apply([{ op: "updateNodes", updates: [{ id, patch }] }])}
        onEdgePatch={(id, patch) => {
          const edge = document.edges.find((item) => item.id === id);
          if (!edge) return;
          void apply([{ op: "connect", edges: [{ ...edge, label: typeof patch.label === "string" ? patch.label : edge.label }] }]);
        }}
        onTitle={(title) => void apply([{ op: "updateDocument", patch: { title } }])}
      />
      {documents !== null ? <div className="modal-backdrop" onClick={() => setDocuments(null)}>
        <section className="document-dialog" role="dialog" aria-modal="true" aria-label="打开文档" onClick={(event) => event.stopPropagation()}>
          <div className="dialog-heading"><h2>打开文档</h2><button onClick={() => setDocuments(null)} aria-label="关闭">×</button></div>
          {dirty ? <p className="muted">请先保存当前文档，再切换。</p> : null}
          {documents.length === 0 ? <p>文档库是空的。</p> : documents.map((item) => <button className="document-entry" key={item.documentId} disabled={dirty && item.documentId !== document.documentId} onClick={() => {
            void request({ type: "open", documentId: item.documentId, source: "gui" }, `已打开 ${item.title}`).then(() => setDocuments(null));
          }}><strong>{item.title}</strong><span>版本 {item.revision} · {item.documentId}</span></button>)}
        </section>
      </div> : null}
      {mcpConfig ? <div className="modal-backdrop" onClick={() => setMcpConfig(null)}><section className="document-dialog" role="dialog" aria-modal="true" aria-label="MCP 配置" onClick={(event) => event.stopPropagation()}><div className="dialog-heading"><h2>Cursor / Claude Desktop 配置</h2><button onClick={() => setMcpConfig(null)}>关闭</button></div><textarea readOnly rows={12} value={mcpConfig} onFocus={(event) => event.target.select()} /></section></div> : null}
      <StatusBar savePath={savePath} connected={connected} revision={document.revision} dirty={dirty} warnings={warnings} records={records} message={message} onCopyConfig={() => {
        const tauri = (window as unknown as { __TAURI_INTERNALS__?: { invoke: (command: string) => Promise<unknown> } }).__TAURI_INTERNALS__;
        if (!tauri) return setMessage("浏览器开发模式请使用 docs/mcp.md 中的配置");
        void tauri.invoke("drawit_mcp_config").then(async (config) => {
          const json = JSON.stringify(config, null, 2);
          setMcpConfig(json);
          await navigator.clipboard.writeText(json).then(() => setMessage("已复制 MCP 配置"), () => setMessage("请选择配置文本并复制"));
        }).catch(() => setMessage("无法生成 MCP 配置"));
      }} open={logOpen} onToggle={() => setLogOpen((value) => !value)} />
    </div>
  );
}

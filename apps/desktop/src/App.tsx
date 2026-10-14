import { componentById, type DiagramDocument, type DiagramOperation, type Issue, type NodePatch, type OperationRecord } from "@drawit/core";
import type { Connection, ReactFlowInstance } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "./Canvas.js";
import { Palette } from "./Palette.js";
import { Properties } from "./Properties.js";
import { duplicateElements } from "./project.js";
import { discoverSession, EditorSocket } from "./sessionClient.js";
import type { SessionResponse } from "@drawit/session/protocol";
import { StatusBar } from "./StatusBar.js";
import { Toolbar } from "./Toolbar.js";

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

  const refreshLog = useCallback(async () => {
    const response = await socket.current.request({ type: "log" });
    if (response.ok && response.records) setRecords(response.records);
  }, []);

  const accept = useCallback((response: SessionResponse) => {
    if (response.document) {
      setDocument(response.document);
      revision.current = response.document.revision;
    }
    if (response.dirty !== undefined) setDirty(response.dirty);
    if (response.warnings) setWarnings(response.warnings);
    if (response.canUndo !== undefined || response.canRedo !== undefined) {
      setHistory({ undo: Boolean(response.canUndo), redo: Boolean(response.canRedo) });
    }
  }, []);

  const apply = useCallback(async (operations: DiagramOperation[]) => {
    const response = await socket.current.request({ type: "apply", expectedRevision: revision.current, operations, source: "gui" });
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
    const connect = async () => {
      for (let attempt = 0; attempt < 20 && !cancelled; attempt += 1) {
        try {
          const session = await discoverSession();
          await socket.current.connect(session.port, session.token);
          socket.current.onEvent = (event) => {
            if (event.event === "revision" && event.document) {
              setDocument(event.document);
              revision.current = event.document.revision;
              setDirty(event.dirty ?? true);
              setWarnings(event.warnings ?? []);
              if (event.canUndo !== undefined || event.canRedo !== undefined) {
                setHistory({ undo: Boolean(event.canUndo), redo: Boolean(event.canRedo) });
              }
              if (event.record) setMessage(`${event.record.source} 更新到版本 ${event.record.revision}`);
            }
            if (event.event === "saved" && event.document) {
              setDocument(event.document);
              setDirty(false);
              if (event.canUndo !== undefined || event.canRedo !== undefined) {
                setHistory({ undo: Boolean(event.canUndo), redo: Boolean(event.canRedo) });
              }
            }
            if (event.event === "view" && event.view) setSelection(event.view.selection);
          };
          const snapshot = await socket.current.request({ type: "subscribe" });
          if (snapshot.document) {
            setDocument(snapshot.document);
            revision.current = snapshot.document.revision;
            setDirty(snapshot.dirty ?? false);
            setWarnings(snapshot.warnings ?? []);
            setConnected(true);
            setMessage(`${snapshot.document.title} · 版本 ${snapshot.document.revision}`);
            await refreshLog();
          }
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
      if (!cancelled) setMessage("无法连接本地绘图会话");
    };
    void connect();
    return () => {
      cancelled = true;
    };
  }, [refreshLog]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        void socket.current.request({ type: event.shiftKey ? "redo" : "undo", expectedRevision: revision.current, source: "gui" });
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void socket.current.request({ type: "save" });
      }
      if (event.key === "Delete" && selection.length > 0 && document) {
        const nodeIds = selection.filter((id) => document.nodes.some((node) => node.id === id));
        const edgeIds = selection.filter((id) => document.edges.some((edge) => edge.id === id));
        void apply([{ op: "deleteElements", nodeIds, edgeIds }]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply, document, selection]);

  if (!document) {
    return <main className="loading">{message}</main>;
  }

  const onDrop = (event: React.DragEvent) => {
    const id = event.dataTransfer.getData("application/drawit-component");
    const component = componentById(id);
    const instance = flow.current;
    if (!component || !instance) return;
    const position = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const node = component.create();
    node.x = position.x;
    node.y = position.y;
    void apply([{ op: "addNodes", nodes: [node] }]);
  };

  return (
    <div className="app">
      <Toolbar
        canUndo={history.undo}
        canRedo={history.redo}
        onNew={() => void socket.current.request({ type: "create", title: "未命名图示", source: "gui" }).then((response) => {
          if (!response.ok) return setMessage(response.message ?? "无法新建");
          accept(response);
          setMessage("已新建");
        })}
        onOpen={() => void socket.current.request({ type: "list" }).then(async (response) => {
          const choice = response.documents?.[0];
          if (!choice) return setMessage("文档库是空的");
          const name = window.prompt("输入要打开的文档 ID", choice.documentId);
          if (!name) return;
          const opened = await socket.current.request({ type: "open", documentId: name, source: "gui" });
          if (!opened.ok) return setMessage(opened.message ?? "无法打开");
          accept(opened);
          setMessage(`已打开 ${name}`);
        })}
        onImport={(file) => void file.text().then(async (text) => {
          const response = await socket.current.request({ type: "import", json: JSON.parse(text), source: "gui" });
          if (!response.ok) return setMessage(response.message ?? "导入失败");
          accept(response);
          setMessage("已导入");
        }).catch(() => setMessage("导入失败"))}
        onSave={() => void socket.current.request({ type: "save" }).then((response) => {
          if (response.ok) accept(response);
          setMessage(response.ok ? "已保存" : response.message ?? "保存失败");
        })}
        onUndo={() => void socket.current.request({ type: "undo", expectedRevision: revision.current, source: "gui" }).then((response) => {
          if (!response.ok) return setMessage(response.message ?? "无法撤销");
          accept(response);
        })}
        onRedo={() => void socket.current.request({ type: "redo", expectedRevision: revision.current, source: "gui" }).then((response) => {
          if (!response.ok) return setMessage(response.message ?? "无法重做");
          accept(response);
        })}
        onLayout={(direction) => void socket.current.request({ type: "layout", expectedRevision: revision.current, direction, source: "gui" }).then((response) => {
          if (!response.ok) return setMessage(response.message ?? "布局失败");
          accept(response);
          setMessage("已自动布局");
        })}
        onFit={() => flow.current?.fitView()}
        onZoom={(delta) => flow.current?.zoomTo((flow.current.getZoom() ?? 1) + delta)}
        onExport={(format) => void socket.current.request({ type: "render", format, fileName: `${document.documentId}.${format}` }).then((response) => {
          if (!response.ok) return setMessage(response.message ?? "导出失败");
          const blob = format === "svg" ? new Blob([response.svg ?? ""], { type: "image/svg+xml" }) : new Blob([Uint8Array.from(atob(response.pngBase64 ?? ""), (char) => char.charCodeAt(0))], { type: "image/png" });
          const url = URL.createObjectURL(blob);
          const link = window.document.createElement("a");
          link.href = url;
          link.download = `${document.title}.${format}`;
          link.click();
          URL.revokeObjectURL(url);
          setMessage(response.exportPath ? `已导出到 ${response.exportPath}` : "已导出");
        })}
        onDelete={() => {
          const nodeIds = selection.filter((id) => document.nodes.some((node) => node.id === id));
          const edgeIds = selection.filter((id) => document.edges.some((edge) => edge.id === id));
          if (nodeIds.length + edgeIds.length === 0) return;
          void apply([{ op: "deleteElements", nodeIds, edgeIds }]);
        }}
        onDuplicate={() => void apply(duplicateElements(document, selection))}
        onGroup={() => {
          const nodeIds = selection.filter((id) => document.nodes.some((node) => node.id === id));
          if (nodeIds.length === 0) return;
          void apply([{ op: "group", nodeIds }]);
        }}
        onUngroup={() => {
          const container = document.nodes.find((node) => selection.includes(node.id) && node.type === "container");
          if (!container) return setMessage("请选择一个容器");
          void apply([{ op: "ungroup", containerId: container.id }]);
        }}
        onLayer={(delta) => {
          const node = document.nodes.find((item) => item.id === selection[0]);
          if (!node) return;
          void apply([{ op: "updateNodes", updates: [{ id: node.id, patch: { zIndex: (node.zIndex ?? 0) + delta } }] }]);
        }}
      />
      <Palette onCreate={(component) => {
        const node = component.create();
        node.x = 80 + document.nodes.length * 16;
        node.y = 80 + document.nodes.length * 12;
        void apply([{ op: "addNodes", nodes: [node] }]);
      }} />
      <main className="canvas" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
        <Canvas
          document={document}
          selection={selection}
          onInit={(instance) => { flow.current = instance; }}
          onSelection={(ids) => {
            setSelection((current) => {
              const nextKey = ids.slice().sort().join("\0");
              const currentKey = current.slice().sort().join("\0");
              return nextKey === currentKey ? current : ids;
            });
          }}
          onMove={(id, x, y) => void apply([{ op: "updateNodes", updates: [{ id, patch: { x, y } }] }])}
          onResize={(id, width, height) => void apply([{ op: "updateNodes", updates: [{ id, patch: { width, height } }] }])}
          onConnect={(connection: Connection) => {
            if (!connection.source || !connection.target) return;
            const handle = (value: string | null | undefined) => value === "top" || value === "right" || value === "bottom" || value === "left" ? value : undefined;
            void apply([{ op: "connect", edges: [{ source: connection.source, target: connection.target, sourceHandle: handle(connection.sourceHandle), targetHandle: handle(connection.targetHandle) }] }]);
          }}
        />
      </main>
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
      <StatusBar connected={connected} revision={document.revision} dirty={dirty} warnings={warnings} records={records} message={message} open={logOpen} onToggle={() => setLogOpen((value) => !value)} />
    </div>
  );
}

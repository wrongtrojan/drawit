import { stylePresets, type DiagramDocument, type DiagramNode, type NodePatch, type StylePresetName } from "@drawit/core";

interface PropertiesProps {
  document: DiagramDocument;
  selection: string[];
  onPatch: (id: string, patch: NodePatch) => void;
  onEdgePatch: (id: string, patch: Record<string, unknown>) => void;
  onTitle: (title: string) => void;
}

export function Properties({ document, selection, onPatch, onEdgePatch, onTitle }: PropertiesProps) {
  const node = document.nodes.find((item) => item.id === selection[0]);
  const edge = document.edges.find((item) => item.id === selection[0]);
  return (
    <aside className="properties">
      <h2>属性</h2>
      <label>
        文档标题
        <input value={document.title} onChange={(event) => onTitle(event.target.value)} />
      </label>
      {node ? <NodeFields node={node} onPatch={(patch) => onPatch(node.id, patch)} /> : null}
      {edge ? (
        <label>
          连线标签
          <input value={edge.label} onChange={(event) => onEdgePatch(edge.id, { label: event.target.value })} />
        </label>
      ) : null}
      {!node && !edge ? <p className="muted">选择一个对象以编辑属性。可以从左侧拖入或点击组件。</p> : null}
    </aside>
  );
}

function NodeFields({ node, onPatch }: { node: DiagramNode; onPatch: (patch: NodePatch) => void }) {
  const text = "text" in node ? node.text : "title" in node ? node.title : "latex" in node ? node.latex : "";
  return (
    <>
      <p className="meta">{node.type} · {node.id}</p>
      <div className="grid-2">
        <NumberField label="X" value={node.x} onChange={(x) => onPatch({ x })} />
        <NumberField label="Y" value={node.y} onChange={(y) => onPatch({ y })} />
        <NumberField label="宽" value={node.width} onChange={(width) => onPatch({ width })} />
        <NumberField label="高" value={node.height} onChange={(height) => onPatch({ height })} />
      </div>
      {"text" in node || node.type === "container" || node.type === "equation" ? (
        <label>
          {node.type === "equation" ? "LaTeX" : "文本"}
          <textarea value={text} rows={node.type === "equation" ? 4 : 3} onChange={(event) => onPatch(textPatch(node, event.target.value))} />
        </label>
      ) : null}
      {node.type === "flowchart" ? (
        <label>
          流程图类型
          <select value={node.kind} onChange={(event) => onPatch({ kind: event.target.value as "terminator" | "process" | "decision" | "io" })}>
            <option value="terminator">起止</option>
            <option value="process">处理</option>
            <option value="decision">判断</option>
            <option value="io">输入输出</option>
          </select>
        </label>
      ) : null}
      {node.type === "matrix" ? <MatrixFields node={node} onPatch={onPatch} /> : null}
      {(node.type === "array" || node.type === "stack" || node.type === "queue") ? (
        <label>
          条目，每行一个
          <textarea value={node.items.join("\n")} rows={5} onChange={(event) => onPatch({ items: event.target.value.split(/\r?\n/) })} />
        </label>
      ) : null}
      <label>
        填充色
        <input value={node.style?.fill ?? "#ffffff"} onChange={(event) => onPatch({ style: { fill: event.target.value } })} />
      </label>
      <label>
        边框色
        <input value={node.style?.stroke ?? "#1f2937"} onChange={(event) => onPatch({ style: { stroke: event.target.value } })} />
      </label>
      <div className="preset-row">
        {(Object.keys(stylePresets) as StylePresetName[]).map((name) => (
          <button key={name} type="button" onClick={() => onPatch({ style: stylePresets[name] })}>{name}</button>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={node.pinned ?? false} onChange={(event) => onPatch({ pinned: event.target.checked })} />
        固定位置，自动布局时不移动
      </label>
    </>
  );
}

function MatrixFields({ node, onPatch }: { node: Extract<DiagramNode, { type: "matrix" }>; onPatch: (patch: NodePatch) => void }) {
  const updateCell = (row: number, column: number, value: string) => {
    const cells = node.cells.map((line) => [...line]);
    const target = cells[row];
    if (!target) return;
    target[column] = value;
    onPatch({ cells });
  };
  return (
    <div className="matrix-editor">
      {node.cells.map((row, rowIndex) => (
        <div key={rowIndex} className="matrix-row">
          {row.map((cell, column) => (
            <input key={column} value={cell} onChange={(event) => updateCell(rowIndex, column, event.target.value)} />
          ))}
        </div>
      ))}
      <div className="preset-row">
        <button type="button" onClick={() => onPatch({ cells: [...node.cells, node.cells[0]?.map(() => "") ?? [""]] })}>加行</button>
        <button type="button" onClick={() => onPatch({ cells: node.cells.map((row) => [...row, ""]) })}>加列</button>
        <button type="button" onClick={() => node.cells.length > 1 && onPatch({ cells: node.cells.slice(0, -1) })}>减行</button>
        <button type="button" onClick={() => (node.cells[0]?.length ?? 0) > 1 && onPatch({ cells: node.cells.map((row) => row.slice(0, -1)) })}>减列</button>
      </div>
    </div>
  );
}

function textPatch(node: DiagramNode, value: string): NodePatch {
  if (node.type === "container") return { title: value };
  if (node.type === "equation") return { latex: value };
  return { text: value };
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      {label}
      <input type="number" value={Number(value.toFixed(1))} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

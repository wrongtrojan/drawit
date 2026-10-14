import { useState } from "react";
import { projectSemanticNode, stylePresets, type DiagramDocument, type DiagramNode, type NodePatch, type StylePresetName } from "@drawit/core";

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
      {node ? <NodeFields key={node.id} nodes={document.nodes} node={node} onPatch={(patch) => onPatch(node.id, patch)} /> : null}
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

function NodeFields({ node, nodes, onPatch }: { node: DiagramNode; nodes: DiagramNode[]; onPatch: (patch: NodePatch) => void }) {
  const visual = projectSemanticNode(nodes, node);
  const text = "text" in node ? node.text : "title" in node ? node.title : "latex" in node ? node.latex : "";
  return (
    <>
      <p className="meta">{node.type} · {node.id}</p>
      <fieldset><legend>几何</legend>
      <div className="grid-2">
        <NumberField label="X" disabled={node.type === "message" || node.type === "activation"} value={visual.x} onChange={(x) => onPatch({ x })} />
        <NumberField label="Y" value={node.y} onChange={(y) => onPatch({ y })} />
        <NumberField label="宽" disabled={node.type === "message"} value={visual.width} onChange={(width) => onPatch({ width })} />
        <NumberField label="高" value={node.height} onChange={(height) => onPatch({ height })} />
      </div>
      </fieldset>
      <fieldset><legend>文字与内容</legend>
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
      {node.type === "table" ? <TableFields node={node} onPatch={onPatch} /> : null}
      {node.type === "message" ? <>
        <ReferenceField label="来源生命线" value={node.sourceId} nodes={nodes.filter((item) => item.type === "lifeline" && item.parentId === node.parentId)} onChange={(sourceId) => onPatch({ sourceId })} />
        <ReferenceField label="目标生命线" value={node.targetId} nodes={nodes.filter((item) => item.type === "lifeline" && item.parentId === node.parentId)} onChange={(targetId) => onPatch({ targetId })} />
        <label>消息类型<select value={node.messageKind} onChange={(event) => onPatch({ messageKind: event.target.value as "sync" | "async" | "return" })}><option value="sync">同步</option><option value="async">异步</option><option value="return">返回</option></select></label>
      </> : null}
      {node.type === "activation" ? <ReferenceField label="生命线" value={node.lifelineId} nodes={nodes.filter((item) => item.type === "lifeline" && item.parentId === node.parentId)} onChange={(lifelineId) => onPatch({ lifelineId })} /> : null}
      {node.type === "annotation" ? <ReferenceField label="标注目标" value={node.targetId ?? ""} nodes={nodes.filter((item) => item.id !== node.id)} optional onChange={(targetId) => onPatch({ targetId: targetId || null })} /> : null}
      </fieldset>
      <fieldset><legend>样式</legend>
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
      </fieldset>
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

function NumberField({ label, value, onChange, disabled }: { label: string; value: number; disabled?: boolean; onChange: (value: number) => void }) {
  return (
    <label>
      {label}
      <input type="number" disabled={disabled} value={Number(value.toFixed(1))} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function ReferenceField({ label, value, nodes, optional, onChange }: { label: string; value: string; nodes: DiagramNode[]; optional?: boolean; onChange: (id: string) => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{optional ? <option value="">无目标</option> : null}{nodes.map((item) => <option key={item.id} value={item.id}>{"text" in item ? item.text : item.id} · {item.id}</option>)}</select></label>;
}

function TableFields({ node, onPatch }: { node: Extract<DiagramNode, { type: "table" }>; onPatch: (patch: NodePatch) => void }) {
  const [row, setRow] = useState(0);
  const [column, setColumn] = useState(0);
  const [rowSpan, setRowSpan] = useState(1);
  const [columnSpan, setColumnSpan] = useState(2);
  const rows = [node.headers, ...node.cells];
  return <div className="table-editor">
    <p className="muted">第一行为表头；合并后显示起始单元格内容。</p>
    {rows.map((cells, r) => <div className="matrix-row" key={r}>{cells.map((cell, c) => <input key={c} aria-label={`${r === 0 ? "表头" : `第 ${r} 行`}第 ${c + 1} 列`} value={cell} onChange={(event) => {
      if (r === 0) onPatch({ headers: node.headers.map((value, index) => index === c ? event.target.value : value) });
      else onPatch({ cells: node.cells.map((line, index) => index === r - 1 ? line.map((value, col) => col === c ? event.target.value : value) : line) });
    }} />)}</div>)}
    <div className="preset-row">
      <button onClick={() => onPatch({ cells: [...node.cells, node.headers.map(() => "")] })}>加行</button>
      <button onClick={() => onPatch({ headers: [...node.headers, "列"], cells: node.cells.map((line) => [...line, ""]) })}>加列</button>
      <button disabled={node.cells.length <= 1} onClick={() => onPatch({ cells: node.cells.slice(0, -1), merges: [] })}>减行</button>
      <button disabled={node.headers.length <= 1} onClick={() => onPatch({ headers: node.headers.slice(0, -1), cells: node.cells.map((line) => line.slice(0, -1)), merges: [] })}>减列</button>
    </div>
    <label>合并起始行<select value={row} onChange={(event) => setRow(Number(event.target.value))}>{rows.map((_, index) => <option key={index} value={index}>{index === 0 ? "表头" : `第 ${index} 行`}</option>)}</select></label>
    <label>合并起始列<select value={column} onChange={(event) => setColumn(Number(event.target.value))}>{node.headers.map((header, index) => <option key={index} value={index}>{header || `第 ${index + 1} 列`}</option>)}</select></label>
    <div className="grid-2"><NumberField label="跨行" value={rowSpan} onChange={setRowSpan} /><NumberField label="跨列" value={columnSpan} onChange={setColumnSpan} /></div>
    <button disabled={!Number.isInteger(rowSpan) || !Number.isInteger(columnSpan) || rowSpan < 1 || columnSpan < 1 || row + rowSpan > rows.length || column + columnSpan > node.headers.length} onClick={() => onPatch({ merges: [...node.merges, { row, column, rowSpan, columnSpan }] })}>添加合并</button>
    {node.merges.map((merge, index) => <div className="merge-entry" key={index}><span>{merge.row === 0 ? "表头" : `第 ${merge.row} 行`} · {node.headers[merge.column]} · {merge.rowSpan}×{merge.columnSpan}</span><button onClick={() => onPatch({ merges: node.merges.filter((_, i) => i !== index) })}>取消合并</button></div>)}
  </div>;
}

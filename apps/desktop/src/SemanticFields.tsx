import { createId, type DiagramNode, type NodePatch, type TreeValue } from "@drawit/core";

function Lines({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) {
  return <label>{label}（每行一项）<textarea rows={4} value={values.join("\n")} onChange={(event) => onChange(event.target.value ? event.target.value.split(/\r?\n/) : [])} /></label>;
}
function Direction({ value, onChange }: { value: "horizontal" | "vertical"; onChange: (value: "horizontal" | "vertical") => void }) {
  return <label>方向<select value={value} onChange={(event) => onChange(event.target.value as "horizontal" | "vertical")}><option value="horizontal">横向</option><option value="vertical">纵向</option></select></label>;
}
export function SemanticFields({ node, onPatch }: { node: DiagramNode; onPatch: (patch: NodePatch) => void }) {
  return <>
    {"name" in node ? <label>{node.type === "class" ? "类名" : node.type === "tensor" ? "张量名" : "名称"}<input value={node.name} onChange={(event) => onPatch({ name: event.target.value })} /></label> : null}
    {node.type === "class" || node.type === "entity" ? <Lines label="属性" values={node.attributes} onChange={(attributes) => onPatch({ attributes })} /> : null}
    {node.type === "class" ? <><Lines label="方法" values={node.methods} onChange={(methods) => onPatch({ methods })} /><label>构造型（可选）<input value={node.stereotype} onChange={(event) => onPatch({ stereotype: event.target.value })} /></label></> : null}
    {node.type === "state" ? <label>状态类型<select value={node.kind} onChange={(event) => onPatch({ kind: event.target.value as "initial" | "state" | "final" })}><option value="initial">初始</option><option value="state">普通状态</option><option value="final">最终</option></select></label> : null}
    {node.type === "swimlane" || node.type === "axis" ? <Direction value={node.direction} onChange={(direction) => onPatch({ direction })} /> : null}
    {node.type === "tensor" ? <label>形状<input value={node.shape} onChange={(event) => onPatch({ shape: event.target.value })} /></label> : null}
    {node.type === "axis" ? <>
      <div className="grid-2"><label>最小值<input type="number" value={node.min} onChange={(event) => onPatch({ min: Number(event.target.value) })} /></label><label>最大值<input type="number" value={node.max} onChange={(event) => onPatch({ max: Number(event.target.value) })} /></label></div>
      {node.ticks.map((tick, index) => <div className="semantic-entry" key={index}><label>刻度值<input type="number" value={tick.value} onChange={(event) => onPatch({ ticks: node.ticks.map((item, i) => i === index ? { ...item, value: Number(event.target.value) } : item) })} /></label><label>刻度标签<input value={tick.label ?? ""} onChange={(event) => onPatch({ ticks: node.ticks.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /></label><button onClick={() => onPatch({ ticks: node.ticks.filter((_, i) => i !== index) })}>移除刻度</button></div>)}
      <button onClick={() => { const boundaries = [...new Set([node.min, ...node.ticks.map((tick) => tick.value), node.max])].sort((a, b) => a - b);
        const gaps = boundaries.slice(1).map((end, index) => ({ start: boundaries[index]!, end })).sort((a, b) => (b.end - b.start) - (a.end - a.start));
        const gap = gaps[0]!; const value = (gap.start + gap.end) / 2;
        if (!node.ticks.some((tick) => tick.value === value)) onPatch({ ticks: [...node.ticks, { value }] }); }}>添加刻度</button>
    </> : null}
    {node.type === "timeline" ? <>{node.milestones.map((item, index) => <div className="semantic-entry" key={index}><label>日期<input type="date" value={item.date} onChange={(event) => { if (event.target.value) onPatch({ milestones: node.milestones.map((entry, i) => i === index ? { ...entry, date: event.target.value } : entry) }); }} /></label><label>里程碑<input value={item.label} onChange={(event) => onPatch({ milestones: node.milestones.map((entry, i) => i === index ? { ...entry, label: event.target.value } : entry) })} /></label><button onClick={() => onPatch({ milestones: node.milestones.filter((_, i) => i !== index) })}>移除里程碑</button></div>)}<button onClick={() => onPatch({ milestones: [...node.milestones, { date: node.milestones.at(-1)?.date ?? "2026-01-01", label: "里程碑" }] })}>添加里程碑</button></> : null}
    {node.type === "tree" ? <TreeFields value={node.root} onChange={(root) => onPatch({ root })} /> : null}
    {node.type === "graph" ? <>
      <label className="check"><input type="checkbox" checked={node.directed} onChange={(event) => onPatch({ directed: event.target.checked })} />有向图</label>
      {node.vertices.map((vertex, index) => <div className="semantic-entry" key={vertex.id}><label>顶点 {vertex.id}<input value={vertex.label} onChange={(event) => onPatch({ vertices: node.vertices.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /></label><button disabled={node.vertices.length === 1} onClick={() => onPatch({ vertices: node.vertices.filter((item) => item.id !== vertex.id), links: node.links.filter((item) => item.source !== vertex.id && item.target !== vertex.id) })}>移除顶点</button></div>)}
      <button onClick={() => onPatch({ vertices: [...node.vertices, { id: createId("v"), label: "顶点" }] })}>添加顶点</button>
      {node.links.map((link, index) => <div className="semantic-entry" key={index}>{(["source", "target"] as const).map((key) => <label key={key}>{key === "source" ? "来源" : "目标"}<select value={link[key]} onChange={(event) => onPatch({ links: node.links.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item) })}>{node.vertices.map((vertex) => <option key={vertex.id} value={vertex.id}>{vertex.label} · {vertex.id}</option>)}</select></label>)}<label>边标签<input value={link.label ?? ""} onChange={(event) => onPatch({ links: node.links.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /></label><button onClick={() => onPatch({ links: node.links.filter((_, i) => i !== index) })}>移除边</button></div>)}
      <button onClick={() => onPatch({ links: [...node.links, { source: node.vertices[0]!.id, target: node.vertices.at(-1)!.id, label: "关系" }] })}>添加边</button>
    </> : null}
    {node.type === "vector" ? <><Lines label="分量" values={node.components} onChange={(components) => onPatch({ components: components.length ? components : [""] })} /><label>排列<select value={node.orientation} onChange={(event) => onPatch({ orientation: event.target.value as "row" | "column" })}><option value="column">列向量</option><option value="row">行向量</option></select></label></> : null}
  </>;
}
function TreeFields({ value, onChange }: { value: TreeValue; onChange: (value: TreeValue) => void }) {
  return <div className="tree-fields"><label>节点标签<input value={value.label} onChange={(event) => onChange({ ...value, label: event.target.value })} /></label>{value.children.map((child, index) => <div key={index}><TreeFields value={child} onChange={(next) => onChange({ ...value, children: value.children.map((item, i) => i === index ? next : item) })} /><button onClick={() => onChange({ ...value, children: value.children.filter((_, i) => i !== index) })}>移除此分支</button></div>)}<button onClick={() => onChange({ ...value, children: [...value.children, { label: "孩子", children: [] }] })}>添加孩子</button></div>;
}

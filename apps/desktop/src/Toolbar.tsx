import { modifierLabel } from "./keyboard.js";

interface ToolbarProps {
  canUndo: boolean; canRedo: boolean;
  onNew: () => void; onOpen: () => void; onImport: (file: File) => void;
  onSave: () => void; onUndo: () => void; onRedo: () => void;
  onSaveAs: () => void;
  onCopy: () => void; onCut: () => void; onPaste: () => void;
  onLayout: (direction: "TB" | "LR" | "BT" | "RL") => void;
  onFit: () => void; onZoom: (delta: number) => void;
  onExport: (format: "svg" | "png") => void;
  onDelete: () => void; onDuplicate: () => void; onGroup: () => void; onUngroup: () => void;
  onLayer: (delta: number) => void;
  onArrange: (op: "align" | "distribute" | "snapToGrid" | "arrangeRow", axis?: string) => void;
}

const paths: Record<string, string> = {
  new: "M12 4v16M4 12h16", open: "M12 3l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 17l8 4 8-4",
  save: "M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-8h8v8",
  undo: "M8 5L3 10l5 5M3 10h10a7 7 0 0 1 7 7", redo: "M16 5l5 5-5 5M21 10H11a7 7 0 0 0-7 7",
  copy: "M9 9h12v12H9zM15 9V3H3v12h6", cut: "M9 9l12 12M9 15L21 3M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  paste: "M8 5H4v16h16V5h-4M8 3h8v4H8z", delete: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
  fit: "M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6M8 8h8v8H8z",
  plus: "M12 4v16M4 12h16", minus: "M4 12h16",
};

function ToolButton({ icon, label, shortcut, onClick, disabled }: { icon: string; label: string; shortcut?: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="tool-icon" title={`${label}${shortcut ? ` (${shortcut})` : ""}`} aria-label={label} disabled={disabled} onClick={onClick}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[icon]} /></svg>
  </button>;
}

export function Toolbar(props: ToolbarProps) {
  const mod = modifierLabel();
  return <header className="toolbar">
    <strong className="wordmark">drawit</strong>
    <ToolButton icon="new" label="新建" onClick={props.onNew} />
    <ToolButton icon="open" label="打开" onClick={props.onOpen} />
    <ToolButton icon="save" label="保存" shortcut={`${mod}S`} onClick={props.onSave} />
    <span className="divider" />
    <ToolButton icon="undo" label="撤销" shortcut={`${mod}Z`} disabled={!props.canUndo} onClick={props.onUndo} />
    <ToolButton icon="redo" label="重做" shortcut={`${mod}Shift+Z / ${mod}Y`} disabled={!props.canRedo} onClick={props.onRedo} />
    <span className="divider" />
    <ToolButton icon="copy" label="复制" shortcut={`${mod}C`} onClick={props.onCopy} />
    <ToolButton icon="cut" label="剪切" shortcut={`${mod}X`} onClick={props.onCut} />
    <ToolButton icon="paste" label="粘贴" shortcut={`${mod}V`} onClick={props.onPaste} />
    <ToolButton icon="delete" label="删除" shortcut="Delete / Backspace" onClick={props.onDelete} />
    <details className="tool-menu"><summary>编辑</summary><div>
      <button onClick={props.onDuplicate}>原位复制 <kbd>{mod}D</kbd></button>
      <button onClick={props.onGroup}>组合 <kbd>{mod}G</kbd></button>
      <button onClick={props.onUngroup}>取消组合</button>
      <button onClick={() => props.onLayer(1)}>上移一层</button><button onClick={() => props.onLayer(-1)}>下移一层</button>
    </div></details>
    <details className="tool-menu"><summary>排列</summary><div>
      {([['left', '左对齐'], ['center', '水平居中'], ['right', '右对齐'], ['top', '顶部对齐'], ['middle', '垂直居中'], ['bottom', '底部对齐']] as const).map(([axis, label]) => <button key={axis} onClick={() => props.onArrange("align", axis)}>{label}</button>)}
      <button onClick={() => props.onArrange("distribute", "horizontal")}>水平分布</button>
      <button onClick={() => props.onArrange("distribute", "vertical")}>垂直分布</button>
      <button onClick={() => props.onArrange("snapToGrid")}>吸附到网格</button>
      <button onClick={() => props.onArrange("arrangeRow")}>同一行排列 · 间距 60</button>
      <hr /><button onClick={() => props.onLayout("TB")}>自动布局 · 自上而下</button>
      <button onClick={() => props.onLayout("LR")}>自动布局 · 从左到右</button>
    </div></details>
    <span className="toolbar-spacer" />
    <ToolButton icon="fit" label="适应画布" shortcut={`${mod}0`} onClick={props.onFit} />
    <ToolButton icon="plus" label="放大" shortcut={`${mod}+`} onClick={() => props.onZoom(0.1)} />
    <ToolButton icon="minus" label="缩小" shortcut={`${mod}-`} onClick={() => props.onZoom(-0.1)} />
    <details className="tool-menu"><summary>文件</summary><div>
      <button onClick={props.onSaveAs}>另存为…</button>
      <label className="file-button">导入工程<input type="file" accept="application/json,.drawit.json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) props.onImport(file); event.target.value = ""; }} /></label>
      <button onClick={() => props.onExport("svg")}>导出 SVG</button><button onClick={() => props.onExport("png")}>导出 PNG</button>
    </div></details>
  </header>;
}

interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onNew: () => void;
  onOpen: () => void;
  onImport: (file: File) => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onLayout: (direction: "TB" | "LR" | "BT" | "RL") => void;
  onFit: () => void;
  onZoom: (delta: number) => void;
  onExport: (format: "svg" | "png") => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onLayer: (delta: number) => void;
}

export function Toolbar(props: ToolbarProps) {
  return (
    <header className="toolbar">
      <button type="button" onClick={props.onNew}>新建</button>
      <button type="button" onClick={props.onOpen}>打开</button>
      <label className="file-button">
        导入
        <input type="file" accept="application/json,.drawit.json,.json" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) props.onImport(file);
          event.target.value = "";
        }} />
      </label>
      <button type="button" onClick={props.onSave}>保存</button>
      <span className="divider" />
      <button type="button" disabled={!props.canUndo} onClick={props.onUndo}>撤销</button>
      <button type="button" disabled={!props.canRedo} onClick={props.onRedo}>重做</button>
      <span className="divider" />
      <button type="button" onClick={props.onDuplicate}>复制</button>
      <button type="button" onClick={props.onDelete}>删除</button>
      <button type="button" onClick={props.onGroup}>组合</button>
      <button type="button" onClick={props.onUngroup}>取消组合</button>
      <button type="button" onClick={() => props.onLayer(1)}>上移</button>
      <button type="button" onClick={() => props.onLayer(-1)}>下移</button>
      <span className="divider" />
      <button type="button" onClick={() => props.onLayout("TB")}>自上而下</button>
      <button type="button" onClick={() => props.onLayout("LR")}>从左到右</button>
      <button type="button" onClick={props.onFit}>适应</button>
      <button type="button" onClick={() => props.onZoom(0.1)}>放大</button>
      <button type="button" onClick={() => props.onZoom(-0.1)}>缩小</button>
      <span className="divider" />
      <button type="button" onClick={() => props.onExport("svg")}>导出 SVG</button>
      <button type="button" onClick={() => props.onExport("png")}>导出 PNG</button>
    </header>
  );
}

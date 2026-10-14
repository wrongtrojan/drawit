import { searchComponents, type ComponentDefinition } from "@drawit/core";
import { useMemo, useState } from "react";

const categories = [
  { id: "basic", label: "基础" },
  { id: "domain", label: "领域" },
  { id: "math", label: "数学" },
] as const;

export function Palette({ onCreate, collapsed, onToggle }: { onCreate: (component: ComponentDefinition) => void; collapsed: boolean; onToggle: () => void }) {
  const [query, setQuery] = useState("");
  const items = useMemo(() => searchComponents(query), [query]);
  return (
    <aside className="palette">
      <button className="palette-toggle" onClick={onToggle} title={collapsed ? "展开组件库" : "折叠组件库"}>{collapsed ? "›" : "‹ 组件库"}</button>
      {!collapsed ? <>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索组件" aria-label="搜索组件" />
      {categories.map((category) => {
        const group = items.filter((item) => item.category === category.id);
        if (group.length === 0) return null;
        return (
          <details key={category.id} open>
            <summary>{category.label}</summary>
            <div className="palette-list">
              {group.map((item) => (
                <button key={item.id} type="button" draggable onDragStart={(event) => event.dataTransfer.setData("application/drawit-component", item.id)} onClick={() => onCreate(item)}>
                  {item.label}
                </button>
              ))}
            </div>
          </details>
        );
      })}
      </> : null}
    </aside>
  );
}

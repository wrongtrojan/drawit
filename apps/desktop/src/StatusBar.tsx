import type { Issue, OperationRecord } from "@drawit/core";

interface StatusBarProps {
  connected: boolean;
  revision: number;
  dirty: boolean;
  warnings: Issue[];
  records: OperationRecord[];
  message: string;
  open: boolean;
  onToggle: () => void;
  onCopyConfig: () => void;
}

export function StatusBar({ connected, revision, dirty, warnings, records, message, open, onToggle, onCopyConfig }: StatusBarProps) {
  return (
    <>
      {open ? (
        <div className="log-drawer">
          <div>
            <strong>校验</strong>
            {warnings.length === 0 ? <p>没有警告。</p> : warnings.map((issue, index) => <p key={`${issue.code}-${index}`}>{issue.severity}: {issue.message}</p>)}
          </div>
          <div>
            <strong>操作记录</strong>
            {records.length === 0 ? <p>还没有操作。</p> : records.slice().reverse().map((record) => <p key={record.operationId}>r{record.revision} {record.source} {record.summary}</p>)}
          </div>
        </div>
      ) : null}
      <footer className="status">
        <span>{connected ? "MCP 会话已连接" : "正在连接会话"}</span>
        <button onClick={onCopyConfig}>复制 MCP 配置</button>
        <span>版本 {revision}</span>
        <span>{dirty ? "未保存" : "已保存"}</span>
        <button type="button" onClick={onToggle}>{warnings.length} 条提示</button>
        <span className="status-message">{message}</span>
      </footer>
    </>
  );
}

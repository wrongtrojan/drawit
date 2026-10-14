import { LIMITS, type DiagramNode } from "@drawit/core";
type Job = { resolve: (markup: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
export class FormulaClient {
  private worker: Worker | null = null;
  private jobs = new Map<number, Job>();
  private cache = new Map<string, Promise<string>>();
  private nextId = 0;
  constructor(private create = () => new Worker(new URL("./formula.worker.ts", import.meta.url), { type: "module" }), private timeout: number = LIMITS.formulaTimeoutMs) {}
  get pendingCount() { return this.jobs.size; }
  get cacheSize() { return this.cache.size; }
  close() {
    this.worker?.terminate(); this.worker = null;
    for (const job of this.jobs.values()) { clearTimeout(job.timer); job.reject(new Error("公式转换已中止")); }
    this.jobs.clear(); this.cache.clear();
  }
  render(node: DiagramNode): Promise<string> {
    const key = JSON.stringify({ ...node, x: 0, y: 0, parentId: undefined, pinned: undefined });
    const cached = this.cache.get(key);
    if (cached) { this.cache.delete(key); this.cache.set(key, cached); return cached; }
    if (this.jobs.size >= 256) return Promise.reject(new Error("公式转换队列已满"));
    if (!this.worker) {
      this.worker = this.create();
      this.worker.onmessage = (event: MessageEvent<{ id: number; markup?: string; error?: string }>) => {
        const job = this.jobs.get(event.data.id); if (!job) return;
        clearTimeout(job.timer); this.jobs.delete(event.data.id);
        if (event.data.error) job.reject(new Error(event.data.error)); else job.resolve(event.data.markup ?? "");
      };
      const worker = this.worker;
      this.worker.onerror = () => { if (this.worker === worker) this.close(); };
    }
    const id = ++this.nextId;
    const result = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => this.close(), this.timeout);
      this.jobs.set(id, { resolve, reject, timer });
      this.worker!.postMessage({ id, node });
    });
    this.cache.set(key, result);
    if (this.cache.size > 256) this.cache.delete(this.cache.keys().next().value!);
    void result.catch(() => { if (this.cache.get(key) === result) this.cache.delete(key); });
    return result;
  }
}
export const formulas = new FormulaClient();
window.addEventListener("pagehide", () => formulas.close());

import { Worker } from "node:worker_threads";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { DrawitError, LIMITS } from "@drawit/core";
import type { RenderTask } from "./render.worker.js";
import type { renderReviewPng } from "./png.js";
declare const __DRAWIT_BUNDLED__: boolean;
type Result = { svg?: string; png?: Uint8Array; manifest?: Awaited<ReturnType<typeof renderReviewPng>>["manifest"] };
class RenderJobs {
  private worker?: Worker;
  private nextId = 0;
  private jobs = new Map<number, { resolve: (value: Result) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  run(task: Omit<RenderTask, "id">): Promise<Result> {
    if (this.jobs.size >= 16) return Promise.reject(new DrawitError("EXPORT_FAILED", "Render queue is full"));
    if (!this.worker) {
      const bundled = typeof __DRAWIT_BUNDLED__ !== "undefined" && __DRAWIT_BUNDLED__;
      const location = bundled ? join(dirname(process.argv[1]!), "render-worker.cjs") : new URL("./render.worker.ts", import.meta.url);
      this.worker = new Worker(location, bundled ? {} : { execArgv: ["--import", createRequire(import.meta.url).resolve("tsx")] }); this.worker.unref();
      const worker = this.worker;
      this.worker.on("message", ({ id, result, error }) => { const job = this.jobs.get(id); if (!job) return; clearTimeout(job.timer); this.jobs.delete(id); if (error) job.reject(new DrawitError(error.code, error.message)); else job.resolve(result); if (!this.jobs.size) this.worker?.unref(); });
      worker.on("error", () => { if (this.worker === worker) this.close(); });
      worker.on("exit", (code) => { if (this.worker === worker && code !== 0 && this.jobs.size) this.close(); });
    }
    const id = ++this.nextId;
    return new Promise((resolve, reject) => { const timer = setTimeout(() => this.close(), LIMITS.renderTimeoutMs); this.jobs.set(id, { resolve, reject, timer }); this.worker!.ref(); this.worker!.postMessage({ ...task, id }); });
  }
  close() {
    const worker = this.worker; this.worker = undefined; void worker?.terminate();
    for (const job of this.jobs.values()) { clearTimeout(job.timer); job.reject(new DrawitError("EXPORT_FAILED", "Render worker stopped or exceeded time budget")); }
    this.jobs.clear();
  }
}
export const renderJobs = new RenderJobs();

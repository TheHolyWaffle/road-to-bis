import type { SearchContext, Task, TaskResult } from './task-runner';
import type { WorkerRequest } from './calc-worker';

interface Pending {
  task: Task;
  resolve: (r: TaskResult) => void;
  reject: (e: Error) => void;
}

export class WorkerPool {
  private workers: Worker[] = [];

  private idle: Worker[] = [];

  private queue: (Pending & { id: number })[] = [];

  private inFlight = new Map<number, Pending>();

  private nextId = 0;

  constructor(ctx: SearchContext, size = Math.max(1, (navigator.hardwareConcurrency || 4) - 1)) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL('./calc-worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id: number; result?: TaskResult; error?: string }>) => {
        const pending = this.inFlight.get(e.data.id)!;
        this.inFlight.delete(e.data.id);
        if (e.data.error) pending.reject(new Error(e.data.error));
        else pending.resolve(e.data.result!);
        this.idle.push(w);
        this.pump();
      };
      w.postMessage({ type: 'init', ctx } satisfies WorkerRequest);
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  run = (task: Task): Promise<TaskResult> => new Promise((resolve, reject) => {
    this.queue.push({
      id: this.nextId++, task, resolve, reject,
    });
    this.pump();
  });

  private pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop()!;
      const job = this.queue.shift()!;
      this.inFlight.set(job.id, job);
      w.postMessage({ type: 'task', id: job.id, task: job.task } satisfies WorkerRequest);
    }
  }

  terminate() {
    this.workers.forEach((w) => w.terminate());
    this.queue.forEach((j) => j.reject(new Error('Search cancelled')));
    this.queue = [];
  }
}

import { createTaskRunner, type SearchContext, type Task } from './task-runner';

export type WorkerRequest =
  | { type: 'init'; ctx: SearchContext }
  | { type: 'task'; id: number; task: Task };

let run: ReturnType<typeof createTaskRunner> | null = null;

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    run = createTaskRunner(msg.ctx);
    return;
  }
  try {
    self.postMessage({ id: msg.id, result: run!(msg.task) });
  } catch (err) {
    self.postMessage({ id: msg.id, error: String(err) });
  }
};

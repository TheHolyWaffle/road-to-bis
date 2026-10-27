import { buildPath, type Path, type PathInput } from './path';

export type PathReply = { path: Path; refined: boolean } | { error: string };

/** How widely the refined path searches; see `PathInput.beam`. */
const BEAM = { width: 4, branching: 4 };

// The greedy path comes back first, so there's something to show while the wider search runs.
self.onmessage = (e: MessageEvent<PathInput>) => {
  try {
    self.postMessage({ path: buildPath(e.data), refined: false } satisfies PathReply);
    self.postMessage({ path: buildPath({ ...e.data, beam: BEAM }), refined: true } satisfies PathReply);
  } catch (err) {
    self.postMessage({ error: String(err) } satisfies PathReply);
  }
};

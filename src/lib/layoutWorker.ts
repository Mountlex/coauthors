/**
 * Worker manager for async layout computation
 * Provides Promise-based API and handles worker lifecycle
 */

interface NodeData {
  data: {
    id: string;
    isCenter?: boolean;
    paperCount?: number;
    [key: string]: unknown;
  };
}

interface EdgeData {
  data: {
    id: string;
    source: string;
    target: string;
    weight?: number;
    [key: string]: unknown;
  };
}

interface LayoutResult {
  [nodeId: string]: { x: number; y: number };
}

let worker: Worker | null = null;
let pendingResolve: ((result: LayoutResult) => void) | null = null;
let pendingReject: ((error: Error) => void) | null = null;
let pendingPromise: Promise<LayoutResult> | null = null;

const LAYOUT_TIMEOUT = 30000; // 30 seconds max for layout computation

function getWorker(): Worker | null {
  if (typeof window === 'undefined') return null; // SSR check

  if (!worker) {
    try {
      worker = new Worker(new URL('../workers/layout.worker.ts', import.meta.url));
      worker.onmessage = (event) => {
        const { type, positions, error } = event.data;
        if (type === 'result' && pendingResolve) {
          pendingResolve(positions);
          pendingResolve = null;
          pendingReject = null;
          pendingPromise = null;
        } else if (type === 'error' && pendingReject) {
          pendingReject(new Error(error));
          pendingResolve = null;
          pendingReject = null;
          pendingPromise = null;
        }
      };
      worker.onerror = (error) => {
        if (pendingReject) {
          pendingReject(new Error(`Worker error: ${error.message}`));
          pendingResolve = null;
          pendingReject = null;
          pendingPromise = null;
        }
      };
    } catch {
      // Worker creation failed (e.g., browser doesn't support)
      return null;
    }
  }
  return worker;
}

/**
 * Compute layout asynchronously using Web Worker
 * Falls back to sync computation for small graphs or if workers unavailable
 */
export async function computeLayoutAsync(
  nodes: NodeData[],
  edges: EdgeData[],
  containerWidth: number,
  containerHeight: number,
  centerNodeId: string
): Promise<LayoutResult> {
  // For small graphs, use sync computation (worker overhead not worth it)
  const WORKER_THRESHOLD = 150;

  if (nodes.length < WORKER_THRESHOLD) {
    // Dynamic import to avoid bundling in worker
    const { computeFastLayout } = await import('./fastLayout');
    return computeFastLayout(nodes, edges, containerWidth, containerHeight, centerNodeId);
  }

  const w = getWorker();

  if (!w) {
    // Fallback to sync if workers unavailable
    const { computeFastLayout } = await import('./fastLayout');
    return computeFastLayout(nodes, edges, containerWidth, containerHeight, centerNodeId);
  }

  // If there's already a pending computation, wait for it first
  // (This prevents race conditions with rapid filter toggles)
  if (pendingPromise) {
    try {
      await pendingPromise;
    } catch {
      // Ignore errors from previous computation, we're starting a new one
    }
  }

  pendingPromise = new Promise((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;

    // Set timeout to prevent infinite waits
    const timeoutId = setTimeout(() => {
      if (pendingReject) {
        pendingReject(new Error('Layout computation timed out'));
        pendingResolve = null;
        pendingReject = null;
        pendingPromise = null;
      }
    }, LAYOUT_TIMEOUT);

    w.postMessage({
      type: 'compute',
      nodes,
      edges,
      containerWidth,
      containerHeight,
      centerNodeId,
    });

    // Clear timeout when resolved/rejected
    pendingPromise?.finally(() => clearTimeout(timeoutId));
  });

  return pendingPromise;
}

/**
 * Check if async layout is available
 */
export function isAsyncLayoutAvailable(): boolean {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

/**
 * Terminate the worker (call when unmounting)
 */
export function terminateLayoutWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
    pendingResolve = null;
    pendingReject = null;
    pendingPromise = null;
  }
}

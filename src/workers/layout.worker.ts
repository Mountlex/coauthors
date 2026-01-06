/**
 * Web Worker for graph layout computation
 * Runs ForceAtlas2 layout off the main thread to prevent UI freezing
 */
import forceAtlas2 from "graphology-layout-forceatlas2";
import {
  type NodeData,
  type EdgeData,
  type LayoutResult,
  getAdaptiveFA2Settings,
  createGraph,
  scalePositions,
  resolveOverlaps,
  calculateTotalMovement,
  snapshotPositions,
} from "../lib/layoutCore";

interface WorkerMessage {
  type: 'compute';
  nodes: NodeData[];
  edges: EdgeData[];
  containerWidth: number;
  containerHeight: number;
  centerNodeId: string;
}

function computeLayout(
  nodes: NodeData[],
  edges: EdgeData[],
  containerWidth: number,
  containerHeight: number,
  centerNodeId: string
): LayoutResult {
  const nodeCount = nodes.length;
  const graph = createGraph(nodes, edges, containerWidth, containerHeight, centerNodeId);
  const fa2Settings = getAdaptiveFA2Settings(nodeCount);

  const batchSize = nodeCount > 500 ? 150 : 100;
  const maxIterations = nodeCount > 1000 ? 1500 : nodeCount > 500 ? 2000 : 3000;
  const convergenceThreshold = nodeCount > 500 ? 1.0 * nodeCount : 0.5 * nodeCount;

  let totalIterations = 0;

  while (totalIterations < maxIterations) {
    const previousPositions = snapshotPositions(graph);

    forceAtlas2.assign(graph, {
      iterations: batchSize,
      settings: fa2Settings,
    });

    totalIterations += batchSize;

    const totalMovement = calculateTotalMovement(graph, previousPositions);

    if (totalMovement < convergenceThreshold) break;
  }

  const positions = scalePositions(graph, containerWidth, containerHeight, centerNodeId);
  const minDistance = nodeCount > 500 ? 10 : 15;
  resolveOverlaps(positions, nodes, centerNodeId, minDistance, 50);

  return positions;
}

// Worker message handler
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, nodes, edges, containerWidth, containerHeight, centerNodeId } = event.data;

  if (type === 'compute') {
    try {
      const positions = computeLayout(nodes, edges, containerWidth, containerHeight, centerNodeId);
      self.postMessage({ type: 'result', positions });
    } catch (error) {
      self.postMessage({ type: 'error', error: String(error) });
    }
  }
};

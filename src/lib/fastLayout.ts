/**
 * Fast graph layout using graphology's ForceAtlas2 with Barnes-Hut optimization
 * Much faster than fcose for large graphs (O(n log n) vs O(n²))
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
} from "./layoutCore";

export type { NodeData, EdgeData, LayoutResult };

/**
 * Compute layout positions with convergence detection
 * Adapts parameters based on graph size for optimal performance
 */
export function computeFastLayout(
  nodes: NodeData[],
  edges: EdgeData[],
  containerWidth: number,
  containerHeight: number,
  centerNodeId: string
): LayoutResult {
  const nodeCount = nodes.length;
  const graph = createGraph(nodes, edges, containerWidth, containerHeight, centerNodeId);

  // Adaptive parameters based on graph size
  const fa2Settings = getAdaptiveFA2Settings(nodeCount);

  // Larger graphs converge faster with coarser approximations
  const batchSize = nodeCount > 500 ? 150 : 100;
  const maxIterations = nodeCount > 1000 ? 1500 : nodeCount > 500 ? 2000 : 3000;

  // More lenient convergence for large graphs (they don't need pixel-perfect positioning)
  const convergenceThreshold = nodeCount > 500
    ? 1.0 * nodeCount  // 1px average movement
    : 0.5 * nodeCount; // 0.5px average movement

  let totalIterations = 0;

  while (totalIterations < maxIterations) {
    const previousPositions = snapshotPositions(graph);

    forceAtlas2.assign(graph, {
      iterations: batchSize,
      settings: fa2Settings,
    });

    totalIterations += batchSize;

    const movement = calculateTotalMovement(graph, previousPositions);

    // Check for convergence
    if (movement < convergenceThreshold) {
      break;
    }
  }

  // Scale positions to fit container
  const positions = scalePositions(graph, containerWidth, containerHeight, centerNodeId);

  // Gentle overlap resolution - just prevent visual overlap, preserve cluster structure
  // Use smaller minDistance for large graphs to prevent excessive spreading
  const minDistance = nodeCount > 500 ? 10 : 15;
  resolveOverlaps(positions, nodes, centerNodeId, minDistance, 50);

  return positions;
}

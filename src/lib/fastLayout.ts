/**
 * Fast graph layout using graphology's ForceAtlas2 with Barnes-Hut optimization
 * Much faster than fcose for large graphs (O(n log n) vs O(n²))
 */
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";

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

// ForceAtlas2 settings for coauthor networks
const FA2_SETTINGS = {
  barnesHutOptimize: true,
  barnesHutTheta: 0.5,
  gravity: 1,              // Lower gravity lets clusters separate more
  scalingRatio: 6,         // Higher repulsion helps separate clusters and prevent overlap
  strongGravityMode: false, // Disable to let peripheral clusters form
  slowDown: 2,
  adjustSizes: true,
  edgeWeightInfluence: 2,  // Moderate edge weight influence for clusters
  linLogMode: true,        // Logarithmic mode helps reveal community structure
  outboundAttractionDistribution: true,
};

/**
 * Create a graphology graph from nodes and edges
 */
function createGraph(
  nodes: NodeData[],
  edges: EdgeData[],
  containerWidth: number,
  containerHeight: number,
  centerNodeId: string
): Graph {
  const graph = new Graph();
  const centerX = containerWidth / 2;
  const centerY = containerHeight / 2;
  const spread = Math.min(containerWidth, containerHeight) * 0.4;

  // Seeded random for reproducibility
  const seededRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  nodes.forEach((node, i) => {
    const isCenter = node.data.id === centerNodeId;
    const rand1 = seededRandom(i * 13.37);
    const rand2 = seededRandom(i * 42.42 + 100);
    const x = isCenter ? centerX : centerX + (rand1 - 0.5) * spread * 2;
    const y = isCenter ? centerY : centerY + (rand2 - 0.5) * spread * 2;

    graph.addNode(node.data.id, {
      x,
      y,
      // Size is used by adjustSizes to prevent overlap
      size: 10 + Math.sqrt(node.data.paperCount || 1) * 5,
      fixed: isCenter,
    });
  });

  edges.forEach((edge) => {
    const { source, target, weight = 1 } = edge.data;
    if (graph.hasNode(source) && graph.hasNode(target) && !graph.hasEdge(source, target)) {
      graph.addEdge(source, target, { weight: Math.sqrt(weight) });
    }
  });

  return graph;
}

/**
 * Scale positions to fit container
 */
function scalePositions(
  graph: Graph,
  containerWidth: number,
  containerHeight: number,
  centerNodeId: string
): LayoutResult {
  const positions: LayoutResult = {};
  const centerX = containerWidth / 2;
  const centerY = containerHeight / 2;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  graph.forEachNode((nodeId, attrs) => {
    minX = Math.min(minX, attrs.x);
    maxX = Math.max(maxX, attrs.x);
    minY = Math.min(minY, attrs.y);
    maxY = Math.max(maxY, attrs.y);
  });

  const padding = 80;
  const scaleX = (containerWidth - 2 * padding) / (maxX - minX || 1);
  const scaleY = (containerHeight - 2 * padding) / (maxY - minY || 1);
  const scale = Math.min(scaleX, scaleY);

  const offsetX = (containerWidth - (maxX - minX) * scale) / 2 - minX * scale;
  const offsetY = (containerHeight - (maxY - minY) * scale) / 2 - minY * scale;

  graph.forEachNode((nodeId, attrs) => {
    if (nodeId === centerNodeId) {
      positions[nodeId] = { x: centerX, y: centerY };
    } else {
      positions[nodeId] = {
        x: attrs.x * scale + offsetX,
        y: attrs.y * scale + offsetY,
      };
    }
  });

  return positions;
}

/**
 * Push apart overlapping nodes on final positions
 */
function resolveOverlaps(
  positions: LayoutResult,
  nodes: NodeData[],
  centerNodeId: string,
  minDistance: number = 50,
  iterations: number = 150
): void {
  // Build a map of node sizes
  const nodeSizes = new Map<string, number>();
  for (const node of nodes) {
    nodeSizes.set(node.data.id, 10 + Math.sqrt(node.data.paperCount || 1) * 5);
  }

  const nodeIds = Object.keys(positions);

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;

    for (let i = 0; i < nodeIds.length; i++) {
      const idA = nodeIds[i];
      if (idA === centerNodeId) continue; // Don't move center node

      const posA = positions[idA];
      const sizeA = nodeSizes.get(idA) || 10;

      for (let j = i + 1; j < nodeIds.length; j++) {
        const idB = nodeIds[j];
        const posB = positions[idB];
        const sizeB = nodeSizes.get(idB) || 10;

        const dx = posB.x - posA.x;
        const dy = posB.y - posA.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // minDist is sum of radii plus small gap
        const minDist = (sizeA + sizeB) / 2 + minDistance;

        if (dist < minDist && dist > 0) {
          const overlap = minDist - dist;
          const pushX = (dx / dist) * overlap * 0.5;
          const pushY = (dy / dist) * overlap * 0.5;

          const bIsCenter = idB === centerNodeId;

          if (!bIsCenter) {
            posA.x -= pushX;
            posA.y -= pushY;
            posB.x += pushX;
            posB.y += pushY;
          } else {
            // B is center, only move A
            posA.x -= pushX * 2;
            posA.y -= pushY * 2;
          }
          moved = true;
        }
      }
    }

    if (!moved) break;
  }
}

/**
 * Calculate total movement of nodes between iterations
 */
function calculateTotalMovement(graph: Graph, previousPositions: Map<string, { x: number; y: number }>): number {
  let totalMovement = 0;

  graph.forEachNode((nodeId, attrs) => {
    const prev = previousPositions.get(nodeId);
    if (prev) {
      const dx = attrs.x - prev.x;
      const dy = attrs.y - prev.y;
      totalMovement += Math.sqrt(dx * dx + dy * dy);
    }
  });

  return totalMovement;
}

/**
 * Store current positions for comparison
 */
function snapshotPositions(graph: Graph): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  graph.forEachNode((nodeId, attrs) => {
    positions.set(nodeId, { x: attrs.x, y: attrs.y });
  });
  return positions;
}

/**
 * Compute layout positions with convergence detection
 */
export function computeFastLayout(
  nodes: NodeData[],
  edges: EdgeData[],
  containerWidth: number,
  containerHeight: number,
  centerNodeId: string
): LayoutResult {
  const graph = createGraph(nodes, edges, containerWidth, containerHeight, centerNodeId);

  const batchSize = 100;
  const maxIterations = 3000;
  const convergenceThreshold = 0.5 * nodes.length; // Average movement < 0.5px per node

  let totalIterations = 0;

  while (totalIterations < maxIterations) {
    const previousPositions = snapshotPositions(graph);

    forceAtlas2.assign(graph, {
      iterations: batchSize,
      settings: FA2_SETTINGS,
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
  resolveOverlaps(positions, nodes, centerNodeId, 5, 50);

  return positions;
}

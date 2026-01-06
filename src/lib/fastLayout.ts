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
  gravity: 8,
  scalingRatio: 2,
  strongGravityMode: true,
  slowDown: 2,
  adjustSizes: true,
  edgeWeightInfluence: 2,
  linLogMode: true,
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
 * Push apart overlapping nodes
 */
function resolveOverlaps(graph: Graph, minDistance: number = 20, iterations: number = 30): void {
  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    const nodeIds = graph.nodes();

    for (let i = 0; i < nodeIds.length; i++) {
      const nodeA = nodeIds[i];
      const attrsA = graph.getNodeAttributes(nodeA);
      if (attrsA.fixed) continue;

      for (let j = i + 1; j < nodeIds.length; j++) {
        const nodeB = nodeIds[j];
        const attrsB = graph.getNodeAttributes(nodeB);

        const dx = attrsB.x - attrsA.x;
        const dy = attrsB.y - attrsA.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = minDistance + (attrsA.size + attrsB.size) / 4;

        if (dist < minDist && dist > 0) {
          const overlap = minDist - dist;
          const pushX = (dx / dist) * overlap * 0.5;
          const pushY = (dy / dist) * overlap * 0.5;

          if (!attrsA.fixed) {
            graph.setNodeAttribute(nodeA, "x", attrsA.x - pushX);
            graph.setNodeAttribute(nodeA, "y", attrsA.y - pushY);
          }
          if (!attrsB.fixed) {
            graph.setNodeAttribute(nodeB, "x", attrsB.x + pushX);
            graph.setNodeAttribute(nodeB, "y", attrsB.y + pushY);
          }
          moved = true;
        }
      }
    }

    if (!moved) break;
  }
}

/**
 * Compute layout positions instantly (no animation)
 */
export function computeFastLayout(
  nodes: NodeData[],
  edges: EdgeData[],
  containerWidth: number,
  containerHeight: number,
  centerNodeId: string
): LayoutResult {
  const graph = createGraph(nodes, edges, containerWidth, containerHeight, centerNodeId);
  const iterations = Math.max(300, Math.min(600, nodes.length));

  forceAtlas2.assign(graph, {
    iterations,
    settings: FA2_SETTINGS,
  });

  // Post-process to resolve any remaining overlaps
  resolveOverlaps(graph);

  return scalePositions(graph, containerWidth, containerHeight, centerNodeId);
}

/**
 * Threshold for using fast layout vs fcose
 */
export const FAST_LAYOUT_THRESHOLD = 150;

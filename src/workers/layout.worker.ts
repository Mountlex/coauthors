/**
 * Web Worker for graph layout computation
 * Runs ForceAtlas2 layout off the main thread to prevent UI freezing
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

interface WorkerMessage {
  type: 'compute';
  nodes: NodeData[];
  edges: EdgeData[];
  containerWidth: number;
  containerHeight: number;
  centerNodeId: string;
}

// ForceAtlas2 base settings
const FA2_BASE_SETTINGS = {
  barnesHutOptimize: true,
  barnesHutTheta: 0.5,
  gravity: 0.5,
  scalingRatio: 6,
  strongGravityMode: false,
  slowDown: 2,
  adjustSizes: true,
  edgeWeightInfluence: 0.5,
  linLogMode: true,
  outboundAttractionDistribution: true,
};

function getAdaptiveFA2Settings(nodeCount: number) {
  if (nodeCount <= 200) return FA2_BASE_SETTINGS;
  if (nodeCount <= 500) {
    return { ...FA2_BASE_SETTINGS, barnesHutTheta: 0.6, slowDown: 3 };
  }
  if (nodeCount <= 1000) {
    return { ...FA2_BASE_SETTINGS, barnesHutTheta: 0.8, slowDown: 4, scalingRatio: 8 };
  }
  return { ...FA2_BASE_SETTINGS, barnesHutTheta: 1.0, slowDown: 5, scalingRatio: 10, gravity: 0.3 };
}

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

// Spatial grid for overlap resolution
class SpatialGrid {
  private cellSize: number;
  private grid: Map<string, string[]> = new Map();
  private positions: LayoutResult;

  constructor(positions: LayoutResult, cellSize: number) {
    this.cellSize = cellSize;
    this.positions = positions;
    this.rebuild();
  }

  private getCellKey(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  rebuild(): void {
    this.grid.clear();
    for (const nodeId of Object.keys(this.positions)) {
      const pos = this.positions[nodeId];
      const key = this.getCellKey(pos.x, pos.y);
      const cell = this.grid.get(key);
      if (cell) cell.push(nodeId);
      else this.grid.set(key, [nodeId]);
    }
  }

  getNearbyNodes(nodeId: string, searchRadius: number): string[] {
    const pos = this.positions[nodeId];
    const nearby: string[] = [];
    const cellRadius = Math.ceil(searchRadius / this.cellSize);
    const cx = Math.floor(pos.x / this.cellSize);
    const cy = Math.floor(pos.y / this.cellSize);

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        const cell = this.grid.get(`${cx + dx},${cy + dy}`);
        if (cell) {
          for (const id of cell) {
            if (id !== nodeId) nearby.push(id);
          }
        }
      }
    }
    return nearby;
  }
}

function resolveOverlaps(
  positions: LayoutResult,
  nodes: NodeData[],
  centerNodeId: string,
  minDistance: number = 50,
  maxIterations: number = 150
): void {
  const nodeCount = nodes.length;
  const iterations = nodeCount > 500
    ? Math.min(maxIterations, Math.max(20, Math.floor(100 / Math.log10(nodeCount))))
    : maxIterations;

  const nodeSizes = new Map<string, number>();
  let maxSize = 0;
  for (const node of nodes) {
    const size = 10 + Math.sqrt(node.data.paperCount || 1) * 5;
    nodeSizes.set(node.data.id, size);
    maxSize = Math.max(maxSize, size);
  }

  const nodeIds = Object.keys(positions);
  const searchRadius = maxSize + minDistance;
  const useSpatialGrid = nodeCount > 200;
  const grid = useSpatialGrid ? new SpatialGrid(positions, searchRadius) : null;

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;

    for (const idA of nodeIds) {
      if (idA === centerNodeId) continue;

      const posA = positions[idA];
      const sizeA = nodeSizes.get(idA) || 10;
      const candidates = useSpatialGrid
        ? grid!.getNearbyNodes(idA, searchRadius)
        : nodeIds.filter(id => id !== idA);

      for (const idB of candidates) {
        const posB = positions[idB];
        const sizeB = nodeSizes.get(idB) || 10;

        const dx = posB.x - posA.x;
        const dy = posB.y - posA.y;
        const distSq = dx * dx + dy * dy;
        const minDist = (sizeA + sizeB) / 2 + minDistance;

        if (distSq < minDist * minDist && distSq > 0) {
          const dist = Math.sqrt(distSq);
          const overlap = minDist - dist;
          const pushX = (dx / dist) * overlap * 0.5;
          const pushY = (dy / dist) * overlap * 0.5;

          if (idB !== centerNodeId) {
            posA.x -= pushX;
            posA.y -= pushY;
            posB.x += pushX;
            posB.y += pushY;
          } else {
            posA.x -= pushX * 2;
            posA.y -= pushY * 2;
          }
          moved = true;
        }
      }
    }

    if (useSpatialGrid && moved && iter % 5 === 4) grid!.rebuild();
    if (!moved) break;
  }
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
    const previousPositions = new Map<string, { x: number; y: number }>();
    graph.forEachNode((nodeId, attrs) => {
      previousPositions.set(nodeId, { x: attrs.x, y: attrs.y });
    });

    forceAtlas2.assign(graph, {
      iterations: batchSize,
      settings: fa2Settings,
    });

    totalIterations += batchSize;

    let totalMovement = 0;
    graph.forEachNode((nodeId, attrs) => {
      const prev = previousPositions.get(nodeId);
      if (prev) {
        const dx = attrs.x - prev.x;
        const dy = attrs.y - prev.y;
        totalMovement += Math.sqrt(dx * dx + dy * dy);
      }
    });

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

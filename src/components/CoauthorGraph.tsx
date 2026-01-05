"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import cytoscape, { Core, NodeSingular } from "cytoscape";
// @ts-expect-error - no types available for cytoscape-fcose
import fcose from "cytoscape-fcose";
import type { CoauthorGraph, Paper } from "@/types";
import { useTheme } from "./ThemeProvider";

// Register fcose layout extension
cytoscape.use(fcose);

// Minimalist color scheme
const themeColors = {
  dark: {
    graphBg: "#0a0a0a",
    nodeColor: "#e5e5e5",
    nodeText: "#0a0a0a",
    centerNode: "#6366f1",
    centerText: "#ffffff",
    edgeColor: "#525252",
    edgeCoauthor: "#6b7280",
    highlightColor: "#a5b4fc",
    highlightEdge: "#818cf8",
    textOutline: "#0a0a0a",
    dimmedOpacity: 0.15,
    panelBg: "rgba(23, 23, 23, 0.9)",
    panelBorder: "rgba(64, 64, 64, 0.5)",
    panelText: "#fafafa",
    panelTextMuted: "#a3a3a3",
  },
  light: {
    graphBg: "#fafafa",
    nodeColor: "#262626",
    nodeText: "#fafafa",
    centerNode: "#6366f1",
    centerText: "#ffffff",
    edgeColor: "#6b7280",
    edgeCoauthor: "#9ca3af",
    highlightColor: "#6366f1",
    highlightEdge: "#818cf8",
    textOutline: "#fafafa",
    dimmedOpacity: 0.2,
    panelBg: "rgba(255, 255, 255, 0.9)",
    panelBorder: "rgba(212, 212, 212, 0.5)",
    panelText: "#171717",
    panelTextMuted: "#737373",
  },
};

// Create style configuration based on theme colors
const createStyles = (colors: typeof themeColors.dark | typeof themeColors.light) => [
  // Base node style - minimalist
  {
    selector: "node",
    style: {
      label: "data(initials)",
      "text-valign": "center" as const,
      "text-halign": "center" as const,
      "font-size": 9,
      "font-weight": 500,
      "font-family": "system-ui, -apple-system, sans-serif",
      color: colors.nodeText,
      "background-color": colors.nodeColor,
      width: "mapData(paperCount, 1, 50, 20, 48)",
      height: "mapData(paperCount, 1, 50, 20, 48)",
      "border-width": 0,
      "overlay-opacity": 0,
      "transition-property": "opacity, background-color, width, height",
      "transition-duration": 200,
    },
  },
  // Center node - accent color
  {
    selector: "node[?isCenter]",
    style: {
      label: "data(initials)",
      "background-color": colors.centerNode,
      color: colors.centerText,
      "font-size": 12,
      "font-weight": 600,
      width: 56,
      height: 56,
    },
  },
  // Dimmed state
  {
    selector: "node.dimmed",
    style: {
      opacity: colors.dimmedOpacity,
    },
  },
  // Highlighted node
  {
    selector: "node.highlighted",
    style: {
      "background-color": colors.highlightColor,
      color: colors.nodeText,
    },
  },
  // Base edge style - thin and subtle
  {
    selector: "edge",
    style: {
      width: "mapData(weight, 1, 20, 1, 3)",
      "line-color": colors.edgeColor,
      "curve-style": "bezier" as const,
      opacity: 0.6,
      "transition-property": "opacity, line-color, width",
      "transition-duration": 200,
    },
  },
  // Coauthor-to-coauthor edges
  {
    selector: "edge[?isCoauthorEdge]",
    style: {
      "line-color": colors.edgeCoauthor,
      width: "mapData(weight, 1, 20, 1, 2.5)",
      opacity: 0.5,
    },
  },
  // Dimmed edge
  {
    selector: "edge.dimmed",
    style: {
      opacity: 0.05,
    },
  },
  // Highlighted edge
  {
    selector: "edge.highlighted",
    style: {
      opacity: 1,
      "line-color": colors.highlightEdge,
      width: "mapData(weight, 1, 20, 2, 5)",
    },
  },
];

// Create layout configuration for fcose with center node fixed
const createFcoseLayoutConfig = (centerNodeId: string, containerWidth: number, containerHeight: number) => ({
  name: "fcose",
  quality: "default",
  animate: true,
  animationDuration: 600,
  animationEasing: "ease-out",
  nodeSeparation: 150,
  nodeDimensionsIncludeLabels: true,
  fixedNodeConstraint: [
    { nodeId: centerNodeId, position: { x: containerWidth / 2, y: containerHeight / 2 } }
  ],
  idealEdgeLength: (edge: any) => {
    const weight = edge.data("weight") || 1;
    return Math.max(80, 200 - weight * 10);
  },
  nodeRepulsion: (node: any) => {
    const degree = node.degree();
    return 5000 / Math.sqrt(degree + 1);
  },
  gravity: 0.4,
  gravityRange: 2.0,
  numIter: 2500,
  randomize: true,
  tile: false,
});

interface CoauthorGraphProps {
  graph: CoauthorGraph;
  onNodeClick?: (nodeId: string, nodeLabel: string) => void;
}

interface HoveredElement {
  type: 'node' | 'edge';
  label: string;
  paperCount: number;
  x: number;
  y: number;
}

interface SelectedEdge {
  sourceLabel: string;
  targetLabel: string;
  papers: Paper[];
}

export default function CoauthorGraphComponent({
  graph,
  onNodeClick,
}: CoauthorGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const isInitializingRef = useRef(false); // Guard against race conditions
  const [hoveredElement, setHoveredElement] = useState<HoveredElement | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdge | null>(null);
  const { resolvedTheme } = useTheme();
  const colors = themeColors[resolvedTheme];
  const router = useRouter();

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  const initializeCytoscape = useCallback(() => {
    // Guard against race conditions from rapid re-renders
    if (!isMounted || !containerRef.current || !graph || isInitializingRef.current) return;
    isInitializingRef.current = true;

    if (cyRef.current) {
      try {
        cyRef.current.destroy();
      } catch {
        // Ignore destroy errors
      }
      cyRef.current = null;
    }

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    const centerNode = graph.nodes.find(n => n.data.isCenter);
    const centerNodeId = centerNode?.data.id || "";

    const cy = cytoscape({
      container: containerRef.current,
      elements: [...graph.nodes, ...graph.edges],
      style: createStyles(colors) as any,
      layout: createFcoseLayoutConfig(centerNodeId, containerWidth, containerHeight) as any,
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.3,
    });

    // Node click - navigate
    cy.on("tap", "node", (event) => {
      const node = event.target as NodeSingular;
      const nodeData = node.data();

      if (nodeData.isCenter) return;

      router.push(`/graph/${encodeURIComponent(nodeData.id)}?name=${encodeURIComponent(nodeData.label)}`);

      if (onNodeClick) {
        onNodeClick(nodeData.id, nodeData.label);
      }
    });

    // Node hover
    cy.on("mouseover", "node", (event) => {
      const node = event.target as NodeSingular;
      const nodeData = node.data();
      const renderedPos = node.renderedPosition();
      const container = containerRef.current;
      const containerRect = container?.getBoundingClientRect();

      cy.batch(() => {
        cy.nodes().addClass("dimmed");
        cy.edges().addClass("dimmed");
        node.removeClass("dimmed").addClass("highlighted");
        node.connectedEdges().removeClass("dimmed").addClass("highlighted");
        node.neighborhood("node").removeClass("dimmed");
      });

      setHoveredElement({
        type: "node",
        label: nodeData.label,
        paperCount: nodeData.paperCount,
        x: (containerRect?.left || 0) + renderedPos.x,
        y: (containerRect?.top || 0) + renderedPos.y,
      });
    });

    cy.on("mouseout", "node", () => {
      cy.batch(() => {
        cy.nodes().removeClass("dimmed highlighted");
        cy.edges().removeClass("dimmed highlighted");
      });
      setHoveredElement(null);
    });

    // Edge hover
    cy.on("mouseover", "edge", (event) => {
      const edge = event.target;
      const edgeData = edge.data();
      const midpoint = edge.midpoint();
      const container = containerRef.current;
      const containerRect = container?.getBoundingClientRect();
      const zoom = cy.zoom();
      const pan = cy.pan();

      const renderedX = midpoint.x * zoom + pan.x;
      const renderedY = midpoint.y * zoom + pan.y;

      cy.batch(() => {
        cy.nodes().addClass("dimmed");
        cy.edges().addClass("dimmed");
        edge.removeClass("dimmed").addClass("highlighted");
        edge.connectedNodes().removeClass("dimmed").addClass("highlighted");
      });

      setHoveredElement({
        type: "edge",
        label: `${edge.source().data("label")} — ${edge.target().data("label")}`,
        paperCount: edgeData.weight,
        x: (containerRect?.left || 0) + renderedX,
        y: (containerRect?.top || 0) + renderedY,
      });
    });

    cy.on("mouseout", "edge", () => {
      cy.batch(() => {
        cy.nodes().removeClass("dimmed highlighted");
        cy.edges().removeClass("dimmed highlighted");
      });
      setHoveredElement(null);
    });

    // Edge click - show papers panel
    cy.on("tap", "edge", (event) => {
      const edge = event.target;
      const edgeData = edge.data();
      setSelectedEdge({
        sourceLabel: edge.source().data("label"),
        targetLabel: edge.target().data("label"),
        papers: edgeData.papers || [],
      });
    });

    // Click on background - close papers panel
    cy.on("tap", (event) => {
      if (event.target === cy) {
        setSelectedEdge(null);
      }
    });

    cyRef.current = cy;

    cy.one("layoutstop", () => {
      cy.fit(undefined, 60);
    });

    // Release the initialization guard
    isInitializingRef.current = false;
  }, [graph, onNodeClick, isMounted, router]);

  useEffect(() => {
    if (isMounted) {
      initializeCytoscape();
    }

    return () => {
      if (cyRef.current) {
        try {
          cyRef.current.destroy();
        } catch {
          // Ignore destroy errors
        }
        cyRef.current = null;
      }
    };
  }, [initializeCytoscape, isMounted]);

  // Update styles dynamically when theme changes (without re-initializing the graph)
  useEffect(() => {
    if (cyRef.current && isMounted) {
      cyRef.current.style().fromJson(createStyles(colors) as any).update();
    }
  }, [resolvedTheme, colors, isMounted]);

  useEffect(() => {
    const handleResize = () => {
      if (cyRef.current) {
        cyRef.current.resize();
        cyRef.current.fit(undefined, 60);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ backgroundColor: colors.graphBg }}
      />

      {/* Minimal Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <button
          onClick={() => setShowLegend(!showLegend)}
          className="w-9 h-9 flex items-center justify-center rounded-full backdrop-blur-sm transition-all"
          style={{
            backgroundColor: colors.panelBg,
            border: `1px solid ${colors.panelBorder}`,
            color: colors.panelText,
          }}
          title="Toggle legend"
          aria-label="Toggle legend"
          aria-pressed={showLegend}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4M12 8h.01"/>
          </svg>
        </button>
        <button
          onClick={() => cyRef.current?.fit(undefined, 60)}
          className="w-9 h-9 flex items-center justify-center rounded-full backdrop-blur-sm transition-all"
          style={{
            backgroundColor: colors.panelBg,
            border: `1px solid ${colors.panelBorder}`,
            color: colors.panelText,
          }}
          title="Fit to view"
          aria-label="Fit graph to view"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
          </svg>
        </button>
        <button
          onClick={() => {
            if (!cyRef.current || !containerRef.current) return;
            const width = containerRef.current.clientWidth;
            const height = containerRef.current.clientHeight;
            const centerNode = graph.nodes.find(n => n.data.isCenter);
            const centerNodeId = centerNode?.data.id || "";
            cyRef.current.layout(createFcoseLayoutConfig(centerNodeId, width, height) as any).run();
          }}
          className="w-9 h-9 flex items-center justify-center rounded-full backdrop-blur-sm transition-all"
          style={{
            backgroundColor: colors.panelBg,
            border: `1px solid ${colors.panelBorder}`,
            color: colors.panelText,
          }}
          title="Re-layout"
          aria-label="Re-layout graph"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
      </div>

      {/* Collapsible Legend */}
      {showLegend && (
        <div
          className="absolute top-16 right-4 p-4 rounded-xl backdrop-blur-sm text-sm"
          style={{
            backgroundColor: colors.panelBg,
            border: `1px solid ${colors.panelBorder}`,
          }}
        >
          <div className="flex items-center gap-3 mb-2.5">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: colors.centerNode }}
            />
            <span style={{ color: colors.panelText }}>Center author</span>
          </div>
          <div className="flex items-center gap-3 mb-2.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: colors.nodeColor }}
            />
            <span style={{ color: colors.panelText }}>Coauthor</span>
          </div>
          <div className="flex items-center gap-3 mb-2.5">
            <div
              className="w-5 h-0.5"
              style={{ backgroundColor: colors.edgeColor }}
            />
            <span style={{ color: colors.panelText }}>Collaboration</span>
          </div>
          <div
            className="text-xs mt-3 pt-3"
            style={{
              color: colors.panelTextMuted,
              borderTop: `1px solid ${colors.panelBorder}`,
            }}
          >
            Size = papers · Width = shared
          </div>
        </div>
      )}

      {/* Minimal Tooltip */}
      {hoveredElement && (
        <div
          className="fixed pointer-events-none z-50 px-3 py-2 rounded-lg backdrop-blur-sm"
          style={{
            left: Math.min(hoveredElement.x + 12, window.innerWidth - 180),
            top: hoveredElement.y - 40,
            backgroundColor: colors.panelBg,
            border: `1px solid ${colors.panelBorder}`,
          }}
        >
          <p
            className="font-medium text-sm"
            style={{ color: colors.panelText }}
          >
            {hoveredElement.label}
          </p>
          <p
            className="text-xs"
            style={{ color: colors.panelTextMuted }}
          >
            {hoveredElement.paperCount} paper{hoveredElement.paperCount !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      {/* Papers Panel - Bottom Right */}
      {selectedEdge && (
        <div
          className="absolute bottom-4 right-4 w-80 max-h-[60vh] rounded-xl backdrop-blur-sm overflow-hidden flex flex-col"
          style={{
            backgroundColor: colors.panelBg,
            border: `1px solid ${colors.panelBorder}`,
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between p-3 shrink-0"
            style={{ borderBottom: `1px solid ${colors.panelBorder}` }}
          >
            <div className="min-w-0 flex-1">
              <p
                className="font-medium text-sm truncate"
                style={{ color: colors.panelText }}
              >
                {selectedEdge.sourceLabel} & {selectedEdge.targetLabel}
              </p>
              <p
                className="text-xs"
                style={{ color: colors.panelTextMuted }}
              >
                {selectedEdge.papers.length} shared paper{selectedEdge.papers.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              onClick={() => setSelectedEdge(null)}
              className="ml-2 p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors shrink-0"
              style={{ color: colors.panelTextMuted }}
              aria-label="Close papers panel"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Papers List */}
          <div className="overflow-y-auto flex-1 p-2">
            {selectedEdge.papers
              .sort((a, b) => (b.year || "").localeCompare(a.year || ""))
              .map((paper, index) => (
                <a
                  key={index}
                  href={paper.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <p
                    className="text-sm leading-snug"
                    style={{ color: colors.panelText }}
                  >
                    {paper.title}
                  </p>
                  <p
                    className="text-xs mt-1"
                    style={{ color: colors.panelTextMuted }}
                  >
                    {[paper.year, paper.venue].filter(Boolean).join(" · ")}
                  </p>
                </a>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

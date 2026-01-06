"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import cytoscape, { Core, NodeSingular } from "cytoscape";
// @ts-expect-error - no types available for cytoscape-fcose
import fcose from "cytoscape-fcose";
import type { CoauthorGraph, Paper, PublicationType } from "@/types";
import { PUBLICATION_TYPE_LABELS } from "@/types";
import { useTheme } from "./ThemeProvider";
import { graphColors, type GraphColorScheme } from "@/lib/colors";
import { filterPublicationsByType, rebuildGraphFromPublications } from "@/lib/graph";
import { computeFastLayout, FAST_LAYOUT_THRESHOLD } from "@/lib/fastLayout";

const ALL_PUBLICATION_TYPES: PublicationType[] = ["journal", "conference", "book", "preprint"];

// Register fcose layout extension
cytoscape.use(fcose);

// Create style configuration based on theme colors
const createStyles = (colors: GraphColorScheme) => [
  // Base node style - minimalist
  {
    selector: "node",
    style: {
      label: "data(initials)",
      "text-valign": "center" as const,
      "text-halign": "center" as const,
      "font-size": 10,
      "font-weight": 500,
      "font-family": "system-ui, -apple-system, sans-serif",
      color: colors.nodeText,
      "background-color": colors.node,
      width: "mapData(paperCount, 1, 50, 24, 56)",
      height: "mapData(paperCount, 1, 50, 24, 56)",
      "border-width": 0,
      "overlay-opacity": 0,
      "transition-property": "opacity, background-color, width, height",
      "transition-duration": 200,
    },
  },
  // Center node - accent color (orange)
  {
    selector: "node[?isCenter]",
    style: {
      label: "data(initials)",
      "background-color": colors.centerNode,
      color: colors.centerText,
      "font-size": 14,
      "font-weight": 600,
      width: 64,
      height: 64,
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
      "background-color": colors.highlight,
      color: colors.nodeText,
    },
  },
  // Base edge style - more visible
  {
    selector: "edge",
    style: {
      width: "mapData(weight, 1, 20, 2, 6)",
      "line-color": colors.edge,
      "curve-style": "bezier" as const,
      opacity: 0.85,
      "transition-property": "opacity, line-color, width",
      "transition-duration": 200,
    },
  },
  // Coauthor-to-coauthor edges
  {
    selector: "edge[?isCoauthorEdge]",
    style: {
      "line-color": colors.edgeCoauthor,
      width: "mapData(weight, 1, 20, 1.5, 4)",
      opacity: 0.7,
    },
  },
  // Dimmed edge
  {
    selector: "edge.dimmed",
    style: {
      opacity: 0.08,
    },
  },
  // Highlighted edge
  {
    selector: "edge.highlighted",
    style: {
      opacity: 1,
      "line-color": colors.highlightEdge,
      width: "mapData(weight, 1, 20, 3, 8)",
    },
  },
];

// Create layout configuration for fcose with center node fixed
const createFcoseLayoutConfig = (centerNodeId: string, containerWidth: number, containerHeight: number, nodeCount: number) => ({
  name: "fcose",
  quality: "default",
  animate: true,
  animationDuration: 600,
  animationEasing: "ease-out",
  // Overlap prevention
  nodeSeparation: 120,
  nodeDimensionsIncludeLabels: true,
  uniformNodeDimensions: false,
  packComponents: true,
  // Fixed center node
  fixedNodeConstraint: [
    { nodeId: centerNodeId, position: { x: containerWidth / 2, y: containerHeight / 2 } }
  ],
  // Edge lengths - longer to give more space
  idealEdgeLength: (edge: any) => {
    const weight = edge.data("weight") || 1;
    return Math.max(80, 160 - weight * 6);
  },
  // Node repulsion - higher values push nodes apart more
  nodeRepulsion: (node: any) => {
    const degree = node.degree();
    return 6000 / Math.sqrt(degree + 1);
  },
  gravity: 0.4,
  gravityRange: 2.0,
  // More iterations for better layout
  numIter: Math.min(3000, Math.max(1000, nodeCount * 8)),
  randomize: true,
  tile: false,
  // Padding around nodes
  padding: 30,
});

interface CoauthorGraphProps {
  graph: CoauthorGraph;
  onNodeClick?: (nodeId: string, nodeLabel: string) => void;
  enabledTypes: Set<PublicationType>;
  onToggleType: (type: PublicationType) => void;
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
  enabledTypes,
  onToggleType,
}: CoauthorGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const isInitializingRef = useRef(false); // Guard against race conditions
  const isFirstFilterRender = useRef(true); // Skip filter effect on initial mount
  const [hoveredElement, setHoveredElement] = useState<HoveredElement | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdge | null>(null);
  const { resolvedTheme } = useTheme();
  const colors = graphColors[resolvedTheme === "dark" ? "dark" : "light"];
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
      } catch (error) {
        console.warn("Cytoscape cleanup error:", error);
      }
      cyRef.current = null;
    }

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    const centerNode = graph.nodes.find(n => n.data.isCenter);
    const centerNodeId = centerNode?.data.id || "";
    const isLargeGraph = graph.nodes.length > FAST_LAYOUT_THRESHOLD;

    let layoutConfig: any;
    let elementsWithPositions = [...graph.nodes, ...graph.edges];

    if (isLargeGraph) {
      // Use fast layout (Barnes-Hut ForceAtlas2)
      const positions = computeFastLayout(
        graph.nodes,
        graph.edges,
        containerWidth,
        containerHeight,
        centerNodeId
      );

      elementsWithPositions = [
        ...graph.nodes.map(node => ({
          ...node,
          position: positions[node.data.id] || { x: containerWidth / 2, y: containerHeight / 2 }
        })),
        ...graph.edges
      ];
      layoutConfig = { name: "preset" };
    } else {
      layoutConfig = createFcoseLayoutConfig(centerNodeId, containerWidth, containerHeight, graph.nodes.length);
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements: elementsWithPositions,
      style: createStyles(colors) as any,
      layout: layoutConfig,
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
        } catch (error) {
          console.warn("Cytoscape cleanup error:", error);
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

  // Update graph when publication type filters change
  useEffect(() => {
    // Skip the first render - initial graph is already set up by initializeCytoscape
    if (isFirstFilterRender.current) {
      isFirstFilterRender.current = false;
      return;
    }

    if (!cyRef.current || !isMounted || !graph.publications) return;

    const cy = cyRef.current;
    const centerPid = graph.centerAuthor.pid;

    // Filter publications and rebuild graph data
    const filteredPubs = filterPublicationsByType(graph.publications, enabledTypes);
    const { nodes, edges } = rebuildGraphFromPublications(
      centerPid,
      graph.centerAuthor,
      filteredPubs
    );

    // Get current element IDs
    const currentNodeIds = new Set(cy.nodes().map((n) => n.id()));
    const currentEdgeIds = new Set(cy.edges().map((e) => e.id()));

    // Get new element IDs
    const newNodeIds = new Set(nodes.map((n) => n.data.id));
    const newEdgeIds = new Set(edges.map((e) => e.data.id));

    cy.batch(() => {
      // Remove edges that are no longer present
      cy.edges().forEach((edge) => {
        if (!newEdgeIds.has(edge.id())) {
          edge.remove();
        }
      });

      // Remove nodes that are no longer present (except center)
      cy.nodes().forEach((node) => {
        if (!newNodeIds.has(node.id()) && !node.data("isCenter")) {
          node.remove();
        }
      });

      // Add new nodes
      for (const node of nodes) {
        if (!currentNodeIds.has(node.data.id)) {
          cy.add(node);
        } else {
          // Update existing node data
          cy.getElementById(node.data.id).data(node.data);
        }
      }

      // Add new edges
      for (const edge of edges) {
        if (!currentEdgeIds.has(edge.data.id)) {
          cy.add(edge);
        } else {
          // Update existing edge data
          cy.getElementById(edge.data.id).data(edge.data);
        }
      }
    });

    // Run layout to reposition nodes
    const containerWidth = containerRef.current?.clientWidth || 800;
    const containerHeight = containerRef.current?.clientHeight || 600;
    const isLargeGraph = nodes.length > FAST_LAYOUT_THRESHOLD;

    if (isLargeGraph) {
      const positions = computeFastLayout(nodes, edges, containerWidth, containerHeight, centerPid);
      cy.nodes().forEach(node => {
        const pos = positions[node.id()];
        if (pos) node.position(pos);
      });
      cy.fit(undefined, 60);
    } else {
      cy.layout(
        createFcoseLayoutConfig(centerPid, containerWidth, containerHeight, nodes.length) as any
      ).run();
    }
  }, [enabledTypes, graph.publications, graph.centerAuthor, isMounted]);

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
        style={{ backgroundColor: colors.background }}
      />

      {/* Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5">
        {/* Publication Type Filters */}
        {ALL_PUBLICATION_TYPES.map((type) => {
          const isEnabled = enabledTypes.has(type);
          return (
            <button
              key={type}
              onClick={() => onToggleType(type)}
              className="px-3 h-8 flex items-center justify-center rounded-xl backdrop-blur-md transition-all text-xs font-medium hover:scale-[1.02] active:scale-[0.98]"
              style={{
                backgroundColor: isEnabled ? colors.centerNode : colors.panelBg,
                border: `1px solid ${isEnabled ? "transparent" : colors.panelBorder}`,
                color: isEnabled ? "#fff" : colors.panelTextMuted,
                boxShadow: isEnabled ? "0 2px 8px rgba(0,0,0,0.15)" : "none",
              }}
              title={`${isEnabled ? "Hide" : "Show"} ${PUBLICATION_TYPE_LABELS[type]} publications`}
              aria-label={`${isEnabled ? "Hide" : "Show"} ${PUBLICATION_TYPE_LABELS[type]} publications`}
              aria-pressed={isEnabled}
            >
              {PUBLICATION_TYPE_LABELS[type]}
            </button>
          );
        })}

        {/* Separator */}
        <div
          className="w-px h-5 mx-1.5"
          style={{ backgroundColor: colors.panelBorder }}
        />

        <button
          onClick={() => setShowLegend(!showLegend)}
          className="w-9 h-9 flex items-center justify-center rounded-xl backdrop-blur-md transition-all hover:scale-[1.05] active:scale-[0.95]"
          style={{
            backgroundColor: showLegend ? colors.centerNode : colors.panelBg,
            border: `1px solid ${showLegend ? "transparent" : colors.panelBorder}`,
            color: showLegend ? "#fff" : colors.panelText,
            boxShadow: showLegend ? "0 2px 8px rgba(0,0,0,0.15)" : "none",
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
          className="w-9 h-9 flex items-center justify-center rounded-xl backdrop-blur-md transition-all hover:scale-[1.05] active:scale-[0.95]"
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
            const cy = cyRef.current;
            const width = containerRef.current.clientWidth;
            const height = containerRef.current.clientHeight;
            const centerNode = graph.nodes.find(n => n.data.isCenter);
            const centerNodeId = centerNode?.data.id || "";
            const isLargeGraph = graph.nodes.length > FAST_LAYOUT_THRESHOLD;

            if (isLargeGraph) {
              const positions = computeFastLayout(graph.nodes, graph.edges, width, height, centerNodeId);
              cy.nodes().forEach(node => {
                const pos = positions[node.id()];
                if (pos) node.position(pos);
              });
              cy.fit(undefined, 60);
            } else {
              cy.layout(createFcoseLayoutConfig(centerNodeId, width, height, graph.nodes.length) as any).run();
            }
          }}
          className="w-9 h-9 flex items-center justify-center rounded-xl backdrop-blur-md transition-all hover:scale-[1.05] active:scale-[0.95]"
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
          className="absolute top-16 right-4 p-4 rounded-2xl backdrop-blur-md text-sm animate-fade-in-scale"
          style={{
            backgroundColor: colors.panelBg,
            border: `1px solid ${colors.panelBorder}`,
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
          }}
        >
          <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: colors.panelTextMuted }}>
            Legend
          </p>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-5 h-5 rounded-full flex-shrink-0"
              style={{ backgroundColor: colors.centerNode }}
            />
            <span style={{ color: colors.panelText }}>Center author</span>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0 ml-0.5"
              style={{ backgroundColor: colors.node }}
            />
            <span style={{ color: colors.panelText }}>Coauthor</span>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-5 h-0.5 ml-0.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: colors.edge }}
            />
            <span style={{ color: colors.panelText }}>Collaboration</span>
          </div>
          <div
            className="text-xs mt-4 pt-3 leading-relaxed"
            style={{
              color: colors.panelTextMuted,
              borderTop: `1px solid ${colors.panelBorder}`,
            }}
          >
            Node size = paper count<br />
            Edge width = shared papers
          </div>
        </div>
      )}

      {/* Tooltip */}
      {hoveredElement && (
        <div
          className="fixed pointer-events-none z-50 px-3.5 py-2.5 rounded-xl backdrop-blur-md"
          style={{
            left: Math.min(hoveredElement.x + 12, window.innerWidth - 180),
            top: hoveredElement.y - 44,
            backgroundColor: colors.panelBg,
            border: `1px solid ${colors.panelBorder}`,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          }}
        >
          <p
            className="font-medium text-sm"
            style={{ color: colors.panelText }}
          >
            {hoveredElement.label}
          </p>
          <p
            className="text-xs mt-0.5"
            style={{ color: colors.panelTextMuted }}
          >
            {hoveredElement.paperCount} paper{hoveredElement.paperCount !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      {/* Papers Panel - Bottom Right */}
      {selectedEdge && (
        <div
          className="absolute bottom-4 right-4 w-80 max-h-[60vh] rounded-2xl backdrop-blur-md overflow-hidden flex flex-col animate-fade-in-scale"
          style={{
            backgroundColor: colors.panelBg,
            border: `1px solid ${colors.panelBorder}`,
            boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3.5 shrink-0"
            style={{ borderBottom: `1px solid ${colors.panelBorder}` }}
          >
            <div className="min-w-0 flex-1">
              <p
                className="font-semibold text-sm truncate"
                style={{ color: colors.panelText }}
              >
                {selectedEdge.sourceLabel} & {selectedEdge.targetLabel}
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: colors.panelTextMuted }}
              >
                {selectedEdge.papers.length} shared paper{selectedEdge.papers.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              onClick={() => setSelectedEdge(null)}
              className="ml-2 p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors shrink-0"
              style={{ color: colors.panelTextMuted }}
              aria-label="Close papers panel"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
                  className="block p-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
                >
                  <p
                    className="text-sm leading-snug group-hover:text-amber-600 dark:group-hover:text-amber-500 transition-colors"
                    style={{ color: colors.panelText }}
                  >
                    {paper.title}
                  </p>
                  <p
                    className="text-xs mt-1.5"
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

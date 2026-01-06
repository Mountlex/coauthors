/**
 * Shared color palette for graph visualizations
 * Orange/black/white theme with dark and light mode support
 */

export interface GraphColorScheme {
  // Background
  background: string;

  // Nodes
  node: string;
  nodeText: string;
  centerNode: string;
  centerText: string;

  // Edges
  edge: string;
  edgeCoauthor: string;

  // Highlighting
  highlight: string;
  highlightEdge: string;

  // Dimmed state
  dimmedOpacity: number;

  // UI Panels
  panelBg: string;
  panelBorder: string;
  panelText: string;
  panelTextMuted: string;

  // Accent (for badges, buttons)
  accent: string;
}

export const graphColors: { dark: GraphColorScheme; light: GraphColorScheme } = {
  dark: {
    // Background
    background: "#0a0a0a",

    // Nodes
    node: "#ffffff",
    nodeText: "#0a0a0a",
    centerNode: "#f59e0b", // Amber-500
    centerText: "#ffffff",

    // Edges - more visible
    edge: "#737373", // Brighter gray
    edgeCoauthor: "#525252",

    // Highlighting
    highlight: "#fbbf24", // Amber-400
    highlightEdge: "#f59e0b",

    // Dimmed state
    dimmedOpacity: 0.15,

    // UI Panels
    panelBg: "rgba(23, 23, 23, 0.95)",
    panelBorder: "rgba(245, 158, 11, 0.3)", // Amber tint
    panelText: "#fafafa",
    panelTextMuted: "#a3a3a3",

    // Accent (for badges, buttons)
    accent: "#f59e0b",
  },
  light: {
    // Background
    background: "#fafafa",

    // Nodes
    node: "#171717",
    nodeText: "#fafafa",
    centerNode: "#d97706", // Amber-600
    centerText: "#ffffff",

    // Edges - more visible
    edge: "#a3a3a3", // Darker gray
    edgeCoauthor: "#d4d4d4",

    // Highlighting
    highlight: "#f59e0b", // Amber-500
    highlightEdge: "#d97706",

    // Dimmed state
    dimmedOpacity: 0.2,

    // UI Panels
    panelBg: "rgba(255, 255, 255, 0.95)",
    panelBorder: "rgba(217, 119, 6, 0.3)", // Amber tint
    panelText: "#171717",
    panelTextMuted: "#737373",

    // Accent (for badges, buttons)
    accent: "#d97706",
  },
};

/**
 * Get colors for the current theme
 */
export function getGraphColors(theme: "dark" | "light"): GraphColorScheme {
  return graphColors[theme];
}

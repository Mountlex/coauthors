import type {
  Author,
  CoauthorGraph,
  GraphNode,
  GraphEdge,
  Paper,
  PaperStats,
  DBLPPublicationHit,
  PublicationType,
} from "@/types";
import { DBLP_TYPE_MAP } from "@/types";
import {
  getAuthorPublications,
  extractCoauthors,
  slugify,
} from "./dblp";

/**
 * Create a stable edge ID from source and target PIDs
 * Sorts PIDs to ensure consistent IDs regardless of direction
 */
function createEdgeId(source: string, target: string): string {
  const [a, b] = [source, target].sort();
  return `edge-${a}-${b}`;
}

/**
 * Build a coauthor graph for a given author PID
 * Includes edges between coauthors who appear on the same paper
 */
export async function buildCoauthorGraph(
  pid: string,
  authorName?: string
): Promise<CoauthorGraph> {
  // Fetch author's publications
  const { author, publications } = await getAuthorPublications(pid, authorName);

  // Extract coauthors from publications
  const coauthorsMap = extractCoauthors(pid, publications);

  // Build nodes array
  const nodes: GraphNode[] = [];

  // Add center author as first node
  nodes.push({
    data: {
      id: pid,
      label: author.name,
      initials: getInitials(author.name),
      paperCount: publications.length,
      isCenter: true,
    },
  });

  // Add coauthor nodes
  for (const [coauthorPid, { author: coauthor, papers }] of coauthorsMap) {
    nodes.push({
      data: {
        id: coauthorPid,
        label: coauthor.name,
        initials: getInitials(coauthor.name),
        paperCount: papers.length,
        isCenter: false,
      },
    });
  }

  // Build edges array
  const edges: GraphEdge[] = [];

  // Add edges from center to coauthors
  for (const [coauthorPid, { papers }] of coauthorsMap) {
    edges.push({
      data: {
        id: createEdgeId(pid, coauthorPid),
        source: pid,
        target: coauthorPid,
        weight: papers.length,
        papers,
        isCoauthorEdge: false,
      },
    });
  }

  // Add edges between coauthors who appear on the same paper
  const coauthorEdges = buildCoauthorToCoauthorEdges(pid, publications, coauthorsMap);
  for (const edge of coauthorEdges) {
    edges.push({
      data: {
        id: createEdgeId(edge.source, edge.target),
        ...edge,
        isCoauthorEdge: true,
      },
    });
  }

  // Calculate paper statistics
  const stats = calculatePaperStats(publications);

  return {
    centerAuthor: author,
    nodes,
    edges,
    stats,
    publications,
  };
}

/**
 * Calculate statistics about authors per paper
 */
function calculatePaperStats(publications: DBLPPublicationHit[]): PaperStats {
  if (publications.length === 0) {
    return {
      totalPapers: 0,
      avgAuthorsPerPaper: 0,
      minAuthorsPerPaper: 0,
      maxAuthorsPerPaper: 0,
    };
  }

  const authorCounts: number[] = [];

  for (const pub of publications) {
    if (!pub.info.authors) {
      authorCounts.push(1); // Solo paper
    } else {
      const authors = Array.isArray(pub.info.authors.author)
        ? pub.info.authors.author
        : [pub.info.authors.author];
      authorCounts.push(authors.length);
    }
  }

  const total = authorCounts.reduce((sum, count) => sum + count, 0);
  const avg = total / authorCounts.length;
  const min = Math.min(...authorCounts);
  const max = Math.max(...authorCounts);

  return {
    totalPapers: publications.length,
    avgAuthorsPerPaper: Math.round(avg * 10) / 10, // Round to 1 decimal
    minAuthorsPerPaper: min,
    maxAuthorsPerPaper: max,
  };
}

/**
 * Build edges between coauthors who appear on the same paper
 */
function buildCoauthorToCoauthorEdges(
  centerPid: string,
  publications: DBLPPublicationHit[],
  coauthorsMap: Map<string, { author: Author; papers: Paper[] }>
): Array<{ source: string; target: string; weight: number; papers: Paper[] }> {
  // Map to track edges between coauthor pairs: "pid1|pid2" -> papers[]
  const pairEdges = new Map<string, Paper[]>();
  // Set to track seen paper titles per pair for O(1) dedup
  const pairSeenTitles = new Map<string, Set<string>>();

  for (const pub of publications) {
    if (!pub.info.authors) continue;

    const authors = Array.isArray(pub.info.authors.author)
      ? pub.info.authors.author
      : [pub.info.authors.author];

    // Get coauthor PIDs for this paper (excluding center author)
    const coauthorPids: string[] = [];
    for (const author of authors) {
      const authorPid = author["@pid"] || slugify(author.text);
      // Compare PIDs directly, not string contains
      if (authorPid !== centerPid) {
        // Only include if this coauthor is in our map (connected to center)
        if (coauthorsMap.has(authorPid)) {
          coauthorPids.push(authorPid);
        }
      }
    }

    // Create paper object
    const paper: Paper = {
      title: pub.info.title,
      year: pub.info.year,
      venue: pub.info.venue,
      url: pub.info.url,
    };

    // Create edges between all pairs of coauthors on this paper
    for (let i = 0; i < coauthorPids.length; i++) {
      for (let j = i + 1; j < coauthorPids.length; j++) {
        // Create consistent key (sorted to avoid duplicates)
        const [pid1, pid2] = [coauthorPids[i], coauthorPids[j]].sort();
        const key = `${pid1}|${pid2}`;

        // O(1) dedup using Set
        let seenTitles = pairSeenTitles.get(key);
        if (!seenTitles) {
          seenTitles = new Set();
          pairSeenTitles.set(key, seenTitles);
        }

        if (!seenTitles.has(paper.title)) {
          seenTitles.add(paper.title);
          const existing = pairEdges.get(key);
          if (existing) {
            existing.push(paper);
          } else {
            pairEdges.set(key, [paper]);
          }
        }
      }
    }
  }

  // Convert to edge array
  const edges: Array<{ source: string; target: string; weight: number; papers: Paper[] }> = [];
  for (const [key, papers] of pairEdges) {
    const [source, target] = key.split("|");
    edges.push({
      source,
      target,
      weight: papers.length,
      papers,
    });
  }

  return edges;
}

/**
 * Generate initials from author name (max 3 characters)
 */
function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map(part => part[0])
    .filter(char => char && char.match(/[A-Za-z]/))
    .join('')
    .toUpperCase()
    .slice(0, 3);
}

/**
 * Get statistics about the graph
 */
export function getGraphStats(graph: CoauthorGraph) {
  const totalCoauthors = graph.nodes.length - 1; // Exclude center
  const totalEdges = graph.edges.length;
  const totalPapers = graph.edges.reduce((sum, e) => sum + e.data.weight, 0);

  // Find most frequent coauthors
  const topCoauthors = [...graph.edges]
    .sort((a, b) => b.data.weight - a.data.weight)
    .slice(0, 5)
    .map((e) => {
      const coauthorNode = graph.nodes.find((n) => n.data.id === e.data.target);
      return {
        name: coauthorNode?.data.label || "Unknown",
        papers: e.data.weight,
      };
    });

  return {
    totalCoauthors,
    totalEdges,
    totalPapers,
    topCoauthors,
  };
}

/**
 * Filter publications by enabled publication types
 */
export function filterPublicationsByType(
  publications: DBLPPublicationHit[],
  enabledTypes: Set<PublicationType>
): DBLPPublicationHit[] {
  if (enabledTypes.size === 4) {
    // All types enabled, no filtering needed
    return publications;
  }

  return publications.filter((pub) => {
    const dblpType = pub.info.type;
    if (!dblpType) {
      // Unknown type - include if preprint is enabled (fallback)
      return enabledTypes.has("preprint");
    }
    const mappedType = DBLP_TYPE_MAP[dblpType];
    return mappedType ? enabledTypes.has(mappedType) : enabledTypes.has("preprint");
  });
}

/**
 * Rebuild graph nodes and edges from filtered publications
 * Used for client-side filtering without re-fetching data
 */
export function rebuildGraphFromPublications(
  centerPid: string,
  centerAuthor: Author,
  publications: DBLPPublicationHit[]
): { nodes: GraphNode[]; edges: GraphEdge[]; stats: PaperStats } {
  // Extract coauthors from filtered publications
  const coauthorsMap = extractCoauthors(centerPid, publications);

  // Build nodes array
  const nodes: GraphNode[] = [];

  // Add center author as first node
  nodes.push({
    data: {
      id: centerPid,
      label: centerAuthor.name,
      initials: getInitials(centerAuthor.name),
      paperCount: publications.length,
      isCenter: true,
    },
  });

  // Add coauthor nodes
  for (const [coauthorPid, { author: coauthor, papers }] of coauthorsMap) {
    nodes.push({
      data: {
        id: coauthorPid,
        label: coauthor.name,
        initials: getInitials(coauthor.name),
        paperCount: papers.length,
        isCenter: false,
      },
    });
  }

  // Build edges array
  const edges: GraphEdge[] = [];

  // Add edges from center to coauthors
  for (const [coauthorPid, { papers }] of coauthorsMap) {
    edges.push({
      data: {
        id: createEdgeId(centerPid, coauthorPid),
        source: centerPid,
        target: coauthorPid,
        weight: papers.length,
        papers,
        isCoauthorEdge: false,
      },
    });
  }

  // Add edges between coauthors who appear on the same paper
  const coauthorEdges = buildCoauthorToCoauthorEdges(centerPid, publications, coauthorsMap);
  for (const edge of coauthorEdges) {
    edges.push({
      data: {
        id: createEdgeId(edge.source, edge.target),
        ...edge,
        isCoauthorEdge: true,
      },
    });
  }

  // Calculate paper statistics
  const stats = calculatePaperStats(publications);

  return { nodes, edges, stats };
}

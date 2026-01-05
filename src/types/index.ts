// DBLP API Response Types

export interface DBLPAuthorSearchResult {
  result: {
    hits: {
      "@total": string;
      hit?: DBLPAuthorHit[];
    };
  };
}

export interface DBLPAuthorHit {
  "@id": string;
  info: {
    author: string;
    url: string;
    aliases?: { alias: string | string[] };
    notes?: { note: { "@type": string; text: string }[] | { "@type": string; text: string } };
  };
}

export interface DBLPPublicationsResponse {
  result: {
    hits: {
      "@total": string;
      hit?: DBLPPublicationHit[];
    };
  };
}

export interface DBLPPublicationHit {
  "@id": string;
  info: {
    authors?: { author: DBLPPublicationAuthor | DBLPPublicationAuthor[] };
    title: string;
    venue?: string;
    year?: string;
    type?: string;
    url?: string;
  };
}

export interface DBLPPublicationAuthor {
  "@pid"?: string;
  text: string;
}

// Internal Types for Graph Building

export interface Author {
  pid: string;
  name: string;
  url: string;
  aliases?: string[];
  paperCount?: number;
  affiliation?: string;
}

export interface CoauthorEdge {
  source: string; // pid
  target: string; // pid
  papers: Paper[];
  weight: number; // number of shared papers
}

export interface Paper {
  title: string;
  year?: string;
  venue?: string;
  url?: string;
}

export interface PaperStats {
  totalPapers: number;
  avgAuthorsPerPaper: number;
  minAuthorsPerPaper: number;
  maxAuthorsPerPaper: number;
}

export interface CoauthorGraph {
  centerAuthor: Author;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: PaperStats;
}

export interface GraphNode {
  data: {
    id: string;
    label: string;
    initials: string;
    paperCount: number;
    isCenter: boolean;
  };
}

export interface GraphEdge {
  data: {
    id: string;
    source: string;
    target: string;
    weight: number;
    papers: Paper[];
    isCoauthorEdge?: boolean; // true if edge is between two coauthors (not involving center)
  };
}

// API Response Types

export interface SearchResponse {
  authors: Author[];
}

export interface GraphResponse {
  graph: CoauthorGraph;
}

export interface ApiError {
  error: string;
  message: string;
}

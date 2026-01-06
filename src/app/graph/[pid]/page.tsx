"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { CoauthorGraph, PublicationType } from "@/types";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { filterPublicationsByType, rebuildGraphFromPublications } from "@/lib/graph";

const ALL_PUBLICATION_TYPES: PublicationType[] = ["journal", "conference", "book", "preprint"];

// Dynamic import to avoid SSR issues with Cytoscape
const CoauthorGraphComponent = dynamic(
  () => import("@/components/CoauthorGraph"),
  { ssr: false }
);

export default function GraphPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const pid = typeof params.pid === "string" ? decodeURIComponent(params.pid) : "";
  const authorName = searchParams.get("name") || undefined;

  const [graph, setGraph] = useState<CoauthorGraph | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabledTypes, setEnabledTypes] = useState<Set<PublicationType>>(
    () => new Set(ALL_PUBLICATION_TYPES)
  );

  // Toggle a publication type filter
  const toggleType = useCallback((type: PublicationType) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        // Don't allow disabling all types
        if (next.size > 1) {
          next.delete(type);
        }
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Compute filtered stats
  const filteredStats = useMemo(() => {
    if (!graph?.publications) return null;

    const filteredPubs = filterPublicationsByType(graph.publications, enabledTypes);
    const { nodes, stats } = rebuildGraphFromPublications(
      graph.centerAuthor.pid,
      graph.centerAuthor,
      filteredPubs
    );

    return {
      coauthorCount: nodes.length - 1, // Exclude center
      totalPapers: stats.totalPapers,
      avgAuthorsPerPaper: stats.avgAuthorsPerPaper,
    };
  }, [graph, enabledTypes]);

  useEffect(() => {
    if (!pid) return;

    async function fetchGraph() {
      setIsLoading(true);
      setError(null);

      try {
        let url = `/api/graph/${encodeURIComponent(pid)}`;
        if (authorName) {
          url += `?name=${encodeURIComponent(authorName)}`;
        }
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to load graph");
        }

        setGraph(data.graph);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load graph");
      } finally {
        setIsLoading(false);
      }
    }

    fetchGraph();
  }, [pid, authorName]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center animate-fade-in">
        <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-5" />
        <p className="text-neutral-900 dark:text-white font-medium">
          {authorName ? `Loading ${authorName}...` : "Loading graph..."}
        </p>
        <p className="text-neutral-400 dark:text-neutral-500 text-sm mt-2">
          Fetching from DBLP
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 animate-fade-in">
        <div className="bg-red-500/5 dark:bg-red-500/10 border border-red-500/20 rounded-2xl p-8 max-w-md text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-red-600 dark:text-red-400 text-lg font-semibold mb-2">Something went wrong</h2>
          <p className="text-neutral-600 dark:text-neutral-400 mb-6">{error}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-neutral-900 dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-100 text-white dark:text-neutral-900 px-5 py-2.5 rounded-xl font-medium transition-colors"
          >
            Back to Search
          </Link>
        </div>
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center animate-fade-in">
        <p className="text-neutral-500 dark:text-neutral-400 mb-4">No graph data available</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-neutral-900 dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-100 text-white dark:text-neutral-900 px-5 py-2.5 rounded-xl font-medium transition-colors"
        >
          Back to Search
        </Link>
      </div>
    );
  }

  const coauthorCount = filteredStats?.coauthorCount ?? graph.nodes.length - 1;
  const totalPapers = filteredStats?.totalPapers ?? graph.stats.totalPapers;
  const avgAuthors = filteredStats?.avgAuthorsPerPaper ?? graph.stats.avgAuthorsPerPaper;
  const isFiltered = enabledTypes.size < 4;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border-b border-neutral-200/50 dark:border-neutral-800/50 px-5 py-4">
        <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-5">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors group"
            >
              <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm font-medium">Back</span>
            </Link>
            <div className="h-6 w-px bg-neutral-200 dark:bg-neutral-700" />
            <div>
              <h1 className="text-xl font-semibold text-neutral-900 dark:text-white tracking-tight">
                {graph.centerAuthor.name}
              </h1>
              {graph.centerAuthor.affiliation && (
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {graph.centerAuthor.affiliation}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium text-neutral-600 dark:text-neutral-300">
                  {coauthorCount} coauthors
                </span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium text-neutral-600 dark:text-neutral-300">
                  {totalPapers} papers{isFiltered && <span className="text-amber-600 dark:text-amber-500 ml-1">*</span>}
                </span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium text-neutral-600 dark:text-neutral-300">
                  ~{avgAuthors.toFixed(1)} authors/paper
                </span>
              </div>
              {coauthorCount > 200 && (
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-2 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Large network
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <a
              href={graph.centerAuthor.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-500 hover:text-amber-700 dark:hover:text-amber-400 transition-colors group"
            >
              <span>DBLP</span>
              <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </header>

      {/* Graph */}
      <div className="flex-1">
        <ErrorBoundary>
          <CoauthorGraphComponent
            graph={graph}
            enabledTypes={enabledTypes}
            onToggleType={toggleType}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}

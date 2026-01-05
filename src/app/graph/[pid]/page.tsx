"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { CoauthorGraph } from "@/types";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ErrorBoundary } from "@/components/ErrorBoundary";

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
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-900 dark:text-white font-medium">
          {authorName ? `Loading graph for ${authorName}...` : "Loading coauthor graph..."}
        </p>
        <p className="text-gray-500 dark:text-slate-400 text-sm mt-2">
          Fetching publications from DBLP
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 max-w-md text-center">
          <h2 className="text-red-500 dark:text-red-400 text-xl font-semibold mb-2">Error</h2>
          <p className="text-gray-700 dark:text-slate-300 mb-4">{error}</p>
          <Link
            href="/"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
          >
            Back to Search
          </Link>
        </div>
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <p className="text-gray-500 dark:text-slate-400">No graph data available</p>
        <Link
          href="/"
          className="mt-4 inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
        >
          Back to Search
        </Link>
      </div>
    );
  }

  const coauthorCount = graph.nodes.length - 1;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              &larr; Back
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                {graph.centerAuthor.name}
              </h1>
              {graph.centerAuthor.affiliation && (
                <p className="text-sm text-gray-600 dark:text-slate-300">
                  {graph.centerAuthor.affiliation}
                </p>
              )}
              <p className="text-sm text-gray-500 dark:text-slate-400">
                {coauthorCount} coauthors &middot; {graph.stats.totalPapers} papers &middot; avg {graph.stats.avgAuthorsPerPaper.toFixed(1)} authors/paper
              </p>
              {coauthorCount > 200 && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                  Large network - performance may be affected
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <a
              href={graph.centerAuthor.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm"
            >
              View on DBLP &rarr;
            </a>
          </div>
        </div>
      </header>

      {/* Graph */}
      <div className="flex-1">
        <ErrorBoundary>
          <CoauthorGraphComponent graph={graph} />
        </ErrorBoundary>
      </div>
    </div>
  );
}

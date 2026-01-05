"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Author } from "@/types";

export default function SearchForm() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Author[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Handle click outside to close results
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Search failed");
        }

        setResults(data.authors);
        setShowResults(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  const handleSelectAuthor = (author: Author) => {
    setShowResults(false);
    setQuery(author.name);
    router.push(`/graph/${encodeURIComponent(author.pid)}?name=${encodeURIComponent(author.name)}`);
  };

  return (
    <div ref={wrapperRef} className="relative w-full max-w-xl">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder="Search for a researcher (e.g., 'Richard Karp')"
          className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 text-red-500 dark:text-red-400 text-sm">{error}</p>
      )}

      {showResults && results.length > 0 && (
        <div className="absolute z-10 w-full mt-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl max-h-80 overflow-y-auto">
          {results.map((author) => (
            <button
              key={author.pid}
              onClick={() => handleSelectAuthor(author)}
              className="w-full px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-slate-700 first:rounded-t-lg last:rounded-b-lg border-b border-gray-200 dark:border-slate-700 last:border-b-0"
            >
              <div className="font-medium text-gray-900 dark:text-white">{author.name}</div>
              {author.affiliation && (
                <div className="text-sm text-gray-600 dark:text-slate-300 mt-0.5 truncate">
                  {author.affiliation}
                </div>
              )}
              {author.aliases && author.aliases.length > 0 && (
                <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  Also known as: {author.aliases.slice(0, 2).join(", ")}
                  {author.aliases.length > 2 && "..."}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {showResults && results.length === 0 && query.length >= 2 && !isLoading && (
        <div className="absolute z-10 w-full mt-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl p-4 text-center text-gray-500 dark:text-slate-400">
          No authors found matching &quot;{query}&quot;
        </div>
      )}
    </div>
  );
}

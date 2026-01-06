"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Author } from "@/types";

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M12.5 12.5L17 17" strokeLinecap="round" />
    </svg>
  );
}

export default function SearchForm() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Author[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Handle click outside to close results
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowResults(false);
        setSelectedIndex(-1);
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
      setSelectedIndex(-1);
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
        setSelectedIndex(-1);
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

  const handleSelectAuthor = useCallback((author: Author) => {
    setShowResults(false);
    setSelectedIndex(-1);
    setQuery(author.name);
    router.push(`/graph/${encodeURIComponent(author.pid)}?name=${encodeURIComponent(author.name)}`);
  }, [router]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showResults || results.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleSelectAuthor(results[selectedIndex]);
        }
        break;
      case "Escape":
        setShowResults(false);
        setSelectedIndex(-1);
        break;
    }
  }, [showResults, results, selectedIndex, handleSelectAuthor]);

  return (
    <div ref={wrapperRef} className="relative w-full max-w-xl">
      <div className="relative group">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
          <SearchIcon className="w-5 h-5 text-neutral-400 dark:text-neutral-500 group-focus-within:text-amber-600 dark:group-focus-within:text-amber-500 transition-colors" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search researchers..."
          className="w-full pl-12 pr-12 py-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 dark:focus:border-amber-500 shadow-sm hover:shadow-md focus:shadow-md transition-shadow text-lg"
          role="combobox"
          aria-expanded={showResults}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls="search-results"
        />
        {isLoading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 text-red-500 dark:text-red-400 text-sm text-center">{error}</p>
      )}

      {showResults && results.length > 0 && (
        <div
          id="search-results"
          role="listbox"
          className="absolute z-10 w-full mt-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl max-h-80 overflow-y-auto animate-fade-in-scale"
        >
          {results.map((author, index) => (
            <button
              key={author.pid}
              role="option"
              aria-selected={index === selectedIndex}
              onClick={() => handleSelectAuthor(author)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full px-5 py-4 text-left first:rounded-t-2xl last:rounded-b-2xl transition-colors ${
                index === selectedIndex
                  ? "bg-amber-50 dark:bg-amber-500/10"
                  : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
              }`}
            >
              <div className="font-medium text-neutral-900 dark:text-white">{author.name}</div>
              {author.affiliation && (
                <div className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                  {author.affiliation}
                </div>
              )}
              {author.aliases && author.aliases.length > 0 && (
                <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-1.5">
                  aka {author.aliases.slice(0, 2).join(", ")}
                  {author.aliases.length > 2 && "..."}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {showResults && results.length === 0 && query.length >= 2 && !isLoading && (
        <div className="absolute z-10 w-full mt-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl p-6 text-center animate-fade-in-scale">
          <p className="text-neutral-500 dark:text-neutral-400">
            No researchers found for &quot;{query}&quot;
          </p>
          <p className="text-neutral-400 dark:text-neutral-500 text-sm mt-1">
            Try a different name or spelling
          </p>
        </div>
      )}
    </div>
  );
}

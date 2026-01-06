"use client";

import SearchForm from "@/components/SearchForm";
import { ThemeToggle } from "@/components/ThemeToggle";

function NetworkIcon() {
  return (
    <svg
      className="w-16 h-16 text-amber-600/80 dark:text-amber-500/80 mb-6"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      {/* Center node */}
      <circle cx="32" cy="32" r="6" fill="currentColor" opacity="0.9" />
      {/* Outer nodes */}
      <circle cx="12" cy="20" r="4" fill="currentColor" opacity="0.5" />
      <circle cx="52" cy="16" r="4" fill="currentColor" opacity="0.5" />
      <circle cx="52" cy="48" r="4" fill="currentColor" opacity="0.5" />
      <circle cx="12" cy="48" r="4" fill="currentColor" opacity="0.5" />
      <circle cx="32" cy="8" r="3" fill="currentColor" opacity="0.3" />
      <circle cx="56" cy="32" r="3" fill="currentColor" opacity="0.3" />
      <circle cx="32" cy="56" r="3" fill="currentColor" opacity="0.3" />
      <circle cx="8" cy="32" r="3" fill="currentColor" opacity="0.3" />
      {/* Edges */}
      <line x1="32" y1="26" x2="32" y2="11" strokeOpacity="0.3" />
      <line x1="38" y1="32" x2="53" y2="32" strokeOpacity="0.3" />
      <line x1="32" y1="38" x2="32" y2="53" strokeOpacity="0.3" />
      <line x1="26" y1="32" x2="11" y2="32" strokeOpacity="0.3" />
      <line x1="27" y1="28" x2="16" y2="22" strokeOpacity="0.4" />
      <line x1="37" y1="28" x2="48" y2="18" strokeOpacity="0.4" />
      <line x1="37" y1="36" x2="48" y2="46" strokeOpacity="0.4" />
      <line x1="27" y1="36" x2="16" y2="46" strokeOpacity="0.4" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 relative">
      {/* Theme Toggle */}
      <div className="absolute top-5 right-5">
        <ThemeToggle />
      </div>

      <main className="animate-fade-in flex flex-col items-center w-full max-w-xl">
        <NetworkIcon />

        <h1
          className="text-4xl sm:text-5xl font-semibold tracking-tight mb-3 text-center"
          style={{ color: "var(--text-primary)" }}
        >
          Coauthor Graph
        </h1>

        <p
          className="text-center text-lg mb-10 max-w-md leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          Explore research collaboration networks. Search for any computer science researcher.
        </p>

        <SearchForm />

        <footer className="mt-16 text-center">
          <p className="text-neutral-500 dark:text-neutral-500 text-sm">
            Data from{" "}
            <a
              href="https://dblp.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-600 dark:text-amber-500 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
            >
              dblp.org
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}

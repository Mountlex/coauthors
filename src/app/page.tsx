"use client";

import SearchForm from "@/components/SearchForm";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 relative">
      {/* Theme Toggle */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Coauthor Graph
        </h1>
        <p className="text-gray-600 dark:text-slate-400 max-w-lg mx-auto">
          Visualize research collaboration networks from DBLP.
          Search for a researcher to see their coauthor graph.
        </p>
      </div>

      <SearchForm />

      <div className="mt-12 text-center text-gray-500 dark:text-slate-500 text-sm">
        <p>
          Data sourced from{" "}
          <a
            href="https://dblp.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            DBLP
          </a>
          {" "}- the computer science bibliography
        </p>
      </div>
    </div>
  );
}

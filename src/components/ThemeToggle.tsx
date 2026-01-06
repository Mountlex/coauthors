"use client";

import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const buttonBase = "p-2.5 rounded-lg transition-all duration-150";
  const buttonActive = "bg-white dark:bg-neutral-800 text-amber-600 dark:text-amber-500 shadow-sm";
  const buttonInactive = "text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50";

  return (
    <div className="flex items-center gap-0.5 bg-neutral-100 dark:bg-neutral-900 rounded-xl p-1 border border-neutral-200/50 dark:border-neutral-800">
      <button
        onClick={() => setTheme("light")}
        className={`${buttonBase} ${theme === "light" ? buttonActive : buttonInactive}`}
        title="Light mode"
        aria-label="Light mode"
        aria-pressed={theme === "light"}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      <button
        onClick={() => setTheme("dark")}
        className={`${buttonBase} ${theme === "dark" ? buttonActive : buttonInactive}`}
        title="Dark mode"
        aria-label="Dark mode"
        aria-pressed={theme === "dark"}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      </button>
      <button
        onClick={() => setTheme("system")}
        className={`${buttonBase} ${theme === "system" ? buttonActive : buttonInactive}`}
        title="System preference"
        aria-label="System preference"
        aria-pressed={theme === "system"}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-neutral-50 dark:bg-neutral-950">
      <h1 className="text-4xl font-bold text-neutral-900 dark:text-white mb-4">404</h1>
      <p className="text-neutral-500 dark:text-neutral-400 mb-6">Page not found</p>
      <Link
        href="/"
        className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg transition-colors"
      >
        Back to Search
      </Link>
    </div>
  );
}

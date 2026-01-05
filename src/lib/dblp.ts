import type {
  Author,
  DBLPAuthorSearchResult,
  DBLPPublicationsResponse,
  DBLPPublicationHit,
  DBLPPublicationAuthor,
  Paper,
} from "@/types";

const DBLP_API_BASE = "https://dblp.org";

// LRU cache with size limit and thread-safe operations
const MAX_CACHE_SIZE = 500;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, { data: unknown; timestamp: number; accessedAt: number }>();

// Simple lock for cache operations to prevent race conditions
let cacheOperationInProgress = false;

async function withCacheLock<T>(operation: () => T): Promise<T> {
  // Wait if another operation is in progress
  while (cacheOperationInProgress) {
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  cacheOperationInProgress = true;
  try {
    return operation();
  } finally {
    cacheOperationInProgress = false;
  }
}

function evictLRU(): void {
  if (cache.size < MAX_CACHE_SIZE) return;

  let oldest = Infinity;
  let oldestKey = "";
  for (const [key, value] of cache) {
    if (value.accessedAt < oldest) {
      oldest = value.accessedAt;
      oldestKey = key;
    }
  }
  if (oldestKey) {
    cache.delete(oldestKey);
  }
}

// Rate limiting
const RATE_LIMIT_DELAY = 100; // ms between requests
const FETCH_TIMEOUT = 10000; // 10 seconds
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithCache<T>(url: string, retries = 3): Promise<T> {
  const now = Date.now();

  // Thread-safe cache read
  const cached = await withCacheLock(() => {
    const entry = cache.get(url);
    if (entry && now - entry.timestamp < CACHE_TTL) {
      entry.accessedAt = now;
      return entry.data as T;
    }
    return null;
  });

  if (cached !== null) {
    return cached;
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        // Rate limited - wait and retry with exponential backoff
        const delay = RATE_LIMIT_DELAY * Math.pow(2, attempt + 1);
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        throw new Error(`DBLP API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Thread-safe cache write
      await withCacheLock(() => {
        evictLRU();
        cache.set(url, { data, timestamp: now, accessedAt: now });
      });

      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("DBLP API timeout: Request took too long");
      }
      throw error;
    }
  }

  throw new Error("DBLP API error: Too many requests, please try again");
}

/**
 * Search for authors by name (basic info only, no paper counts)
 */
export async function searchAuthorsBasic(query: string): Promise<Author[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `${DBLP_API_BASE}/search/author/api?q=${encodedQuery}&format=json&h=20`;

  const result = await fetchWithCache<DBLPAuthorSearchResult>(url);

  if (!result.result.hits.hit) {
    return [];
  }

  // Extract basic info and affiliations
  return result.result.hits.hit.map((hit) => {
    const aliases = hit.info.aliases?.alias;
    const affiliation = extractAffiliation(hit.info.notes);

    return {
      pid: extractPidFromUrl(hit.info.url),
      name: cleanAuthorName(hit.info.author),
      url: hit.info.url,
      aliases: aliases
        ? Array.isArray(aliases)
          ? aliases.map(cleanAuthorName)
          : [cleanAuthorName(aliases)]
        : undefined,
      affiliation,
      paperCount: 0,
    };
  });
}

/**
 * Fetch paper count for a single author (exported for streaming)
 */
export async function fetchAuthorPaperCount(authorName: string): Promise<number> {
  const count = await getAuthorPaperCount(authorName);
  await sleep(RATE_LIMIT_DELAY);
  return count;
}

/**
 * Search for authors by name (with paper counts - non-streaming)
 */
export async function searchAuthors(query: string): Promise<Author[]> {
  const authors = await searchAuthorsBasic(query);

  // Fetch paper counts in parallel batches to balance speed and rate limiting
  const BATCH_SIZE = 5;
  for (let i = 0; i < authors.length; i += BATCH_SIZE) {
    const batch = authors.slice(i, i + BATCH_SIZE);
    const counts = await Promise.all(
      batch.map(a => getAuthorPaperCount(a.name))
    );
    batch.forEach((author, idx) => {
      author.paperCount = counts[idx];
    });
    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < authors.length) {
      await sleep(RATE_LIMIT_DELAY * 2);
    }
  }

  // Sort by paper count (highest first)
  authors.sort((a, b) => (b.paperCount || 0) - (a.paperCount || 0));

  return authors;
}

/**
 * Extract affiliation from DBLP notes
 */
function extractAffiliation(notes?: { note: { "@type": string; text: string }[] | { "@type": string; text: string } }): string | undefined {
  if (!notes?.note) return undefined;

  const noteArray = Array.isArray(notes.note) ? notes.note : [notes.note];
  const affiliationNote = noteArray.find((n) => n["@type"] === "affiliation");

  return affiliationNote?.text;
}

/**
 * Get paper count for an author (fast query with h=0)
 */
async function getAuthorPaperCount(authorName: string): Promise<number> {
  try {
    const nameForSearch = authorName.replace(/ /g, "_");
    const url = `${DBLP_API_BASE}/search/publ/api?q=author:${encodeURIComponent(nameForSearch)}:&format=json&h=0`;
    const result = await fetchWithCache<DBLPPublicationsResponse>(url);
    return parseInt(result.result.hits["@total"], 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Get all publications for an author by their name and PID
 */
export async function getAuthorPublications(
  pid: string,
  authorName?: string
): Promise<{ author: Author; publications: DBLPPublicationHit[] }> {
  let name = authorName;
  let affiliation: string | undefined;

  // Search for author to get name (if needed) and affiliation
  const searchTerm = authorName || pid.split("/").pop() || pid;
  const searchUrl = `${DBLP_API_BASE}/search/author/api?q=${encodeURIComponent(searchTerm)}&format=json&h=50`;
  const authorResult = await fetchWithCache<DBLPAuthorSearchResult>(searchUrl);

  const matchingHit = authorResult.result.hits.hit?.find((hit) => {
    const hitPid = extractPidFromUrl(hit.info.url);
    return hitPid === pid;
  });

  if (matchingHit) {
    name = matchingHit.info.author;
    affiliation = extractAffiliation(matchingHit.info.notes);
  }

  if (!name) {
    // Can't find author name, return empty
    return {
      author: {
        pid,
        name: pid,
        url: `${DBLP_API_BASE}/pid/${pid}`,
      },
      publications: [],
    };
  }

  const author: Author = {
    pid,
    name: cleanAuthorName(name),
    url: `${DBLP_API_BASE}/pid/${pid}`,
    affiliation,
  };

  // Convert name to DBLP search format (replace spaces with underscores)
  const authorNameForSearch = name.replace(/ /g, "_");

  // Get publications using the publication search API with author name
  const pubUrl = `${DBLP_API_BASE}/search/publ/api?q=author:${encodeURIComponent(authorNameForSearch)}:&format=json&h=1000`;
  const pubResult = await fetchWithCache<DBLPPublicationsResponse>(pubUrl);

  return {
    author,
    publications: pubResult.result.hits.hit || [],
  };
}

/**
 * Extract coauthors from a list of publications
 */
export function extractCoauthors(
  centerPid: string,
  publications: DBLPPublicationHit[]
): Map<string, { author: Author; papers: Paper[] }> {
  const coauthors = new Map<string, { author: Author; papers: Paper[] }>();

  for (const pub of publications) {
    if (!pub.info.authors) continue;

    const authors = Array.isArray(pub.info.authors.author)
      ? pub.info.authors.author
      : [pub.info.authors.author];

    const paper: Paper = {
      title: pub.info.title,
      year: pub.info.year,
      venue: pub.info.venue,
      url: pub.info.url,
    };

    for (const author of authors) {
      const authorPid = author["@pid"] || slugify(author.text);

      // Skip the center author (compare PIDs directly, not string contains)
      if (authorPid === centerPid) {
        continue;
      }

      const existing = coauthors.get(authorPid);
      if (existing) {
        existing.papers.push(paper);
      } else {
        coauthors.set(authorPid, {
          author: {
            pid: authorPid,
            name: cleanAuthorName(author.text),
            url: author["@pid"]
              ? `${DBLP_API_BASE}/pid/${author["@pid"]}`
              : "#",
          },
          papers: [paper],
        });
      }
    }
  }

  return coauthors;
}

/**
 * Extract PID from DBLP URL
 * e.g., "https://dblp.org/pid/123/4567" -> "123/4567"
 */
function extractPidFromUrl(url: string): string {
  const match = url.match(/\/pid\/(.+)$/);
  return match ? match[1] : url;
}

/**
 * Create a slug from author name (fallback when PID is not available)
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Remove DBLP disambiguation numbers from author names
 * e.g., "John Smith 0001" -> "John Smith"
 */
function cleanAuthorName(name: string): string {
  return name.replace(/\s+\d{4}$/, "").trim();
}

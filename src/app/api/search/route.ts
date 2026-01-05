import { NextRequest, NextResponse } from "next/server";
import { searchAuthorsBasic } from "@/lib/dblp";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "@/lib/rateLimit";
import type { SearchResponse, ApiError } from "@/types";

export async function GET(request: NextRequest) {
  // Rate limiting
  const clientIP = getClientIP(request);
  const rateLimitResult = checkRateLimit(`search:${clientIP}`, RATE_LIMITS.search);

  if (!rateLimitResult.allowed) {
    return NextResponse.json<ApiError>(
      { error: "Too Many Requests", message: "Rate limit exceeded. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");

  if (!query || query.trim().length < 2) {
    return NextResponse.json<ApiError>(
      { error: "Bad Request", message: "Query must be at least 2 characters" },
      { status: 400 }
    );
  }

  try {
    const authors = await searchAuthorsBasic(query.trim());
    return NextResponse.json<SearchResponse>({ authors });
  } catch (error) {
    console.error("Search error:", error);

    // Sanitize error message in production
    const isDev = process.env.NODE_ENV === "development";
    const message =
      isDev && error instanceof Error
        ? error.message
        : "Failed to search authors. Please try again.";

    return NextResponse.json<ApiError>(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { searchAuthorsBasic } from "@/lib/dblp";
import { checkRateLimit, getClientIP, RATE_LIMITS, logRateLimitViolation } from "@/lib/rateLimit";
import { rateLimitResponse, serverErrorResponse } from "@/lib/apiHelpers";
import type { SearchResponse, ApiError } from "@/types";

export async function GET(request: NextRequest) {
  // Rate limiting
  const clientIP = getClientIP(request);
  const rateLimitResult = checkRateLimit(`search:${clientIP}`, RATE_LIMITS.search);

  if (!rateLimitResult.allowed) {
    logRateLimitViolation(`search:${clientIP}`, rateLimitResult.resetTime);
    return rateLimitResponse(rateLimitResult);
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
    return serverErrorResponse(error, "Failed to search authors. Please try again.");
  }
}

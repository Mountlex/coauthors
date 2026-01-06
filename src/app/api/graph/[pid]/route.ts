import { NextRequest, NextResponse } from "next/server";
import { buildCoauthorGraph } from "@/lib/graph";
import { checkRateLimit, getClientIP, RATE_LIMITS, logRateLimitViolation } from "@/lib/rateLimit";
import { rateLimitResponse, serverErrorResponse } from "@/lib/apiHelpers";
import type { GraphResponse, ApiError } from "@/types";

// DBLP PIDs are like "123/4567" or "a/AuthorName" or "h/JohnDoe-1"
const PID_PATTERN = /^[a-zA-Z0-9]+(\/[a-zA-Z0-9_-]+)+$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pid: string }> }
) {
  // Rate limiting
  const clientIP = getClientIP(request);
  const rateLimitResult = checkRateLimit(`graph:${clientIP}`, RATE_LIMITS.graph);

  if (!rateLimitResult.allowed) {
    logRateLimitViolation(`graph:${clientIP}`, rateLimitResult.resetTime);
    return rateLimitResponse(rateLimitResult);
  }

  const { pid } = await params;

  if (!pid) {
    return NextResponse.json<ApiError>(
      { error: "Bad Request", message: "Author PID is required" },
      { status: 400 }
    );
  }

  // Decode the PID (it may contain slashes which are encoded)
  const decodedPid = decodeURIComponent(pid);

  // Validate PID format to prevent path traversal
  if (!PID_PATTERN.test(decodedPid)) {
    return NextResponse.json<ApiError>(
      { error: "Bad Request", message: "Invalid author PID format" },
      { status: 400 }
    );
  }

  // Get author name from query params if provided
  const searchParams = request.nextUrl.searchParams;
  const authorName = searchParams.get("name") || undefined;

  try {
    const graph = await buildCoauthorGraph(decodedPid, authorName);
    return NextResponse.json<GraphResponse>(
      { graph },
      {
        headers: {
          // Cache for 5 minutes, allow stale-while-revalidate for 1 hour
          "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        },
      }
    );
  } catch (error) {
    console.error("Graph building error:", error);
    return serverErrorResponse(error, "Failed to build coauthor graph. Please try again.");
  }
}

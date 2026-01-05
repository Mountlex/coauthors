import { NextRequest, NextResponse } from "next/server";
import { buildCoauthorGraph } from "@/lib/graph";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "@/lib/rateLimit";
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
    return NextResponse.json<GraphResponse>({ graph });
  } catch (error) {
    console.error("Graph building error:", error);

    // Sanitize error message in production
    const isDev = process.env.NODE_ENV === "development";
    const message =
      isDev && error instanceof Error
        ? error.message
        : "Failed to build coauthor graph. Please try again.";

    return NextResponse.json<ApiError>(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
}

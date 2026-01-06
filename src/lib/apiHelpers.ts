/**
 * Shared utilities for API routes
 */
import { NextResponse } from "next/server";
import type { ApiError } from "@/types";

interface RateLimitResult {
  allowed: boolean;
  resetTime: number;
}

/**
 * Create a rate limit error response
 */
export function rateLimitResponse(rateLimitResult: RateLimitResult): NextResponse<ApiError> {
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

/**
 * Sanitize error message based on environment
 * Shows detailed errors in development, generic messages in production
 */
export function sanitizeErrorMessage(error: unknown, defaultMessage: string): string {
  const isDev = process.env.NODE_ENV === "development";
  return isDev && error instanceof Error ? error.message : defaultMessage;
}

/**
 * Create an internal server error response
 */
export function serverErrorResponse(error: unknown, defaultMessage: string): NextResponse<ApiError> {
  const message = sanitizeErrorMessage(error, defaultMessage);
  return NextResponse.json<ApiError>(
    { error: "Internal Server Error", message },
    { status: 500 }
  );
}

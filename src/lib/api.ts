import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

/** Standard JSON error response. */
export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Guard for route handlers: returns the authenticated user or throws an
 * `ApiError` that `handle()` turns into a 401 response.
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new ApiError("Unauthorized", 401);
  }
  return user;
}

/** Wrap a route handler so thrown ApiErrors become JSON responses. */
export async function handle(fn: () => Promise<NextResponse>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.message, err.status);
    }
    console.error(err);
    return apiError("Something went wrong", 500);
  }
}

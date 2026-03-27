import type { Context } from "hono";

interface SuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

interface ErrorResponse {
  success: false;
  error: string;
  message?: string;
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

export function ok<T>(c: Context, data: T, status = 200, message?: string) {
  const body: SuccessResponse<T> = { success: true, data, ...(message && { message }) };
  return c.json(body, status as 200);
}

export function fail(c: Context, error: string, status = 400, message?: string) {
  const body: ErrorResponse = { success: false, error, ...(message && { message }) };
  return c.json(body, status as 400);
}

import type { Context, Next } from "hono";
import { sign, verify } from "hono/jwt";
import { HTTPException } from "hono/http-exception";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET!;
const ACCESS_EXPIRES = "15m";
const REFRESH_EXPIRES = "7d";

export interface AuthJWTPayload {
  sub: string;
  email: string;
}

export async function signAccessToken(
  payload: AuthJWTPayload,
): Promise<string> {
  return sign(
    { sub: payload.sub, email: payload.email, type: "access" },
    JWT_SECRET,
    "HS256",
  );
}

export async function signRefreshToken(
  payload: AuthJWTPayload,
): Promise<string> {
  return sign(
    { sub: payload.sub, email: payload.email, type: "refresh" },
    JWT_SECRET,
    "HS256",
  );
}

export async function verifyToken(token: string): Promise<AuthJWTPayload> {
  const decoded = await verify(token, JWT_SECRET, "HS256");
  return decoded as unknown as AuthJWTPayload;
}

export async function authMiddleware(c: Context, next: Next) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new HTTPException(401, {
      message: "Missing or invalid Authorization header",
    });
  }

  const token = header.slice(7);
  let payload: AuthJWTPayload;
  try {
    payload = await verifyToken(token);
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (!user || !user.isActive) {
    throw new HTTPException(401, { message: "User not found or deactivated" });
  }

  c.set("user", user);
  await next();
}

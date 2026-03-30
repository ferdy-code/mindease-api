import { Hono } from "hono";
import { createHash } from "crypto";
import { eq, and, gt } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import { db } from "@/db";
import { users, refreshTokens } from "@/db/schema";
import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  authMiddleware,
} from "@/middleware/auth";
import { registerSchema, loginSchema, refreshSchema } from "@/utils/validators";
import { ok } from "@/utils/response";

const auth = new Hono();

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function issueTokens(userId: string, email: string) {
  const payload = { sub: userId, email };
  const accessToken = await signAccessToken(payload);
  const refreshToken = await signRefreshToken(payload);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(refreshToken),
    expiresAt,
  });

  return { accessToken, refreshToken };
}

auth.post("/register", async (c) => {
  const body = registerSchema.parse(await c.req.json());

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1);

  if (existing.length > 0) {
    throw new HTTPException(409, { message: "Email already registered" });
  }

  const hashedPassword = await Bun.password.hash(body.password, {
    algorithm: "bcrypt",
    cost: 12,
  });
  const [newUser] = await db
    .insert(users)
    .values({ email: body.email, password: hashedPassword, name: body.name })
    .returning({ id: users.id, email: users.email, name: users.name });

  const tokens = await issueTokens(newUser.id, newUser.email);

  return ok(
    c,
    {
      user: { id: newUser.id, email: newUser.email, name: newUser.name },
      ...tokens,
    },
    201,
    "Registration successful",
  );
});

auth.post("/login", async (c) => {
  const body = loginSchema.parse(await c.req.json());

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      password: users.password,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1);

  if (!user || !(await Bun.password.verify(body.password, user.password))) {
    throw new HTTPException(401, { message: "Invalid email or password" });
  }

  if (!user.isActive) {
    throw new HTTPException(403, { message: "Account is deactivated" });
  }

  const tokens = await issueTokens(user.id, user.email);

  return ok(
    c,
    {
      user: { id: user.id, email: user.email, name: user.name },
      ...tokens,
    },
    200,
    "Login successful",
  );
});

auth.post("/refresh", async (c) => {
  const body = refreshSchema.parse(await c.req.json());

  let payload;
  try {
    payload = await verifyToken(body.refreshToken);
  } catch {
    throw new HTTPException(401, {
      message: "Invalid or expired refresh token",
    });
  }

  const tokenHash = hashToken(body.refreshToken);
  const [stored] = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tokenHash, tokenHash),
        eq(refreshTokens.isRevoked, false),
        gt(refreshTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!stored) {
    throw new HTTPException(401, {
      message: "Refresh token not found or revoked",
    });
  }

  await db
    .update(refreshTokens)
    .set({ isRevoked: true, updatedAt: new Date() })
    .where(eq(refreshTokens.id, stored.id));

  const tokens = await issueTokens(payload.sub, payload.email);

  return ok(c, tokens, 200, "Token refreshed");
});

auth.post("/logout", authMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const user = c.get("user");

  if (body.refreshToken) {
    const tokenHash = hashToken(body.refreshToken);
    await db
      .update(refreshTokens)
      .set({ isRevoked: true, updatedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          eq(refreshTokens.userId, user.id),
        ),
      );
  } else {
    await db
      .update(refreshTokens)
      .set({ isRevoked: true, updatedAt: new Date() })
      .where(eq(refreshTokens.userId, user.id));
  }

  return ok(c, null, 200, "Logout successful");
});

export default auth;

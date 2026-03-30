import { Hono } from "hono";
import { eq, and, desc, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import { db } from "@/db";
import { meditations, userSessionLogs } from "@/db/schema";
import { authMiddleware } from "@/middleware/auth";
import { ok } from "@/utils/response";

const meditation = new Hono();

meditation.get("/", async (c) => {
  const category = c.req.query("category");
  const type = c.req.query("type");

  const conditions = [eq(meditations.isActive, true)];

  if (category) {
    conditions.push(
      eq(
        meditations.category,
        category as "morning" | "stress" | "sleep" | "focus",
      ),
    );
  }
  if (type) {
    conditions.push(eq(meditations.type, type as "meditation" | "breathing"));
  }

  const items = await db
    .select()
    .from(meditations)
    .where(and(...conditions))
    .orderBy(meditations.title);

  return ok(c, items);
});

meditation.get("/history", authMiddleware, async (c) => {
  const user = c.get("user");
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 10));
  const offset = (page - 1) * limit;

  const conditions = [
    eq(userSessionLogs.userId, user.id),
    sql`${userSessionLogs.activityType} IN ('meditation_session', 'breathing_session')`,
  ];

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userSessionLogs)
    .where(and(...conditions));

  const logs = await db
    .select()
    .from(userSessionLogs)
    .where(and(...conditions))
    .orderBy(desc(userSessionLogs.createdAt))
    .limit(limit)
    .offset(offset);

  return ok(c, {
    entries: logs,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  });
});

meditation.get("/:id", async (c) => {
  const id = c.req.param("id")!;

  const [item] = await db
    .select()
    .from(meditations)
    .where(and(eq(meditations.id, id), eq(meditations.isActive, true)))
    .limit(1);

  if (!item) {
    throw new HTTPException(404, { message: "Meditation not found" });
  }

  return ok(c, item);
});

meditation.post("/:id/complete", authMiddleware, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id")!;

  const [item] = await db
    .select()
    .from(meditations)
    .where(and(eq(meditations.id, id), eq(meditations.isActive, true)))
    .limit(1);

  if (!item) {
    throw new HTTPException(404, { message: "Meditation not found" });
  }

  const body = await c.req.json().catch(() => ({}));
  const durationSeconds =
    typeof body.durationSeconds === "number"
      ? body.durationSeconds
      : item.durationMinutes * 60;

  const [log] = await db
    .insert(userSessionLogs)
    .values({
      userId: user.id,
      activityType: `${item.type}_session`,
      durationSeconds,
      metadata: {
        meditationId: item.id,
        title: item.title,
        category: item.category,
        type: item.type,
      },
    })
    .returning();

  return ok(c, log, 201, "Session completed");
});

export default meditation;

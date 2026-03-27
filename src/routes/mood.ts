import { Hono } from "hono";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import { db } from "@/db";
import { moodEntries } from "@/db/schema";
import { authMiddleware } from "@/middleware/auth";
import { createMoodSchema, updateMoodSchema } from "@/utils/validators";
import { ok, fail } from "@/utils/response";

const mood = new Hono();

mood.use("/*", authMiddleware);

mood.post("/", async (c) => {
  const user = c.get("user");
  const body = createMoodSchema.parse(await c.req.json());

  const [entry] = await db
    .insert(moodEntries)
    .values({ ...body, userId: user.id })
    .returning();

  return ok(c, entry, 201, "Mood entry created");
});

mood.get("/", async (c) => {
  const user = c.get("user");
  const from = c.req.query("from");
  const to = c.req.query("to");

  const conditions = [eq(moodEntries.userId, user.id)];

  if (from) {
    conditions.push(gte(moodEntries.createdAt, new Date(from)));
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    conditions.push(lte(moodEntries.createdAt, toDate));
  }

  const entries = await db
    .select()
    .from(moodEntries)
    .where(and(...conditions))
    .orderBy(desc(moodEntries.createdAt));

  return ok(c, entries);
});

mood.get("/today", async (c) => {
  const user = c.get("user");

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const entries = await db
    .select()
    .from(moodEntries)
    .where(
      and(
        eq(moodEntries.userId, user.id),
        gte(moodEntries.createdAt, startOfDay),
        lte(moodEntries.createdAt, endOfDay),
      )
    )
    .orderBy(desc(moodEntries.createdAt));

  return ok(c, entries);
});

mood.get("/stats", async (c) => {
  const user = c.get("user");
  const period = c.req.query("period") === "month" ? "month" : "week";

  const since = new Date();
  if (period === "month") {
    since.setMonth(since.getMonth() - 1);
  } else {
    since.setDate(since.getDate() - 7);
  }
  since.setHours(0, 0, 0, 0);

  const entries = await db
    .select()
    .from(moodEntries)
    .where(
      and(
        eq(moodEntries.userId, user.id),
        gte(moodEntries.createdAt, since),
      )
    )
    .orderBy(desc(moodEntries.createdAt));

  if (entries.length === 0) {
    return ok(c, {
      period,
      totalEntries: 0,
      averageScore: null,
      distribution: { terrible: 0, bad: 0, okay: 0, good: 0, great: 0 },
      currentStreak: 0,
    });
  }

  const averageScore = Math.round(
    (entries.reduce((sum, e) => sum + e.moodScore, 0) / entries.length) * 100,
  ) / 100;

  const distribution: Record<string, number> = {
    terrible: 0,
    bad: 0,
    okay: 0,
    good: 0,
    great: 0,
  };
  for (const entry of entries) {
    distribution[entry.moodLabel] = (distribution[entry.moodLabel] || 0) + 1;
  }

  const streakRows = await db
    .select({ date: sql<string>`DATE(${moodEntries.createdAt})`.as("date") })
    .from(moodEntries)
    .where(eq(moodEntries.userId, user.id))
    .groupBy(sql`DATE(${moodEntries.createdAt})`)
    .orderBy(sql`DATE(${moodEntries.createdAt}) DESC`);

  let currentStreak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < streakRows.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    const rowDate = new Date(streakRows[i].date + "T00:00:00");
    if (rowDate.getTime() === expected.getTime()) {
      currentStreak++;
    } else {
      break;
    }
  }

  return ok(c, {
    period,
    totalEntries: entries.length,
    averageScore,
    distribution,
    currentStreak,
  });
});

mood.put("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = updateMoodSchema.parse(await c.req.json());

  const [existing] = await db
    .select({ id: moodEntries.id, userId: moodEntries.userId })
    .from(moodEntries)
    .where(eq(moodEntries.id, id))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: "Mood entry not found" });
  }
  if (existing.userId !== user.id) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const [updated] = await db
    .update(moodEntries)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(moodEntries.id, id))
    .returning();

  return ok(c, updated, 200, "Mood entry updated");
});

mood.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select({ id: moodEntries.id, userId: moodEntries.userId })
    .from(moodEntries)
    .where(eq(moodEntries.id, id))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: "Mood entry not found" });
  }
  if (existing.userId !== user.id) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  await db.delete(moodEntries).where(eq(moodEntries.id, id));

  return ok(c, null, 200, "Mood entry deleted");
});

export default mood;

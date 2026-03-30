import { Hono } from "hono";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import { db } from "@/db";
import { moodEntries } from "@/db/schema";
import { authMiddleware } from "@/middleware/auth";
import { generateWeeklyInsight } from "@/services/insight.service";
import { ok } from "@/utils/response";

const insights = new Hono();

insights.use("/*", authMiddleware);

insights.get("/weekly", async (c) => {
  const user = c.get("user");

  const insight = await generateWeeklyInsight(user.id);

  return ok(c, insight);
});

insights.get("/mood-trend", async (c) => {
  const user = c.get("user");
  const days = Math.min(90, Math.max(7, Number(c.req.query("days")) || 30));

  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      date: sql<string>`DATE(${moodEntries.createdAt})`.as("date"),
      avgScore: sql<number>`ROUND(AVG(${moodEntries.moodScore})::numeric, 2)`.as("avg_score"),
      count: sql<number>`count(*)::int`.as("count"),
    })
    .from(moodEntries)
    .where(and(eq(moodEntries.userId, user.id), gte(moodEntries.createdAt, since)))
    .groupBy(sql`DATE(${moodEntries.createdAt})`)
    .orderBy(sql`DATE(${moodEntries.createdAt})`);

  return ok(c, rows.map((r) => ({
    date: r.date,
    score: Number(r.avgScore),
    entries: r.count,
  })));
});

insights.get("/streak", async (c) => {
  const user = c.get("user");

  const streakDays = await db
    .select({ date: sql<string>`DATE(${moodEntries.createdAt})`.as("date") })
    .from(moodEntries)
    .where(eq(moodEntries.userId, user.id))
    .groupBy(sql`DATE(${moodEntries.createdAt})`)
    .orderBy(sql`DATE(${moodEntries.createdAt}) DESC`);

  let currentStreak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < streakDays.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    const rowDate = new Date(streakDays[i].date + "T00:00:00");
    if (rowDate.getTime() === expected.getTime()) {
      currentStreak++;
    } else {
      break;
    }
  }

  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  for (const row of [...streakDays].reverse()) {
    const d = new Date(row.date + "T00:00:00");
    if (prevDate) {
      const diff = (d.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
      tempStreak = diff === 1 ? tempStreak + 1 : 1;
    } else {
      tempStreak = 1;
    }
    longestStreak = Math.max(longestStreak, tempStreak);
    prevDate = d;
  }

  return ok(c, { currentStreak, longestStreak, totalDays: streakDays.length });
});

export default insights;

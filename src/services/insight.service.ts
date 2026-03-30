import { GoogleGenerativeAI } from "@google/generative-ai";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  moodEntries,
  journalEntries,
  userSessionLogs,
  weeklyInsights,
} from "@/db/schema";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

function getWeekBounds() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { weekStart: monday, weekEnd: sunday };
}

async function gatherData(userId: string, since: Date) {
  const moods = await db
    .select({
      moodScore: moodEntries.moodScore,
      moodLabel: moodEntries.moodLabel,
      note: moodEntries.note,
      activities: moodEntries.activities,
      createdAt: moodEntries.createdAt,
    })
    .from(moodEntries)
    .where(
      and(eq(moodEntries.userId, userId), gte(moodEntries.createdAt, since)),
    )
    .orderBy(desc(moodEntries.createdAt));

  const [{ count: journalCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.userId, userId),
        gte(journalEntries.createdAt, since),
      ),
    );

  const [{ count: meditationCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userSessionLogs)
    .where(
      and(
        eq(userSessionLogs.userId, userId),
        gte(userSessionLogs.createdAt, since),
        sql`${userSessionLogs.activityType} IN ('meditation_session', 'breathing_session')`,
      ),
    );

  return { moods, journalCount, meditationCount };
}

function buildSummaryText(data: Awaited<ReturnType<typeof gatherData>>) {
  const { moods, journalCount, meditationCount } = data;

  const avg =
    moods.length > 0
      ? (moods.reduce((s, m) => s + m.moodScore, 0) / moods.length).toFixed(2)
      : "N/A";

  const dist: Record<string, number> = {};
  for (const m of moods) {
    dist[m.moodLabel] = (dist[m.moodLabel] || 0) + 1;
  }

  const allActivities = moods.flatMap((m) => m.activities ?? []);
  const actDist: Record<string, number> = {};
  for (const a of allActivities) {
    actDist[a] = (actDist[a] || 0) + 1;
  }
  const topActivities = Object.entries(actDist)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => `${name}(${count}x)`)
    .join(", ");

  return [
    `Mood rata-rata: ${avg}/5`,
    `Distribusi mood: ${
      Object.entries(dist)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ") || "Tidak ada data"
    }`,
    `Aktivitas teratas: ${topActivities || "Tidak ada data"}`,
    `Jurnal ditulis: ${journalCount}`,
    `Sesi meditasi/pernapasan: ${meditationCount}`,
  ].join("\n");
}

export async function generateWeeklyInsight(userId: string) {
  const { weekStart, weekEnd } = getWeekBounds();

  const [cached] = await db
    .select()
    .from(weeklyInsights)
    .where(
      and(
        eq(weeklyInsights.userId, userId),
        eq(weeklyInsights.weekStart, weekStart),
      ),
    )
    .limit(1);

  if (cached) {
    return cached;
  }

  const data = await gatherData(userId, weekStart);
  const summaryText = buildSummaryText(data);

  const prompt = `Analisis data wellness user ini dan berikan insight mingguan:
${summaryText}

Berikan respons dalam format berikut (dalam Bahasa Indonesia, hangat & suportif):

**Ringkasan Kondisi:**
[tulis ringkasan 2-3 kalimat tentang kondisi mood user minggu ini]

**Pola yang Terlihat:**
[tulis 2-3 pola yang bisa diidentifikasi dari data]

**Saran Actionable:**
[berikan 2-3 saran praktis yang bisa dilakukan user minggu depan]`;

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(prompt);
  const response = result.response.text();

  const sections = parseSections(response);

  const [insight] = await db
    .insert(weeklyInsights)
    .values({
      userId,
      weekStart,
      weekEnd,
      summary: sections.summary,
      patterns: sections.patterns,
      suggestions: sections.suggestions,
      moodAverage:
        data.moods.length > 0
          ? Math.round(
              (data.moods.reduce((s, m) => s + m.moodScore, 0) /
                data.moods.length) *
                100,
            ) / 100
          : null,
      rawData: {
        moodCount: data.moods.length,
        journalCount: data.journalCount,
        meditationCount: data.meditationCount,
        summaryText,
      },
    })
    .returning();

  return insight;
}

function parseSections(text: string) {
  const summaryMatch = text.match(
    /\*?\*?Ringkasan(?:\s+Kondisi)?\*?\*?\s*[\n:]\s*([\s\S]*?)(?=\*?\*?Pola|\*?\*?Saran|$)/i,
  );
  const patternsMatch = text.match(
    /\*?\*?Pola(?:\s+yang\s+Terlihat)?\*?\*?\s*[\n:]\s*([\s\S]*?)(?=\*?\*?Saran|$)/i,
  );
  const suggestionsMatch = text.match(
    /\*?\*?Saran(?:\s+Actionable)?\*?\*?\s*[\n:]\s*([\s\S]*?)$/i,
  );

  return {
    summary: summaryMatch?.[1]?.trim() || text,
    patterns: patternsMatch?.[1]?.trim() || null,
    suggestions: suggestionsMatch?.[1]?.trim() || null,
  };
}

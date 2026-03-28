import { Hono } from "hono";
import { stream } from "hono/streaming";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import { db } from "@/db";
import { chatSessions, chatMessages, moodEntries } from "@/db/schema";
import { authMiddleware } from "@/middleware/auth";
import { createChatSessionSchema, sendMessageSchema } from "@/utils/validators";
import { streamChat } from "@/services/gemini.service";
import { ok } from "@/utils/response";

const chat = new Hono();

chat.use("/*", authMiddleware);

const RATE_LIMIT = 50;

chat.post("/sessions", async (c) => {
  const user = c.get("user");
  const body = createChatSessionSchema.parse(await c.req.json());

  const [session] = await db
    .insert(chatSessions)
    .values({ userId: user.id, title: body.title ?? null })
    .returning();

  return ok(c, session, 201, "Chat session created");
});

chat.get("/sessions", async (c) => {
  const user = c.get("user");

  const lastMessageSub = sql`(
    SELECT row_to_json(m.*) FROM (
      SELECT content, role, created_at as "createdAt"
      FROM chat_messages
      WHERE session_id = ${chatSessions.id}
      ORDER BY created_at DESC LIMIT 1
    ) m
  )`;

  const sessions = await db
    .select({
      id: chatSessions.id,
      userId: chatSessions.userId,
      title: chatSessions.title,
      isActive: chatSessions.isActive,
      createdAt: chatSessions.createdAt,
      updatedAt: chatSessions.updatedAt,
      lastMessage: sql<{
        content: string;
        role: string;
        createdAt: string;
      } | null>`${lastMessageSub}`,
    })
    .from(chatSessions)
    .where(eq(chatSessions.userId, user.id))
    .orderBy(desc(chatSessions.createdAt));

  return ok(c, sessions);
});

chat.post("/send", async (c) => {
  const user = c.get("user");
  const body = sendMessageSchema.parse(await c.req.json());

  const [session] = await db
    .select()
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.id, body.sessionId),
        eq(chatSessions.userId, user.id),
      ),
    )
    .limit(1);

  if (!session) {
    throw new HTTPException(404, { message: "Chat session not found" });
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatMessages)
    .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
    .where(
      and(
        eq(chatSessions.userId, user.id),
        eq(chatMessages.role, "user"),
        gte(chatMessages.createdAt, startOfDay),
      ),
    );

  if (count >= RATE_LIMIT) {
    throw new HTTPException(429, {
      message: `Rate limit exceeded: ${RATE_LIMIT} messages per day`,
    });
  }

  await db.insert(chatMessages).values({
    sessionId: session.id,
    role: "user",
    content: body.message,
  });

  const historyRows = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, session.id))
    .orderBy(chatMessages.createdAt);

  const history = historyRows
    .filter((m) => m.role === "user" || m.role === "model")
    .slice(0, -1)
    .map((m) => ({
      role: m.role as "user" | "model",
      content: m.content,
    }));

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const recentMoods = await db
    .select({
      score: moodEntries.moodScore,
      label: moodEntries.moodLabel,
      note: moodEntries.note,
      createdAt: moodEntries.createdAt,
    })
    .from(moodEntries)
    .where(
      and(
        eq(moodEntries.userId, user.id),
        gte(moodEntries.createdAt, sevenDaysAgo),
      ),
    )
    .orderBy(desc(moodEntries.createdAt));

  const userContext = {
    userName: user.name,
    recentMoods: recentMoods.map((m) => ({
      date: m.createdAt.toISOString().split("T")[0],
      score: m.score,
      label: m.label,
      note: m.note,
    })),
  };

  const geminiStream = await streamChat(history, body.message, userContext);

  let fullResponse = "";

  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");

  return stream(c, async (s) => {
    const reader = geminiStream.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);

        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;

          try {
            const parsed = JSON.parse(payload) as { text: string };
            fullResponse += parsed.text;
          } catch {
            // skip malformed chunks
          }
        }

        await s.write(value);
      }
    } finally {
      reader.releaseLock();
    }

    if (fullResponse) {
      await db.insert(chatMessages).values({
        sessionId: session.id,
        role: "model",
        content: fullResponse,
      });
    }
  });
});

chat.get("/sessions/:id/messages", async (c) => {
  const user = c.get("user");
  const sessionId = c.req.param("id");
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 20));
  const offset = (page - 1) * limit;

  const [session] = await db
    .select()
    .from(chatSessions)
    .where(
      and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, user.id)),
    )
    .limit(1);

  if (!session) {
    throw new HTTPException(404, { message: "Chat session not found" });
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId));

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(chatMessages.createdAt)
    .limit(limit)
    .offset(offset);

  return ok(c, {
    messages,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  });
});

chat.delete("/sessions/:id", async (c) => {
  const user = c.get("user");
  const sessionId = c.req.param("id");

  const [session] = await db
    .select()
    .from(chatSessions)
    .where(
      and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, user.id)),
    )
    .limit(1);

  if (!session) {
    throw new HTTPException(404, { message: "Chat session not found" });
  }

  await db.delete(chatSessions).where(eq(chatSessions.id, sessionId));

  return ok(c, null, 200, "Chat session deleted");
});

export default chat;

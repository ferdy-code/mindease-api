import { Hono } from "hono";
import { eq, and, desc, sql, ilike, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import { db } from "@/db";
import { journalEntries } from "@/db/schema";
import { authMiddleware } from "@/middleware/auth";
import { createJournalSchema, updateJournalSchema } from "@/utils/validators";
import { ok } from "@/utils/response";

const journal = new Hono();

journal.use("/*", authMiddleware);

journal.post("/", async (c) => {
  const user = c.get("user");
  const body = createJournalSchema.parse(await c.req.json());

  const [entry] = await db
    .insert(journalEntries)
    .values({ ...body, userId: user.id })
    .returning();

  return ok(c, entry, 201, "Journal entry created");
});

journal.get("/", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 10));
  const offset = (page - 1) * limit;

  const tag = c.req.query("tag");
  const search = c.req.query("search");

  const conditions = [eq(journalEntries.userId, user.id)];

  if (tag) {
    conditions.push(sql`${journalEntries.emotionTags} @> ${JSON.stringify([tag])}::jsonb`);
  }

  if (search) {
    conditions.push(
      or(
        ilike(journalEntries.title, `%${search}%`),
        ilike(journalEntries.content, `%${search}%`),
      )!,
    );
  }

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(journalEntries)
    .where(and(...conditions));

  const entries = await db
    .select()
    .from(journalEntries)
    .where(and(...conditions))
    .orderBy(desc(journalEntries.createdAt))
    .limit(limit)
    .offset(offset);

  return ok(c, {
    entries,
    pagination: {
      page,
      limit,
      total: countResult.count,
      totalPages: Math.ceil(countResult.count / limit),
    },
  });
});

journal.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [entry] = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, user.id)))
    .limit(1);

  if (!entry) {
    throw new HTTPException(404, { message: "Journal entry not found" });
  }

  return ok(c, entry);
});

journal.put("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = updateJournalSchema.parse(await c.req.json());

  const [existing] = await db
    .select({ userId: journalEntries.userId })
    .from(journalEntries)
    .where(eq(journalEntries.id, id))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: "Journal entry not found" });
  }
  if (existing.userId !== user.id) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const [updated] = await db
    .update(journalEntries)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(journalEntries.id, id))
    .returning();

  return ok(c, updated, 200, "Journal entry updated");
});

journal.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select({ userId: journalEntries.userId })
    .from(journalEntries)
    .where(eq(journalEntries.id, id))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: "Journal entry not found" });
  }
  if (existing.userId !== user.id) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  await db.delete(journalEntries).where(eq(journalEntries.id, id));

  return ok(c, null, 200, "Journal entry deleted");
});

journal.put("/:id/favorite", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select({ userId: journalEntries.userId, isFavorite: journalEntries.isFavorite })
    .from(journalEntries)
    .where(eq(journalEntries.id, id))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: "Journal entry not found" });
  }
  if (existing.userId !== user.id) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const [updated] = await db
    .update(journalEntries)
    .set({ isFavorite: !existing.isFavorite, updatedAt: new Date() })
    .where(eq(journalEntries.id, id))
    .returning();

  return ok(c, updated, 200, existing.isFavorite ? "Unfavorited" : "Favorited");
});

export default journal;

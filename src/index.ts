import "dotenv/config";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";

import auth from "@/routes/auth";
import mood from "@/routes/mood";
import journal from "@/routes/journal";
import chat from "@/routes/chat";
import { fail } from "@/utils/response";

const app = new Hono();

app.use(logger());
app.use(
  cors({
    origin: ["http://localhost:3000"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return fail(c, err.message, err.status);
  }
  if (err instanceof Error && err.name === "ZodError") {
    return fail(c, "Validation error", 422, err.message);
  }
  console.error(err);
  return fail(c, "Internal Server Error", 500);
});

app.route("/auth", auth);
app.route("/moods", mood);
app.route("/journals", journal);
app.route("/chat", chat);

app.get("/", (c) => {
  return c.json({
    name: "MindEase API",
    version: "1.0.0",
    status: "running",
  });
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 4000;

console.log(`MindEase API running on http://localhost:${port}`);

export default {
  port,
  hostname: "0.0.0.0",
  fetch: app.fetch,
};

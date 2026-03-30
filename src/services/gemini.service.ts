import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `Kamu adalah MindEase, AI wellness companion yang empatik dan suportif.
Panduan perilaku:
- Selalu dengarkan dengan empati, jangan menghakimi
- Berikan respons dalam Bahasa Indonesia yang hangat dan natural
- Jika user terlihat dalam kondisi darurat mental, sarankan
  untuk menghubungi profesional (Into The Light: 119 ext 8)
- Jangan pernah memberikan diagnosis medis
- Gunakan teknik CBT ringan: reframing, gratitude prompts
- Akhiri dengan pertanyaan reflektif atau saran actionable
- Perhatikan konteks mood terbaru user jika tersedia
`;

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export interface UserContext {
  userName: string;
  recentMoods: {
    date: string;
    score: number;
    label: string;
    note: string | null;
  }[];
}

function buildContextBlock(ctx: UserContext): string {
  const moodLines = ctx.recentMoods
    .map(
      (m) =>
        `- ${m.date}: score ${m.score}/5 (${m.label})${m.note ? ` — "${m.note}"` : ""}`,
    )
    .join("\n");

  return [
    `User name: ${ctx.userName}`,
    `Recent mood history (last 7 days):`,
    moodLines || "No mood entries in the last 7 days.",
  ].join("\n");
}

export async function streamChat(
  history: ChatMessage[],
  userMessage: string,
  userContext: UserContext,
): Promise<ReadableStream<Uint8Array>> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const geminiHistory = history.map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("model" as const),
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({
    history: [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      {
        role: "model",
        parts: [
          {
            text: "Understood. I will follow these guidelines as the MindEase companion.",
          },
        ],
      },
      {
        role: "user",
        parts: [
          {
            text: `Here is my current context:\n${buildContextBlock(userContext)}`,
          },
        ],
      },
      {
        role: "model",
        parts: [
          {
            text: "Context noted. I'll keep this in mind during our conversation.",
          },
        ],
      },
      ...geminiHistory,
    ],
  });

  const result = await chat.sendMessageStream(userMessage);

  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            const sse = `data: ${JSON.stringify({ text })}\n\n`;
            controller.enqueue(encoder.encode(sse));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

import { db } from "./index";
import { meditations } from "./schema";

type Phase = "inhale" | "hold" | "exhale";

const meditationData = [
  {
    title: "Morning Gratitude",
    description:
      "Start your day with a grateful heart. This guided meditation helps you set positive intentions and appreciate the small things in life.",
    type: "meditation" as const,
    category: "morning" as const,
    durationMinutes: 10,
    imageUrl: "/images/morning-gratitude.jpg",
  },
  {
    title: "Sunrise Breath Awareness",
    description:
      "Begin your morning by tuning into your breath. This practice centers your mind and prepares you for the day ahead.",
    type: "meditation" as const,
    category: "morning" as const,
    durationMinutes: 7,
    imageUrl: "/images/sunrise-breath.jpg",
  },
  {
    title: "Affirmation Awakening",
    description:
      "Boost your confidence and positivity with morning affirmations delivered in a calming guided session.",
    type: "meditation" as const,
    category: "morning" as const,
    durationMinutes: 12,
    imageUrl: "/images/affirmation-awakening.jpg",
  },
  {
    title: "Body Scan for Stress Relief",
    description:
      "Release tension stored in your body with this progressive body scan meditation designed to melt away stress.",
    type: "meditation" as const,
    category: "stress" as const,
    durationMinutes: 15,
    imageUrl: "/images/body-scan-stress.jpg",
  },
  {
    title: "Letting Go",
    description:
      "A guided visualization to help you release worries and things beyond your control. Find peace in surrendering.",
    type: "meditation" as const,
    category: "stress" as const,
    durationMinutes: 12,
    imageUrl: "/images/letting-go.jpg",
  },
  {
    title: "Self-Compassion Break",
    description:
      "Practice the three components of self-compassion: mindfulness, common humanity, and self-kindness.",
    type: "meditation" as const,
    category: "stress" as const,
    durationMinutes: 8,
    imageUrl: "/images/self-compassion.jpg",
  },
  {
    title: "Deep Sleep Journey",
    description:
      "Drift into restful sleep with this soothing guided imagery that takes you through a peaceful nighttime landscape.",
    type: "meditation" as const,
    category: "sleep" as const,
    durationMinutes: 20,
    imageUrl: "/images/deep-sleep.jpg",
  },
  {
    title: "Sleep Body Scan",
    description:
      "A slow, gentle body scan designed to relax every part of your body and guide you into deep sleep.",
    type: "meditation" as const,
    category: "sleep" as const,
    durationMinutes: 18,
    imageUrl: "/images/sleep-body-scan.jpg",
  },
  {
    title: "Moonlight Gratitude",
    description:
      "Reflect on your day with gratitude before sleep. This practice helps you end the day on a peaceful note.",
    type: "meditation" as const,
    category: "sleep" as const,
    durationMinutes: 10,
    imageUrl: "/images/moonlight-gratitude.jpg",
  },
  {
    title: "Focused Breathing",
    description:
      "Sharpen your concentration with this focused breathing technique. Perfect before work or study sessions.",
    type: "meditation" as const,
    category: "focus" as const,
    durationMinutes: 10,
    imageUrl: "/images/focused-breathing.jpg",
  },
  {
    title: "Mindful Attention Training",
    description:
      "Train your mind to stay present and resist distractions with this attention-focusing meditation.",
    type: "meditation" as const,
    category: "focus" as const,
    durationMinutes: 15,
    imageUrl: "/images/mindful-attention.jpg",
  },
  {
    title: "Productivity Priming",
    description:
      "Get into a flow state with this short meditation that primes your brain for deep, productive work.",
    type: "meditation" as const,
    category: "focus" as const,
    durationMinutes: 8,
    imageUrl: "/images/productivity-priming.jpg",
  },
];

const breathingData = [
  {
    title: "Box Breathing",
    description:
      "A balanced breathing technique used by Navy SEALs. Equal inhale, hold, exhale, and hold phases calm the nervous system.",
    type: "breathing" as const,
    category: "stress" as const,
    durationMinutes: 5,
    instructions: [
      { phase: "inhale" as Phase, duration: 4 },
      { phase: "hold" as Phase, duration: 4 },
      { phase: "exhale" as Phase, duration: 4 },
      { phase: "hold" as Phase, duration: 4 },
    ],
    imageUrl: "/images/box-breathing.jpg",
  },
  {
    title: "4-7-8 Relaxation Breath",
    description:
      "Developed by Dr. Andrew Weil, this technique promotes rapid relaxation and helps with falling asleep.",
    type: "breathing" as const,
    category: "sleep" as const,
    durationMinutes: 5,
    instructions: [
      { phase: "inhale" as Phase, duration: 4 },
      { phase: "hold" as Phase, duration: 7 },
      { phase: "exhale" as Phase, duration: 8 },
    ],
    imageUrl: "/images/478-breathing.jpg",
  },
  {
    title: "Diaphragmatic Breathing",
    description:
      "Engage your diaphragm fully with this simple yet powerful technique. Great for baseline stress management.",
    type: "breathing" as const,
    category: "morning" as const,
    durationMinutes: 5,
    instructions: [
      { phase: "inhale" as Phase, duration: 4 },
      { phase: "exhale" as Phase, duration: 6 },
    ],
    imageUrl: "/images/diaphragmatic.jpg",
  },
  {
    title: "Calm Breathing",
    description:
      "A gentle extended exhale pattern that activates your parasympathetic nervous system for deep calm.",
    type: "breathing" as const,
    category: "stress" as const,
    durationMinutes: 6,
    instructions: [
      { phase: "inhale" as Phase, duration: 5 },
      { phase: "exhale" as Phase, duration: 5 },
      { phase: "hold" as Phase, duration: 2 },
    ],
    imageUrl: "/images/calm-breathing.jpg",
  },
];

async function seed() {
  console.log("Seeding meditations...");

  const existing = await db
    .select({ id: meditations.id })
    .from(meditations)
    .limit(1);
  if (existing.length > 0) {
    console.log("Meditations already exist, skipping seed.");
    return;
  }

  const all = [...meditationData, ...breathingData];
  await db.insert(meditations).values(all);

  console.log(
    `Seeded ${all.length} items (${meditationData.length} meditations, ${breathingData.length} breathing exercises).`,
  );
}

seed()
  .then(() => {
    console.log("Seed complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });

import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required").max(255),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export const createMoodSchema = z.object({
  moodScore: z.number().int().min(1).max(5),
  moodLabel: z.enum(["terrible", "bad", "okay", "good", "great"]),
  note: z.string().max(2000).optional(),
  activities: z.array(z.string()).optional(),
});

export const updateMoodSchema = z.object({
  moodScore: z.number().int().min(1).max(5).optional(),
  moodLabel: z.enum(["terrible", "bad", "okay", "good", "great"]).optional(),
  note: z.string().max(2000).optional(),
  activities: z.array(z.string()).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type CreateMoodInput = z.infer<typeof createMoodSchema>;
export type UpdateMoodInput = z.infer<typeof updateMoodSchema>;

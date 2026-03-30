CREATE TYPE "public"."meditation_category" AS ENUM('morning', 'stress', 'sleep', 'focus');--> statement-breakpoint
CREATE TYPE "public"."meditation_type" AS ENUM('meditation', 'breathing');--> statement-breakpoint
ALTER TABLE "meditations" ALTER COLUMN "category" SET DATA TYPE "public"."meditation_category" USING "category"::"public"."meditation_category";--> statement-breakpoint
ALTER TABLE "meditations" ADD COLUMN "type" "meditation_type" DEFAULT 'meditation' NOT NULL;--> statement-breakpoint
ALTER TABLE "meditations" ADD COLUMN "instructions" jsonb;
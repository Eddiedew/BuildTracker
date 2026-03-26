-- Migration 004: Add progress to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100);

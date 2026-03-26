-- Migration 003: Add startDate to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS "startDate" DATE;

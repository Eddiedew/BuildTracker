-- ============================================================
-- BuildTracker — Reload PostgREST schema cache
-- Migration 007: Force PostgREST to pick up columns added in
-- migrations 003/004 (tasks.progress, tasks.startDate)
-- and indexes added in migration 006.
--
-- Run this after any migration that alters table structure.
-- ============================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- BuildTracker — Performance: owner_id indexes
-- Migration 006: Add indexes on owner_id for all tenant-scoped tables
--
-- Every RLS policy filters on owner_id = auth.uid().
-- Without indexes, every query does a sequential scan.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_clients_owner_id            ON public.clients(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner_id           ON public.projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_id              ON public.tasks(owner_id);
CREATE INDEX IF NOT EXISTS idx_milestones_owner_id         ON public.milestones(owner_id);
CREATE INDEX IF NOT EXISTS idx_team_members_owner_id       ON public.team_members(owner_id);
CREATE INDEX IF NOT EXISTS idx_quotes_owner_id             ON public.quotes(owner_id);
CREATE INDEX IF NOT EXISTS idx_invoices_owner_id           ON public.invoices(owner_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_owner_id         ON public.daily_logs(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_owner_id          ON public.documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_expenses_owner_id           ON public.expenses(owner_id);
CREATE INDEX IF NOT EXISTS idx_expense_categories_owner_id ON public.expense_categories(owner_id);

-- Composite indexes for common query patterns (owner + sort column)
CREATE INDEX IF NOT EXISTS idx_tasks_owner_project     ON public.tasks(owner_id, "projectId");
CREATE INDEX IF NOT EXISTS idx_milestones_owner_project ON public.milestones(owner_id, "projectId");
CREATE INDEX IF NOT EXISTS idx_expenses_owner_project   ON public.expenses(owner_id, "projectId");
CREATE INDEX IF NOT EXISTS idx_daily_logs_owner_project  ON public.daily_logs(owner_id, "projectId");
CREATE INDEX IF NOT EXISTS idx_documents_owner_project   ON public.documents(owner_id, "projectId");

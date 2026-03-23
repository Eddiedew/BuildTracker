-- ============================================================
-- BuildFlow — Full Database Schema
-- Migration 001: Tables, triggers, and seed data
-- ============================================================

-- ── Trigger helper: auto-update updated_at ──────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── profiles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                     UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email                  TEXT,
  name                   TEXT,
  plan                   TEXT DEFAULT 'free',
  plan_status            TEXT DEFAULT 'active',
  stripe_customer_id     TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id        TEXT,
  current_period_ends_at TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN DEFAULT false,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── clients ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  company    TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── team_members (must exist before tasks for FK) ───────────
CREATE TABLE IF NOT EXISTS public.team_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role       TEXT,
  email      TEXT,
  phone      TEXT,
  color      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── projects ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  "clientId"  UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'Planning',
  budget      NUMERIC(14,2),
  spent       NUMERIC(14,2) DEFAULT 0,
  "startDate" DATE,
  deadline    DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── tasks ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  "projectId"  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  completed    BOOLEAN DEFAULT false,
  "dueDate"    DATE,
  "assignedTo" UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── milestones ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.milestones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  "projectId" UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  date        DATE,
  completed   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── quotes ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quotes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  "clientId"  UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  "projectId" UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  items       JSONB DEFAULT '[]'::jsonb,
  status      TEXT DEFAULT 'Pending',
  date        DATE DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── invoices ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  "clientId"  UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  "projectId" UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  items       JSONB DEFAULT '[]'::jsonb,
  amount      NUMERIC(14,2) DEFAULT 0,
  status      TEXT DEFAULT 'Pending',
  date        DATE DEFAULT CURRENT_DATE,
  "dueDate"   DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── daily_logs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  "projectId" UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  date        DATE DEFAULT CURRENT_DATE,
  weather     TEXT,
  crew        INTEGER,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── documents ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  "projectId"   UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  type          TEXT,
  size          TEXT,
  date          DATE DEFAULT CURRENT_DATE,
  "uploadedBy"  TEXT,
  storage_path  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── expenses ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  "projectId" UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  description TEXT,
  type        TEXT,
  planned     NUMERIC(14,2) DEFAULT 0,
  actual      NUMERIC(14,2) DEFAULT 0,
  date        DATE DEFAULT CURRENT_DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── expense_categories ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  color     TEXT DEFAULT '#6b7280',
  "isDefault" BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Auto-create profile + default categories on signup ──────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name TEXT;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, v_name)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.expense_categories (owner_id, name, color, "isDefault") VALUES
    (NEW.id, 'Labour',        '#1565c0', true),
    (NEW.id, 'Materials',     '#2e7d32', true),
    (NEW.id, 'Equipment',     '#6a1b9a', true),
    (NEW.id, 'Subcontractor', '#e65100', true),
    (NEW.id, 'Permits & Fees','#00838f', true),
    (NEW.id, 'Other',         '#6b7280', true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

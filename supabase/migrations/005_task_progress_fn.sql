-- Migration 005: RPC function to update task progress (bypasses schema cache)
CREATE OR REPLACE FUNCTION public.set_task_progress(p_task_id UUID, p_progress INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tasks
  SET progress = p_progress
  WHERE id = p_task_id AND owner_id = auth.uid();
END;
$$;

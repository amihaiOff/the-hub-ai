-- Pastelize existing user-picked colors across profiles, budget tags,
-- task categories and task tags. Runs once; safe to re-apply since it
-- only rewrites the seven legacy palette values.

DO $$
DECLARE
  legacy_pastel jsonb := '{
    "#6ab2ff": "#a8caff",
    "#3b82f6": "#8fb4f5",
    "#3B82F6": "#8fb4f5",
    "#22c55e": "#8fddb0",
    "#10b981": "#8fd9b6",
    "#f59e0b": "#f5cd85",
    "#a78bfa": "#c9b8f7",
    "#ef4444": "#f5a5a5",
    "#8b5cf6": "#c9b8f7",
    "#ec4899": "#f5b3d4",
    "#06b6d4": "#a3dee8",
    "#f97316": "#f5c8a3"
  }'::jsonb;
  legacy text;
  pastel text;
BEGIN
  FOR legacy, pastel IN SELECT key, value::text FROM jsonb_each_text(legacy_pastel) LOOP
    EXECUTE format('UPDATE profiles SET color = %L WHERE color = %L', pastel, legacy);
    EXECUTE format('UPDATE budget_tags SET color = %L WHERE color = %L', pastel, legacy);
    EXECUTE format('UPDATE task_categories SET color = %L WHERE color = %L', pastel, legacy);
    EXECUTE format('UPDATE task_tags SET color = %L WHERE color = %L', pastel, legacy);
  END LOOP;
END $$;

-- Shift schema defaults to pastel too so newly-created rows match.
ALTER TABLE profiles ALTER COLUMN color SET DEFAULT '#8fb4f5';
ALTER TABLE budget_tags ALTER COLUMN color SET DEFAULT '#8fb4f5';

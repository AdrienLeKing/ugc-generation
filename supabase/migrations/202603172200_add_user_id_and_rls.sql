-- Add user_id column (nullable for backward compat with existing rows)
ALTER TABLE ugc_generation.generations
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop the old wide-open policy
DROP POLICY IF EXISTS anon_full_access ON ugc_generation.generations;

-- Users can only see their own generations
CREATE POLICY user_select_own ON ugc_generation.generations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own generations
CREATE POLICY user_insert_own ON ugc_generation.generations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own generations
CREATE POLICY user_update_own ON ugc_generation.generations
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can do everything (for CLI, background jobs)
CREATE POLICY service_role_all ON ugc_generation.generations
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

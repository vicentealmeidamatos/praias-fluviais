-- ─── Supabase Migration — Praias Fluviais ────────────────────────────────────
-- Run these statements in your Supabase SQL Editor:
-- Dashboard → SQL Editor → New Query → Paste & Run
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add email column to profiles table
--    Required for: username-based login (login with username instead of email)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Update existing profiles with their email from auth.users (optional backfill)
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND p.email IS NULL;


-- 2. Add is_public column to votes table
--    Required for: public/private voting feature
ALTER TABLE public.votes
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE;


-- 3. Add parent_id column to reviews table
--    Required for: threaded replies in community section
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.reviews(id) ON DELETE CASCADE;

-- Create index for faster lookup of replies by parent
CREATE INDEX IF NOT EXISTS idx_reviews_parent_id ON public.reviews(parent_id);


-- ─── RLS Policy updates (if needed) ─────────────────────────────────────────
-- If your profiles table doesn't allow reading email by others, you may want
-- to add a policy so that email lookup by username works for login:
-- (Only needed if you get RLS errors on the getEmailByUsername lookup)

-- Allow authenticated/anon users to read email from profiles for username login
-- (PostgreSQL doesn't support IF NOT EXISTS for policies — use DO block to avoid duplicate error)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Allow email lookup by username'
  ) THEN
    CREATE POLICY "Allow email lookup by username" ON public.profiles
      FOR SELECT USING (true);
  END IF;
END
$$;

-- ─── End of migration ────────────────────────────────────────────────────────

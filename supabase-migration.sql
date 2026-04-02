-- ─── Supabase — Setup Completo — Praias Fluviais ────────────────────────────
-- Idempotente: pode correr em projetos novos OU já existentes.
-- Dashboard → SQL Editor → New Query → colar tudo → Run
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. PROFILES
--    Supabase cria auth.users automaticamente. Esta tabela guarda dados
--    públicos do utilizador (username, avatar, email para login por username).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT        UNIQUE,
  avatar_url  TEXT,
  email       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Adicionar colunas que podem não existir em projetos mais antigos
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email      TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username   TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill email a partir de auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- RLS Policies — profiles
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Profiles: leitura pública') THEN
    CREATE POLICY "Profiles: leitura pública" ON public.profiles
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Profiles: utilizador edita o seu') THEN
    CREATE POLICY "Profiles: utilizador edita o seu" ON public.profiles
      FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Profiles: utilizador cria o seu') THEN
    CREATE POLICY "Profiles: utilizador cria o seu" ON public.profiles
      FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. TRIGGER — criar perfil automaticamente ao registar
--    Quando um utilizador se regista em auth.users, insere linha em profiles.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      split_part(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Backfill: criar perfis para utilizadores auth que ainda não têm perfil
-- (acontece quando o registo exigiu confirmação de email e profileUpsert falhou sem sessão)
INSERT INTO public.profiles (id, email, username)
SELECT
  u.id,
  u.email,
  COALESCE(
    u.raw_user_meta_data->>'username',
    split_part(u.email, '@', 1)
  )
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. STAMPS
--    Carimbos digitais do passaporte. Um carimbo por utilizador por praia.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.stamps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  beach_id   TEXT NOT NULL,
  stamped_at DATE NOT NULL DEFAULT CURRENT_DATE,
  CONSTRAINT stamps_user_beach_unique UNIQUE (user_id, beach_id)
);

ALTER TABLE public.stamps ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_stamps_user_id ON public.stamps(user_id);

-- RLS Policies — stamps
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stamps' AND policyname='Stamps: utilizador vê os seus') THEN
    CREATE POLICY "Stamps: utilizador vê os seus" ON public.stamps
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stamps' AND policyname='Stamps: utilizador insere os seus') THEN
    CREATE POLICY "Stamps: utilizador insere os seus" ON public.stamps
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stamps' AND policyname='Stamps: utilizador remove os seus') THEN
    CREATE POLICY "Stamps: utilizador remove os seus" ON public.stamps
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. VOTES
--    Votação Praia do Ano. Um voto por utilizador por ano.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.votes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  beach_id   TEXT        NOT NULL,
  year       INT         NOT NULL,
  is_public  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT votes_user_year_unique UNIQUE (user_id, year)
);

ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

-- Adicionar colunas que podem não existir em projetos mais antigos
ALTER TABLE public.votes ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_votes_year     ON public.votes(year);
CREATE INDEX IF NOT EXISTS idx_votes_beach_id ON public.votes(beach_id);
CREATE INDEX IF NOT EXISTS idx_votes_user_id  ON public.votes(user_id);

-- RLS Policies — votes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='votes' AND policyname='Votes: utilizador vê o seu') THEN
    CREATE POLICY "Votes: utilizador vê o seu" ON public.votes
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='votes' AND policyname='Votes: votos públicos visíveis a todos') THEN
    CREATE POLICY "Votes: votos públicos visíveis a todos" ON public.votes
      FOR SELECT USING (is_public = true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='votes' AND policyname='Votes: utilizador insere o seu') THEN
    CREATE POLICY "Votes: utilizador insere o seu" ON public.votes
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='votes' AND policyname='Votes: utilizador atualiza o seu') THEN
    CREATE POLICY "Votes: utilizador atualiza o seu" ON public.votes
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. REVIEWS
--    Comentários nas páginas de praia. Suporta respostas (parent_id).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.reviews (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  beach_id   TEXT        NOT NULL,
  text       TEXT,
  images     TEXT[]      NOT NULL DEFAULT '{}',
  parent_id  UUID        REFERENCES public.reviews(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Adicionar colunas que podem não existir em projetos mais antigos
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.reviews(id) ON DELETE CASCADE;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS images    TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_reviews_beach_id  ON public.reviews(beach_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id   ON public.reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_parent_id ON public.reviews(parent_id);

-- RLS Policies — reviews
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND policyname='Reviews: leitura pública') THEN
    CREATE POLICY "Reviews: leitura pública" ON public.reviews
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND policyname='Reviews: utilizador insere os seus') THEN
    CREATE POLICY "Reviews: utilizador insere os seus" ON public.reviews
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND policyname='Reviews: utilizador remove os seus') THEN
    CREATE POLICY "Reviews: utilizador remove os seus" ON public.reviews
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. STORAGE — bucket avatars
--    Necessário para upload de fotos de perfil.
--    Se o bucket já existir, o INSERT é ignorado.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Avatars: leitura pública') THEN
    CREATE POLICY "Avatars: leitura pública" ON storage.objects
      FOR SELECT USING (bucket_id = 'avatars');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Avatars: utilizador faz upload do seu') THEN
    CREATE POLICY "Avatars: utilizador faz upload do seu" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Avatars: utilizador atualiza o seu') THEN
    CREATE POLICY "Avatars: utilizador atualiza o seu" ON storage.objects
      FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- FIM
-- ═══════════════════════════════════════════════════════════════════════════

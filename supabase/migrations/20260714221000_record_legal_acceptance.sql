CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_acceptances_select_own"
  ON public.legal_acceptances FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "legal_acceptances_insert_own"
  ON public.legal_acceptances FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- The auth trigger is the trusted writer: the client can declare a version at
-- signup, but cannot later forge or overwrite the acceptance timestamp.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;

  IF NEW.raw_user_meta_data ? 'terms_version'
    AND NEW.raw_user_meta_data ? 'privacy_version' THEN
    INSERT INTO public.legal_acceptances (user_id, terms_version, privacy_version)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'terms_version',
      NEW.raw_user_meta_data ->> 'privacy_version'
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

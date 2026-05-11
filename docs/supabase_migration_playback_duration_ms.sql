-- Uruchom w Supabase SQL Editor (lub jako migracja), jeśli kolumna jeszcze nie istnieje.
ALTER TABLE public.nixes
  ADD COLUMN IF NOT EXISTS playback_duration_ms INTEGER;

COMMENT ON COLUMN public.nixes.playback_duration_ms IS
  'Długość odtwarzania klipu wideo w ms; dla zdjęć NULL — wtedy używane jest view_duration_sec.';

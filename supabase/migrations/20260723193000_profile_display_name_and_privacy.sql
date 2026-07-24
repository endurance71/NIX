-- Add display_name and is_private to profiles table

ALTER TABLE public.profiles
ADD COLUMN display_name TEXT,
ADD COLUMN is_private BOOLEAN DEFAULT false NOT NULL;

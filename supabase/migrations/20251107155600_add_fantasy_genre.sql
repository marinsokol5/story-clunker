-- Add fantasy genre to stories table
ALTER TABLE public.stories DROP CONSTRAINT IF EXISTS stories_genre_check;
ALTER TABLE public.stories ADD CONSTRAINT stories_genre_check CHECK (genre IN ('scary', 'funny', 'sci-fi', 'fantasy'));


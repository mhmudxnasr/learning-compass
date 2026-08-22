-- Remove only the legacy whole-book placeholder. Real numbered chapters and
-- their linked artifacts remain untouched.
DELETE FROM book_visual_chapters
WHERE chapter_key = 'book' AND position = 0;

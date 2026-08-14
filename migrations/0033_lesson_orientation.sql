ALTER TABLE thread_lessons ADD COLUMN why_learn TEXT;
ALTER TABLE thread_lessons ADD COLUMN why_now TEXT;
ALTER TABLE thread_lessons ADD COLUMN takeaway TEXT;

UPDATE thread_lessons
SET why_learn = COALESCE(why_learn, 'This lesson builds the next piece of understanding in the course.'),
    why_now = COALESCE(why_now, 'Learn this before moving to the next lesson so the progression stays coherent.'),
    takeaway = COALESCE(takeaway, description);

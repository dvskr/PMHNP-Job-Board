-- Add display_salary column to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS display_salary TEXT;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_jobs_display_salary ON jobs(display_salary) WHERE display_salary IS NOT NULL;


-- ==========================================
-- BOARD STATS DASHBOARD QUERIES
-- Run these in your Supabase SQL Editor
-- ==========================================

-- === BOARD STATS ===

-- 1. Total Active Jobs
SELECT count(*) as total_active_jobs 
FROM jobs 
WHERE is_published = true;

-- 2. Total Companies (tracked in companies table)
SELECT count(*) as total_companies 
FROM companies; 

-- 3. New Jobs Added This Week
SELECT count(*) as new_jobs_this_week
FROM jobs
WHERE created_at >= (NOW() - INTERVAL '1 week')
  AND is_published = true;

-- 4. Jobs Removed/Expired This Week
-- Checks for jobs that formally expired OR were unpublished recently
SELECT count(*) as jobs_removed_expired
FROM jobs
WHERE 
  (expires_at >= (NOW() - INTERVAL '1 week') AND expires_at < NOW())
  OR 
  (updated_at >= (NOW() - INTERVAL '1 week') AND is_published = false AND created_at < (NOW() - INTERVAL '1 week'));


-- === SALARY DATA (Annualized) ===

-- 5. Average Salary by State (Top 10 with most data)
SELECT 
  state, 
  ROUND(AVG(normalized_min_salary)) as avg_min_salary,
  ROUND(AVG(normalized_max_salary)) as avg_max_salary,
  COUNT(*) as job_count
FROM jobs
WHERE 
  state IS NOT NULL 
  AND normalized_max_salary IS NOT NULL 
  AND normalized_max_salary > 0
  AND is_published = true
GROUP BY state
ORDER BY job_count DESC
LIMIT 10;

-- 6. Telehealth vs In-Person Salary Average
SELECT 
  CASE 
    WHEN is_remote = true THEN 'Telehealth' 
    ELSE 'In-Person' 
  END as setting,
  ROUND(AVG(normalized_min_salary)) as avg_min,
  ROUND(AVG(normalized_max_salary)) as avg_max,
  COUNT(*) as count
FROM jobs
WHERE 
  normalized_max_salary IS NOT NULL 
  AND normalized_max_salary > 0
  AND is_published = true
GROUP BY is_remote;

-- 7. Highest Paying Listing This Week
SELECT 
  title, 
  employer, 
  display_salary, 
  normalized_max_salary
FROM jobs
WHERE 
  created_at >= (NOW() - INTERVAL '1 week')
  AND is_published = true
ORDER BY normalized_max_salary DESC NULLS LAST
LIMIT 1;

-- 8. New Grad Salary Range (Estimating based on 'new grad' in text)
SELECT 
  MIN(normalized_min_salary) as new_grad_low,
  MAX(normalized_max_salary) as new_grad_high,
  ROUND(AVG(normalized_max_salary)) as new_grad_avg
FROM jobs
WHERE 
  (description ILIKE '%new grad%' OR title ILIKE '%new grad%')
  AND normalized_max_salary IS NOT NULL 
  AND normalized_max_salary > 0
  AND is_published = true;


-- === JOB MARKET OBSERVATIONS ===

-- 9. Telehealth Listings Counts
SELECT 
  count(*) as telehealth_count,
  round(count(*) * 100.0 / (SELECT count(*) FROM jobs WHERE is_published = true), 1) as percentage_of_total
FROM jobs
WHERE 
  is_remote = true 
  AND is_published = true;

-- 10. New Grad Friendly Listings Count
SELECT count(*) as new_grad_friendly_count
FROM jobs
WHERE 
  (description ILIKE '%new grad%' OR title ILIKE '%new grad%')
  AND is_published = true;

-- 11. States with Most Openings (Top 5)
SELECT 
  state, 
  count(*) as openings
FROM jobs
WHERE 
  state IS NOT NULL 
  AND is_published = true
GROUP BY state
ORDER BY openings DESC
LIMIT 5;

-- 12. Employer Patterns (Top Employers posting this week)
SELECT 
  employer, 
  count(*) as posts_this_week
FROM jobs
WHERE 
  created_at >= (NOW() - INTERVAL '1 week')
  AND is_published = true
GROUP BY employer
ORDER BY posts_this_week DESC
LIMIT 5;

-- 13. Job Types (Proxy for "Setting" or "Growth")
SELECT 
  job_type, 
  count(*) as count
FROM jobs
WHERE is_published = true
GROUP BY job_type
ORDER BY count DESC;

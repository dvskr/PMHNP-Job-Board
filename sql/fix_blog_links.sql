-- ============================================================
-- Fix Blog Post Broken Links
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- Fix 1: /states/california → /jobs/state/california
UPDATE blog_posts
SET content = REPLACE(content, '/states/', '/jobs/state/'),
    updated_at = NOW()
WHERE content LIKE '%/states/%';

-- Fix 2: /jobs?type=remote → /jobs/remote
UPDATE blog_posts
SET content = REPLACE(content, '/jobs?type=remote', '/jobs/remote'),
    updated_at = NOW()
WHERE content LIKE '%/jobs?type=remote%';

-- Fix 3: /jobs?type=telehealth → /jobs/telehealth
UPDATE blog_posts
SET content = REPLACE(content, '/jobs?type=telehealth', '/jobs/telehealth'),
    updated_at = NOW()
WHERE content LIKE '%/jobs?type=telehealth%';

-- Fix 4: /salaries → /salary-guide
UPDATE blog_posts
SET content = REPLACE(content, '](/salaries)', '](/salary-guide)'),
    updated_at = NOW()
WHERE content LIKE '%/salaries)%';

-- ============================================================
-- Fix RLS permissions (anon read was blocked)
-- ============================================================

-- Re-grant SELECT to anon and authenticated roles
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON blog_posts TO anon;
GRANT SELECT ON blog_posts TO authenticated;

-- Grant ALL to service_role so admin writes work
GRANT ALL ON blog_posts TO service_role;

-- Verify: check updated links
SELECT slug, 
       CASE WHEN content LIKE '%/states/%' THEN 'STILL HAS /states/' ELSE 'OK' END AS states_check,
       CASE WHEN content LIKE '%/jobs?type=%' THEN 'STILL HAS /jobs?type=' ELSE 'OK' END AS type_check
FROM blog_posts;

-- Blog Posts Table for Supabase
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  meta_description TEXT,
  target_keyword TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'job_seeker_attraction', 'salary_negotiation', 'career_myths',
    'state_spotlight', 'employer_facing', 'community_lifestyle',
    'industry_awareness', 'product_lead_gen', 'success_stories'
  )),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  publish_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_publish_date ON blog_posts(publish_date DESC);

-- Row Level Security
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Public can read published blog posts"
  ON blog_posts FOR SELECT
  USING (true);

-- Allow service role full access (for API writes)
CREATE POLICY "Service role can manage blog posts"
  ON blog_posts FOR ALL
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_blog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blog_posts_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_blog_updated_at();

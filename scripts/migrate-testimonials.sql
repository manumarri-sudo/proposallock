-- Run this in the Supabase Dashboard SQL Editor:
-- https://supabase.com/dashboard/project/bthytzpmyitjyoyhtptb/sql/new

-- 1. Create testimonials table
CREATE TABLE IF NOT EXISTS testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES proposals(id) ON DELETE CASCADE,
  freelancer_email text NOT NULL,
  body text NOT NULL CHECK (char_length(body) >= 20 AND char_length(body) <= 500),
  rating int CHECK (rating >= 1 AND rating <= 5),
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Add testimonial_email_sent_at column to proposals
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS testimonial_email_sent_at timestamptz DEFAULT NULL;

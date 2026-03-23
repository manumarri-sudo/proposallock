-- Migration 002: Add description field to proposals
-- Run this in the Supabase SQL Editor at:
-- https://supabase.com/dashboard/project/bthytzpmyitjyoyhtptb/sql/new

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;

-- Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'proposals' AND column_name = 'description';

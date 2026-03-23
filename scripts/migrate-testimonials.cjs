#!/usr/bin/env node
// One-time migration: create testimonials table + add testimonial_email_sent_at to proposals
// Uses Supabase Transaction Pooler with service_role JWT as password
// Run: node scripts/migrate-testimonials.js

const { Client } = require("pg");
const path = require("path");
const fs = require("fs");

// Load .env from parent directory
const envPath = path.join(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

const projectId = "bthytzpmyitjyoyhtptb";
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!serviceKey) {
  console.error("SUPABASE_SERVICE_KEY not found in .env");
  process.exit(1);
}

// Supabase Transaction Pooler accepts service_role JWT as password
// User format: postgres.{project-id}
const connectionString = `postgresql://postgres.${projectId}:${serviceKey}@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true`;

const MIGRATION_SQL = `
-- Add testimonial_email_sent_at column to proposals (idempotent)
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS testimonial_email_sent_at TIMESTAMPTZ DEFAULT NULL;

-- Create testimonials table
CREATE TABLE IF NOT EXISTS testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES proposals(id) ON DELETE CASCADE,
  freelancer_email text NOT NULL,
  body text NOT NULL CHECK (char_length(body) >= 20 AND char_length(body) <= 500),
  rating int CHECK (rating >= 1 AND rating <= 5),
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create index for fast lookups by proposal_id
CREATE INDEX IF NOT EXISTS idx_testimonials_proposal_id ON testimonials(proposal_id);

-- Verify tables exist
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name='proposals' AND column_name='testimonial_email_sent_at') AS col_exists,
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_name='testimonials' AND table_schema='public') AS table_exists;
`;

async function run() {
  const client = new Client({ connectionString });

  try {
    console.log("Connecting to Supabase...");
    await client.connect();
    console.log("Connected. Running migration...");

    const result = await client.query(MIGRATION_SQL);

    // Last query is the verification SELECT
    const verify = Array.isArray(result) ? result[result.length - 1] : result;
    if (verify.rows && verify.rows[0]) {
      const { col_exists, table_exists } = verify.rows[0];
      console.log(`Migration complete:`);
      console.log(`  testimonial_email_sent_at column: ${col_exists === "1" ? "EXISTS" : "MISSING"}`);
      console.log(`  testimonials table: ${table_exists === "1" ? "EXISTS" : "MISSING"}`);
    } else {
      console.log("Migration ran. Run verify to check.");
    }
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();

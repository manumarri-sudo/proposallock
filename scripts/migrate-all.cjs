#!/usr/bin/env node
// Comprehensive migration: all columns and tables added since initial Supabase migration
// Run: node scripts/migrate-all.cjs (with .env.prod sourced)

const { Client } = require("pg");
const path = require("path");
const fs = require("fs");

// Load .env.prod first, then fall back to .env
const envFiles = [".env.prod", ".env.local", ".env"];
for (const file of envFiles) {
  const envPath = path.join(__dirname, "..", file);
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const idx = line.indexOf("=");
      if (idx > 0 && !line.startsWith("#")) {
        const key = line.substring(0, idx).trim();
        // Strip outer quotes and literal \n sequences from values
        let val = line.substring(idx + 1).trim().replace(/^["']|["']$/g, "");
        val = val.replace(/\\n/g, "");  // Remove literal \n (backslash+n) from env values
        if (!process.env[key]) process.env[key] = val;
      }
    }
    console.log(`Loaded env from ${file}`);
    break;
  }
}

const projectId = "bthytzpmyitjyoyhtptb";
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!serviceKey) {
  console.error("SUPABASE_SERVICE_KEY not found");
  process.exit(1);
}

const connectionString = `postgresql://postgres.${projectId}:${serviceKey}@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true`;

const MIGRATION_SQL = `
-- ============================================================
-- Comprehensive migration for ProposalLock
-- All columns added since initial Supabase setup
-- ============================================================

-- 1. Add client_email to proposals (added in client-reminders feature)
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS client_email TEXT DEFAULT NULL;

-- 2. Add description to proposals
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;

-- 3. Add reminder tracking columns
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ DEFAULT NULL;

-- 4. Add testimonial tracking column
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS testimonial_email_sent_at TIMESTAMPTZ DEFAULT NULL;

-- 5. Create testimonials table
CREATE TABLE IF NOT EXISTS testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES proposals(id) ON DELETE CASCADE,
  freelancer_email TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) >= 20 AND char_length(body) <= 500),
  rating INT CHECK (rating >= 1 AND rating <= 5),
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Create proposal_templates table
CREATE TABLE IF NOT EXISTS proposal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_email TEXT NOT NULL,
  title TEXT NOT NULL,
  default_price_cents INTEGER NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'url',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_testimonials_proposal_id ON testimonials(proposal_id);
CREATE INDEX IF NOT EXISTS idx_templates_email ON proposal_templates(freelancer_email);

-- 8. Verify
SELECT
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='proposals' AND column_name='client_email') AS client_email_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='proposals' AND column_name='description') AS description_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='proposals' AND column_name='reminder_count') AS reminder_count_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='proposals' AND column_name='testimonial_email_sent_at') AS testimonial_col_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name='testimonials' AND table_schema='public') AS testimonials_table_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name='proposal_templates' AND table_schema='public') AS templates_table_exists;
`;

async function run() {
  const client = new Client({ connectionString });
  try {
    console.log("Connecting to Supabase...");
    await client.connect();
    console.log("Connected. Running comprehensive migration...");
    const result = await client.query(MIGRATION_SQL);
    const verify = Array.isArray(result) ? result[result.length - 1] : result;
    if (verify.rows && verify.rows[0]) {
      const row = verify.rows[0];
      console.log("Migration results:");
      console.log(`  client_email column:             ${row.client_email_exists === "1" ? "EXISTS" : "MISSING"}`);
      console.log(`  description column:              ${row.description_exists === "1" ? "EXISTS" : "MISSING"}`);
      console.log(`  reminder_count column:           ${row.reminder_count_exists === "1" ? "EXISTS" : "MISSING"}`);
      console.log(`  testimonial_email_sent_at column:${row.testimonial_col_exists === "1" ? "EXISTS" : "MISSING"}`);
      console.log(`  testimonials table:              ${row.testimonials_table_exists === "1" ? "EXISTS" : "MISSING"}`);
      console.log(`  proposal_templates table:        ${row.templates_table_exists === "1" ? "EXISTS" : "MISSING"}`);
    }
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();

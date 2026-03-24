// Migration: add client_email, description, reminder_count, reminder_sent_at to proposals
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY required");
  process.exit(1);
}

// Strategy: call supabase.rpc() to check columns, then try management API
// The management API exec endpoint requires a personal access token,
// but we can use the pg package with the direct connection if SUPABASE_DB_PASSWORD is set.

const { Client } = await import("pg");

// Supabase direct connection string
// Host: db.{ref}.supabase.co  port: 5432  user: postgres  password: SUPABASE_DB_PASSWORD
const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD;
const ref = new URL(SUPABASE_URL).hostname.split(".")[0];

if (!dbPassword) {
  console.error("No SUPABASE_DB_PASSWORD or POSTGRES_PASSWORD found.");
  console.error("Run this migration manually in the Supabase SQL Editor:");
  console.error(`
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS client_email TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
  `);
  process.exit(2);
}

const client = new Client({
  host: `db.${ref}.supabase.co`,
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: dbPassword,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(`
    ALTER TABLE proposals
      ADD COLUMN IF NOT EXISTS client_email TEXT,
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
  `);
  console.log("Migration complete.");
} catch (e) {
  console.error("Migration failed:", e.message);
  process.exit(1);
} finally {
  await client.end();
}

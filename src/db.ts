import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || "";

let supabase: SupabaseClient;
try {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
} catch (e) {
  console.error("Failed to create Supabase client:", e);
  supabase = null as any;
}

// Verify DB connection on startup
let initialized = false;
export async function initDb() {
  if (initialized) return;
  try {
    const { error } = await supabase.from("proposals").select("id").limit(1);
    if (error) console.error("DB connection check failed:", error.message);
    else console.log("Supabase connected -- proposals table ready");
  } catch (e) {
    console.error("DB init failed:", e);
  }
  initialized = true;
}

export type Proposal = {
  id: string;
  title: string;
  client_name: string;
  file_url: string;
  price_cents: number;
  ls_checkout_url: string | null;
  paid: boolean;
  paid_at: string | null;
  created_at: string;
};

export async function createProposal(
  p: Omit<Proposal, "paid" | "paid_at" | "created_at">
): Promise<Proposal> {
  const { data, error } = await supabase
    .from("proposals")
    .insert({
      id: p.id,
      title: p.title,
      client_name: p.client_name,
      file_url: p.file_url,
      price_cents: p.price_cents,
      ls_checkout_url: p.ls_checkout_url,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create proposal: ${error.message}`);
  return mapRow(data);
}

export async function getProposal(id: string): Promise<Proposal | null> {
  const { data, error } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return mapRow(data);
}

export async function markPaid(id: string): Promise<void> {
  const { error } = await supabase
    .from("proposals")
    .update({ paid: true, paid_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Failed to mark paid: ${error.message}`);
}

function mapRow(row: any): Proposal {
  return {
    id: row.id,
    title: row.title,
    client_name: row.client_name,
    file_url: row.file_url,
    price_cents: row.price_cents,
    ls_checkout_url: row.ls_checkout_url,
    paid: Boolean(row.paid),
    paid_at: row.paid_at,
    created_at: row.created_at,
  };
}

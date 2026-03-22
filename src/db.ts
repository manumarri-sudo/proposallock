import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
  process.exit(1);
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export interface Proposal {
  id: string;
  title: string;
  client_name: string;
  file_url: string;
  price_cents: number;
  ls_variant_id: string | null;
  ls_checkout_url: string | null;
  paid: boolean;
  paid_at: string | null;
  created_at: string;
  freelancer_email: string | null;
}

export async function createProposal(
  data: Omit<Proposal, "paid" | "paid_at" | "created_at">
): Promise<Proposal> {
  const { data: row, error } = await supabase
    .from("proposals")
    .insert({
      id: data.id,
      title: data.title,
      client_name: data.client_name,
      file_url: data.file_url,
      price_cents: data.price_cents,
      ls_variant_id: data.ls_variant_id,
      ls_checkout_url: data.ls_checkout_url,
      freelancer_email: data.freelancer_email,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create proposal: ${error.message}`);
  return row as Proposal;
}

export async function getProposal(id: string): Promise<Proposal | null> {
  const { data, error } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as Proposal;
}

export async function markPaid(id: string): Promise<void> {
  const { error } = await supabase
    .from("proposals")
    .update({ paid: true, paid_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Failed to mark paid: ${error.message}`);
}

export async function getProposalsByEmail(
  email: string
): Promise<Proposal[]> {
  const { data, error } = await supabase
    .from("proposals")
    .select("*")
    .eq("freelancer_email", email.toLowerCase())
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data as Proposal[]) || [];
}

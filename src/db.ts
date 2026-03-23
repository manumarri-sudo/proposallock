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
  file_type: "url" | "upload";
  storage_path: string | null;
  client_email: string | null;
  description: string | null;
  reminder_count: number;
  reminder_sent_at: string | null;
  testimonial_email_sent_at: string | null;
}

export interface Testimonial {
  id: string;
  proposal_id: string;
  freelancer_email: string;
  body: string;
  rating: number | null;
  display_name: string | null;
  created_at: string;
}

export async function createProposal(
  data: Omit<Proposal, "paid" | "paid_at" | "created_at" | "reminder_count" | "reminder_sent_at">
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
      file_type: data.file_type || "url",
      storage_path: data.storage_path || null,
      client_email: data.client_email ?? null,
      description: data.description ?? null,
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

export async function recordReminderSent(id: string, currentCount: number): Promise<void> {
  const { error } = await supabase
    .from("proposals")
    .update({
      reminder_sent_at: new Date().toISOString(),
      reminder_count: currentCount + 1,
    })
    .eq("id", id);
  if (error) console.error("recordReminderSent:", error.message);
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

export async function createTestimonial(data: {
  proposal_id: string;
  freelancer_email: string;
  body: string;
  rating?: number | null;
  display_name?: string | null;
}): Promise<Testimonial> {
  const { data: row, error } = await supabase
    .from("testimonials")
    .insert({
      proposal_id: data.proposal_id,
      freelancer_email: data.freelancer_email,
      body: data.body,
      rating: data.rating ?? null,
      display_name: data.display_name ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create testimonial: ${error.message}`);
  return row as Testimonial;
}

export async function getPublicTestimonials(): Promise<
  Array<{ body: string; rating: number | null; display_name: string | null; created_at: string }>
> {
  const { data, error } = await supabase
    .from("testimonials")
    .select("body, rating, display_name, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return [];
  return data || [];
}

// Returns proposals where paid=true, paid_at > 48h ago, testimonial_email not yet sent
export async function getProposalsPendingTestimonialEmail(
  email: string
): Promise<Proposal[]> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("proposals")
    .select("*")
    .eq("freelancer_email", email.toLowerCase())
    .eq("paid", true)
    .lt("paid_at", cutoff)
    .is("testimonial_email_sent_at", null);

  if (error) return [];
  return (data as Proposal[]) || [];
}

export async function markTestimonialEmailSent(id: string): Promise<void> {
  const { error } = await supabase
    .from("proposals")
    .update({ testimonial_email_sent_at: new Date().toISOString() })
    .eq("id", id);

  if (error) console.error("markTestimonialEmailSent:", error.message);
}

export async function testimonialExistsForProposal(proposalId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("testimonials")
    .select("*", { count: "exact", head: true })
    .eq("proposal_id", proposalId);

  if (error) return false;
  return (count ?? 0) > 0;
}

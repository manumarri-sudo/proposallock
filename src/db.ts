import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "./proposallock.db";

export const db = new Database(DB_PATH);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    client_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    ls_variant_id TEXT,
    ls_checkout_url TEXT,
    paid INTEGER NOT NULL DEFAULT 0,
    paid_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

export interface Proposal {
  id: string;
  title: string;
  client_name: string;
  file_url: string;
  price_cents: number;
  ls_variant_id: string | null;
  ls_checkout_url: string | null;
  paid: number;
  paid_at: string | null;
  created_at: string;
}

export function createProposal(data: Omit<Proposal, "paid" | "paid_at" | "created_at">): Proposal {
  db.prepare(
    `INSERT INTO proposals (id, title, client_name, file_url, price_cents, ls_variant_id, ls_checkout_url)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(data.id, data.title, data.client_name, data.file_url, data.price_cents, data.ls_variant_id, data.ls_checkout_url);
  return getProposal(data.id)!;
}

export function getProposal(id: string): Proposal | null {
  return db.prepare("SELECT * FROM proposals WHERE id = ?").get(id) as Proposal | null;
}

export function markPaid(id: string): void {
  db.prepare(
    "UPDATE proposals SET paid = 1, paid_at = datetime('now') WHERE id = ?"
  ).run(id);
}

export function markPaidByVariant(variantId: string): void {
  db.prepare(
    "UPDATE proposals SET paid = 1, paid_at = datetime('now') WHERE ls_variant_id = ?"
  ).run(variantId);
}

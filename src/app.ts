import { Hono } from "hono";
import { createProposal, getProposal, markPaid, initDb } from "./db";
import { randomBytes, createHmac, timingSafeEqual } from "crypto";

// Initialize DB on module load
initDb().catch(console.error);

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const LS_API_KEY = process.env.LS_API_KEY || process.env.LEMONSQUEEZY_API_KEY || "";
const LS_VARIANT_ID = process.env.LS_VARIANT_ID || "1407717";
const LS_WEBHOOK_SECRET = process.env.LS_WEBHOOK_SECRET || process.env.LEMONSQUEEZY_WEBHOOK_SECRET || "";
const LS_STORE_URL = process.env.LEMONSQUEEZY_STORE_URL || "https://agentos-store.lemonsqueezy.com";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return randomBytes(8).toString("hex");
}

async function createLSCheckout(
  proposalId: string,
  title: string,
  priceCents: number
): Promise<string | null> {
  if (!LS_API_KEY) return null;
  try {
    const res = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LS_API_KEY}`,
        "Content-Type": "application/vnd.api+json",
        "Accept": "application/vnd.api+json",
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            custom_price: priceCents,
            product_options: {
              name: `ProposalLock: ${title}`,
              description: "Your files unlock the moment payment clears.",
              redirect_url: `${BASE_URL}/p/${proposalId}/success`,
              receipt_link_url: `${BASE_URL}/p/${proposalId}/success`,
            },
            checkout_data: {
              custom: {
                proposal_id: proposalId,
              },
            },
            expires_at: null,
          },
          relationships: {
            store: {
              data: { type: "stores", id: "312605" },
            },
            variant: {
              data: { type: "variants", id: LS_VARIANT_ID },
            },
          },
        },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("LS checkout create failed:", res.status, err);
      return null;
    }
    const json = await res.json() as any;
    return json?.data?.attributes?.url ?? null;
  } catch (e) {
    console.error("LS checkout error:", e);
    return null;
  }
}

async function verifyLSWebhook(body: string, sig: string | null): Promise<boolean> {
  if (!LS_WEBHOOK_SECRET || !sig) return !LS_WEBHOOK_SECRET;
  const expected = createHmac("sha256", LS_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────

export const app = new Hono();

// ─── API Routes ───────────────────────────────────────────────────────────────

app.post("/api/proposals", async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const { title, client_name, file_url, price } = body;
  if (!title?.trim() || !client_name?.trim() || !file_url?.trim() || !price) {
    return c.json({ error: "title, client_name, file_url, and price are required" }, 400);
  }

  const priceCents = Math.round(parseFloat(price) * 100);
  if (isNaN(priceCents) || priceCents < 100) {
    return c.json({ error: "Price must be at least $1.00" }, 400);
  }

  const id = generateId();
  const checkoutUrl = await createLSCheckout(id, title.trim(), priceCents);

  const proposal = await createProposal({
    id,
    title: title.trim(),
    client_name: client_name.trim(),
    file_url: file_url.trim(),
    price_cents: priceCents,
    ls_checkout_url: checkoutUrl,
  });

  return c.json({
    id: proposal.id,
    proposal_url: `${BASE_URL}/p/${proposal.id}`,
    checkout_url: checkoutUrl,
  }, 201);
});

app.get("/api/proposals/:id", async (c) => {
  const proposal = await getProposal(c.req.param("id"));
  if (!proposal) return c.json({ error: "Not found" }, 404);

  return c.json({
    id: proposal.id,
    title: proposal.title,
    client_name: proposal.client_name,
    price_cents: proposal.price_cents,
    ls_checkout_url: proposal.ls_checkout_url,
    paid: proposal.paid,
    paid_at: proposal.paid_at,
    // Only reveal file_url when paid
    file_url: proposal.paid ? proposal.file_url : null,
  });
});

app.get("/api/proposals/:id/status", async (c) => {
  const proposal = await getProposal(c.req.param("id"));
  if (!proposal) return c.json({ error: "Not found" }, 404);
  return c.json({ paid: proposal.paid });
});

app.post("/api/webhooks/lemonsqueezy", async (c) => {
  const rawBody = await c.req.text();
  const sig = c.req.header("x-signature");

  const valid = await verifyLSWebhook(rawBody, sig ?? null);
  if (!valid) {
    console.warn("Webhook signature verification failed");
    return c.json({ error: "Invalid signature" }, 401);
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const eventName = payload?.meta?.event_name;
  if (eventName !== "order_created") {
    return c.json({ received: true });
  }

  const proposalId = payload?.meta?.custom_data?.proposal_id
    ?? payload?.data?.attributes?.first_order_item?.custom_data?.proposal_id;

  if (!proposalId) {
    console.warn("Webhook: no proposal_id in custom_data", JSON.stringify(payload?.meta));
    return c.json({ received: true });
  }

  const proposal = await getProposal(proposalId);
  if (!proposal) {
    console.warn("Webhook: proposal not found:", proposalId);
    return c.json({ received: true });
  }

  if (!proposal.paid) {
    await markPaid(proposalId);
    console.log(`Proposal ${proposalId} marked as paid`);
  }

  return c.json({ received: true });
});

// ─── HTML Pages ───────────────────────────────────────────────────────────────

const TAILWIND_CDN = `<script src="https://cdn.tailwindcss.com"></script>`;
const INTER_FONT = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">`;

function htmlShell(title: string, body: string, extraHead = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${TAILWIND_CDN}
  ${INTER_FONT}
  ${extraHead}
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
    .btn-primary {
      background: #6366f1;
      color: white;
      padding: 14px 28px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 1rem;
      border: none;
      cursor: pointer;
      transition: background 0.15s;
      display: inline-block;
      text-decoration: none;
    }
    .btn-primary:hover { background: #4f46e5; }
    .btn-secondary {
      background: #1e293b;
      color: #94a3b8;
      padding: 14px 28px;
      border-radius: 10px;
      font-weight: 500;
      font-size: 1rem;
      border: 1px solid #334155;
      cursor: pointer;
      display: inline-block;
      text-decoration: none;
    }
  </style>
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen">
  ${body}
</body>
</html>`;
}

// Landing page + proposal creator
app.get("/", (c) => {
  const html = htmlShell("ProposalLock — Your files unlock the moment they pay", `
  <!-- NAV -->
  <nav class="border-b border-gray-800 px-6 py-4 flex items-center justify-between max-w-5xl mx-auto">
    <div class="flex items-center gap-2">
      <span class="text-2xl">🔒</span>
      <span class="font-bold text-lg text-white">ProposalLock</span>
    </div>
    <a href="#pricing" class="text-indigo-400 hover:text-indigo-300 text-sm font-medium">Get ProposalLock — $29</a>
  </nav>

  <!-- HERO -->
  <section class="max-w-3xl mx-auto px-6 pt-20 pb-16 text-center">
    <div class="inline-flex items-center gap-2 bg-indigo-950 border border-indigo-800 rounded-full px-4 py-1.5 text-sm text-indigo-300 mb-8">
      <span class="w-2 h-2 rounded-full bg-indigo-400 inline-block"></span>
      Built for freelancers tired of chasing invoices
    </div>
    <h1 class="text-5xl font-extrabold text-white leading-tight mb-6">
      Your files unlock the moment they pay.
    </h1>
    <p class="text-xl text-gray-400 mb-10 max-w-xl mx-auto">
      Create a proposal link. Attach your deliverables. Get paid before they download.
    </p>
    <a href="#create" class="btn-primary text-lg px-8 py-4">
      Create Your First Proposal Free →
    </a>
    <p class="text-gray-600 text-sm mt-4">No account needed. Ready in 30 seconds.</p>
  </section>

  <!-- PAIN SECTION -->
  <section class="max-w-3xl mx-auto px-6 py-16 border-t border-gray-800">
    <h2 class="text-3xl font-bold text-white mb-3 text-center">Sound familiar?</h2>
    <p class="text-gray-500 text-center mb-10 text-sm italic">"Sent files. Client said will pay Friday. That was 3 weeks ago." — r/freelance, 2024</p>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div class="text-3xl mb-3">😤</div>
        <p class="font-semibold text-white mb-2">Files sent. Payment ghosted.</p>
        <p class="text-gray-400 text-sm">You delivered the work in good faith. Now you're refreshing your inbox hoping they'll pay.</p>
      </div>
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div class="text-3xl mb-3">⏰</div>
        <p class="font-semibold text-white mb-2">2+ hours chasing every week.</p>
        <p class="text-gray-400 text-sm">Writing polite follow-ups you don't mean, instead of doing actual client work.</p>
      </div>
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div class="text-3xl mb-3">💸</div>
        <p class="font-semibold text-white mb-2">$66/month for a $29 problem.</p>
        <p class="text-gray-400 text-sm">HoneyBook and Bonsai solve this — for $600/year. You just need a pay-to-unlock link.</p>
      </div>
    </div>
  </section>

  <!-- HOW IT WORKS -->
  <section class="max-w-3xl mx-auto px-6 py-16 border-t border-gray-800">
    <h2 class="text-3xl font-bold text-white mb-10 text-center">How it works</h2>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      <div class="text-center">
        <div class="w-12 h-12 rounded-full bg-indigo-900 border border-indigo-700 flex items-center justify-center text-indigo-300 font-bold text-lg mx-auto mb-4">1</div>
        <p class="font-semibold text-white mb-2">Paste your file URL</p>
        <p class="text-gray-400 text-sm">Google Drive, Dropbox, Notion — any shareable link. Set your price.</p>
      </div>
      <div class="text-center">
        <div class="w-12 h-12 rounded-full bg-indigo-900 border border-indigo-700 flex items-center justify-center text-indigo-300 font-bold text-lg mx-auto mb-4">2</div>
        <p class="font-semibold text-white mb-2">Send the proposal link</p>
        <p class="text-gray-400 text-sm">Your client gets a page with project details and a payment button.</p>
      </div>
      <div class="text-center">
        <div class="w-12 h-12 rounded-full bg-indigo-900 border border-indigo-700 flex items-center justify-center text-indigo-300 font-bold text-lg mx-auto mb-4">3</div>
        <p class="font-semibold text-white mb-2">Files unlock instantly</p>
        <p class="text-gray-400 text-sm">The moment payment clears, your files are revealed. No chasing needed.</p>
      </div>
    </div>
  </section>

  <!-- PROPOSAL CREATOR -->
  <section id="create" class="max-w-2xl mx-auto px-6 py-16 border-t border-gray-800">
    <h2 class="text-3xl font-bold text-white mb-3 text-center">Create a Proposal</h2>
    <p class="text-gray-400 text-center mb-10 text-sm">Free to try. No account required.</p>
    <div class="bg-gray-900 border border-gray-800 rounded-2xl p-8">
      <form id="proposal-form" class="space-y-5">
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1.5">Project Title</label>
          <input type="text" id="title" placeholder="e.g. Brand Identity Package — Q2 2026"
            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1.5">Client Name</label>
          <input type="text" id="client_name" placeholder="e.g. Acme Corp"
            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1.5">Your File URL</label>
          <input type="url" id="file_url" placeholder="https://drive.google.com/file/d/..."
            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
          <p class="text-gray-600 text-xs mt-1">Google Drive, Dropbox, Notion, etc. Use a permanent share link.</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1.5">Your Price (USD)</label>
          <div class="relative">
            <span class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">$</span>
            <input type="number" id="price" placeholder="500" min="1" step="0.01"
              class="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
          </div>
        </div>
        <button type="submit" id="submit-btn" class="btn-primary w-full text-center py-4 text-base">
          Generate Proposal Link →
        </button>
        <div id="form-error" class="hidden text-red-400 text-sm text-center bg-red-950 border border-red-800 rounded-lg p-3"></div>
      </form>

      <!-- Success state -->
      <div id="success-card" class="hidden">
        <div class="text-center mb-6">
          <div class="text-5xl mb-4">✅</div>
          <h3 class="text-xl font-bold text-white mb-2">Proposal Created!</h3>
          <p class="text-gray-400 text-sm">Share this link with your client:</p>
        </div>
        <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center gap-3 mb-4">
          <input id="proposal-url" type="text" readonly
            class="flex-1 bg-transparent text-indigo-300 text-sm font-mono focus:outline-none">
          <button id="copy-btn" onclick="copyLink()"
            class="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded-lg transition-colors">
            Copy
          </button>
        </div>
        <a id="view-link" href="#" target="_blank"
          class="btn-secondary w-full text-center block py-3 text-sm">
          Preview Proposal Page →
        </a>
        <button onclick="resetForm()"
          class="w-full text-center text-gray-600 hover:text-gray-400 text-sm mt-4 py-2">
          Create another proposal
        </button>
      </div>
    </div>
  </section>

  <!-- PRICING -->
  <section id="pricing" class="max-w-2xl mx-auto px-6 py-16 border-t border-gray-800">
    <h2 class="text-3xl font-bold text-white mb-3 text-center">Simple pricing</h2>
    <p class="text-gray-400 text-center mb-10 text-sm">One month of HoneyBook, or own this forever.</p>
    <div class="bg-gray-900 border border-indigo-800 rounded-2xl p-8 text-center">
      <div class="text-5xl font-extrabold text-white mb-1">$29</div>
      <div class="text-gray-400 mb-8 text-sm">One-time purchase — no subscription, lifetime access</div>
      <ul class="text-left space-y-3 mb-8 max-w-xs mx-auto">
        <li class="flex items-start gap-3 text-sm text-gray-300"><span class="text-indigo-400 mt-0.5">✓</span> Unlimited proposal links</li>
        <li class="flex items-start gap-3 text-sm text-gray-300"><span class="text-indigo-400 mt-0.5">✓</span> Payment-gated file delivery</li>
        <li class="flex items-start gap-3 text-sm text-gray-300"><span class="text-indigo-400 mt-0.5">✓</span> Works with Google Drive, Dropbox, Notion</li>
        <li class="flex items-start gap-3 text-sm text-gray-300"><span class="text-indigo-400 mt-0.5">✓</span> Auto-unlock on payment confirmation</li>
        <li class="flex items-start gap-3 text-sm text-gray-300"><span class="text-indigo-400 mt-0.5">✓</span> 30-day money-back guarantee</li>
      </ul>
      <a href="${LS_STORE_URL}/checkout/buy/1407717" target="_blank" class="btn-primary w-full block py-4 text-base">
        Get ProposalLock — $29 →
      </a>
      <p class="text-gray-600 text-xs mt-4">30-day money-back guarantee. No questions asked.</p>
    </div>
  </section>

  <!-- FAQ -->
  <section class="max-w-2xl mx-auto px-6 py-16 border-t border-gray-800">
    <h2 class="text-3xl font-bold text-white mb-10 text-center">FAQ</h2>
    <div class="space-y-6">
      <div class="border-b border-gray-800 pb-6">
        <p class="font-semibold text-white mb-2">Does this work with Google Drive links?</p>
        <p class="text-gray-400 text-sm">Yes. Paste any permanent Google Drive, Dropbox, Notion, or OneDrive share link. Use "Anyone with the link" sharing for Google Drive so files reveal correctly.</p>
      </div>
      <div class="border-b border-gray-800 pb-6">
        <p class="font-semibold text-white mb-2">What happens if my client doesn't pay?</p>
        <p class="text-gray-400 text-sm">They see a locked file icon. They can't download anything until they complete payment. The file URL is never exposed — not even in the page source — until payment clears.</p>
      </div>
      <div class="border-b border-gray-800 pb-6">
        <p class="font-semibold text-white mb-2">Do I need to create an account?</p>
        <p class="text-gray-400 text-sm">Nope. Create a proposal, get a link, send it. No signup, no dashboard, no passwords. Bookmark or save the URL you receive.</p>
      </div>
      <div class="border-b border-gray-800 pb-6">
        <p class="font-semibold text-white mb-2">Can I change the price after sending the link?</p>
        <p class="text-gray-400 text-sm">Not in v1 — the checkout is generated at proposal creation time. Create a new proposal if you need to change the price.</p>
      </div>
    </div>
  </section>

  <!-- FOOTER -->
  <footer class="border-t border-gray-800 px-6 py-10 text-center">
    <div class="flex items-center justify-center gap-2 mb-3">
      <span class="text-xl">🔒</span>
      <span class="font-bold text-white">ProposalLock</span>
    </div>
    <p class="text-gray-600 text-sm">© 2026 ProposalLock. Built for freelancers who got burned.</p>
    <a href="mailto:hello@proposallock.com" class="text-gray-600 hover:text-gray-400 text-sm mt-2 inline-block">hello@proposallock.com</a>
  </footer>

  <script>
    const form = document.getElementById('proposal-form');
    const successCard = document.getElementById('success-card');
    const submitBtn = document.getElementById('submit-btn');
    const formError = document.getElementById('form-error');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      formError.classList.add('hidden');
      submitBtn.textContent = 'Generating…';
      submitBtn.disabled = true;

      const title = document.getElementById('title').value.trim();
      const client_name = document.getElementById('client_name').value.trim();
      const file_url = document.getElementById('file_url').value.trim();
      const price = document.getElementById('price').value.trim();

      if (!title || !client_name || !file_url || !price) {
        showError('All fields are required.');
        return;
      }

      try {
        const res = await fetch('/api/proposals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, client_name, file_url, price })
        });
        const data = await res.json();
        if (!res.ok) {
          showError(data.error || 'Something went wrong. Please try again.');
          return;
        }

        document.getElementById('proposal-url').value = data.proposal_url;
        document.getElementById('view-link').href = data.proposal_url;
        form.classList.add('hidden');
        successCard.classList.remove('hidden');
      } catch (err) {
        showError('Network error. Please check your connection and try again.');
      }
    });

    function showError(msg) {
      formError.textContent = msg;
      formError.classList.remove('hidden');
      submitBtn.textContent = 'Generate Proposal Link →';
      submitBtn.disabled = false;
    }

    function copyLink() {
      const url = document.getElementById('proposal-url').value;
      navigator.clipboard.writeText(url).then(() => {
        document.getElementById('copy-btn').textContent = 'Copied!';
        setTimeout(() => { document.getElementById('copy-btn').textContent = 'Copy'; }, 2000);
      });
    }

    function resetForm() {
      form.classList.remove('hidden');
      successCard.classList.add('hidden');
      form.reset();
      submitBtn.textContent = 'Generate Proposal Link →';
      submitBtn.disabled = false;
    }
  </script>
  `);
  return c.html(html);
});

// Proposal client page
app.get("/p/:id", async (c) => {
  const id = c.req.param("id");
  const proposal = await getProposal(id);
  if (!proposal) {
    return c.html(htmlShell("Proposal Not Found", `
      <div class="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <div class="text-6xl mb-6">🔍</div>
        <h1 class="text-2xl font-bold text-white mb-3">Proposal not found</h1>
        <p class="text-gray-400 mb-8">This link may be invalid or expired.</p>
        <a href="/" class="btn-primary">Create a Proposal</a>
      </div>
    `), 404);
  }

  const priceDisplay = `$${(proposal.price_cents / 100).toFixed(2)}`;
  const isPaid = Boolean(proposal.paid);
  const checkoutUrl = proposal.ls_checkout_url || "#";

  const fileSection = isPaid
    ? `<div class="bg-green-950 border border-green-800 rounded-2xl p-8 text-center">
        <div class="text-4xl mb-3">✅</div>
        <p class="font-bold text-green-300 text-lg mb-2">Payment confirmed!</p>
        <p class="text-gray-300 text-sm mb-6">Your files are unlocked and ready to download.</p>
        <a href="${proposal.file_url}" target="_blank" rel="noopener"
          class="btn-primary inline-flex items-center gap-2 text-base px-8 py-4">
          ↓ Download Your Files
        </a>
      </div>`
    : `<div id="locked-section" class="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center">
        <div class="text-5xl mb-3">🔒</div>
        <p class="font-semibold text-gray-200 text-lg mb-2">Files locked until payment</p>
        <p class="text-gray-500 text-sm mb-6">Your files will unlock automatically the moment payment clears.</p>
        <a href="${checkoutUrl}" target="_blank" id="pay-btn" class="btn-primary inline-flex items-center gap-2 text-base px-8 py-4">
          Pay ${priceDisplay} to Unlock Files →
        </a>
        <p class="text-gray-700 text-xs mt-4">Powered by LemonSqueezy · Secure checkout</p>
      </div>
      <div id="unlocked-section" class="hidden bg-green-950 border border-green-800 rounded-2xl p-8 text-center">
        <div class="text-4xl mb-3">✅</div>
        <p class="font-bold text-green-300 text-lg mb-2">Payment confirmed!</p>
        <p class="text-gray-300 text-sm mb-6">Your files are unlocked and ready to download.</p>
        <a id="file-link" href="#" target="_blank" rel="noopener"
          class="btn-primary inline-flex items-center gap-2 text-base px-8 py-4">
          ↓ Download Your Files
        </a>
      </div>`;

  const pollingScript = isPaid ? "" : `
  <script>
    (function poll() {
      setTimeout(async () => {
        try {
          const res = await fetch('/api/proposals/${id}/status');
          const data = await res.json();
          if (data.paid) {
            const full = await fetch('/api/proposals/${id}');
            const proposal = await full.json();
            document.getElementById('locked-section').classList.add('hidden');
            const unlocked = document.getElementById('unlocked-section');
            unlocked.classList.remove('hidden');
            if (proposal.file_url) {
              document.getElementById('file-link').href = proposal.file_url;
            }
            return;
          }
        } catch(e) { /* ignore */ }
        poll();
      }, 3000);
    })();
  </script>`;

  const html = htmlShell(`${proposal.title} — ProposalLock`, `
  <div class="max-w-xl mx-auto px-6 py-16">
    <div class="flex items-center gap-2 mb-12 text-sm text-gray-500">
      <span class="text-lg">🔒</span>
      <span class="font-medium text-gray-400">ProposalLock</span>
    </div>

    <div class="bg-gray-900 border border-gray-800 rounded-2xl p-8 mb-6">
      <p class="text-xs text-gray-500 uppercase tracking-widest mb-4 font-medium">Proposal</p>
      <h1 class="text-2xl font-bold text-white mb-6">${proposal.title}</h1>
      <div class="space-y-3">
        <div class="flex justify-between items-center text-sm">
          <span class="text-gray-500">Client</span>
          <span class="text-gray-200 font-medium">${proposal.client_name}</span>
        </div>
        <div class="flex justify-between items-center text-sm">
          <span class="text-gray-500">Investment</span>
          <span class="text-indigo-300 font-bold text-lg">${priceDisplay}</span>
        </div>
        <div class="flex justify-between items-center text-sm">
          <span class="text-gray-500">Files</span>
          <span class="text-gray-500">${isPaid ? '✅ Unlocked' : '🔒 Locked until payment'}</span>
        </div>
      </div>
    </div>

    ${fileSection}
  </div>

  ${pollingScript}
  `);
  return c.html(html);
});

// Success page after LemonSqueezy redirect
app.get("/p/:id/success", async (c) => {
  const id = c.req.param("id");
  const proposal = await getProposal(id);

  if (!proposal) {
    return c.redirect("/");
  }

  const html = htmlShell(`Payment Confirmed — ${proposal.title}`, `
  <div class="max-w-xl mx-auto px-6 py-16 text-center">
    <div class="flex items-center justify-center gap-2 mb-12 text-sm text-gray-500">
      <span class="text-lg">🔒</span>
      <span class="font-medium text-gray-400">ProposalLock</span>
    </div>

    <div id="pending-state" class="${proposal.paid ? 'hidden' : ''}">
      <div class="text-5xl mb-6 animate-pulse">⏳</div>
      <h1 class="text-2xl font-bold text-white mb-3">Confirming your payment…</h1>
      <p class="text-gray-400 text-sm mb-8">This usually takes a few seconds. Your files will unlock automatically.</p>
    </div>

    <div id="success-state" class="${proposal.paid ? '' : 'hidden'}">
      <div class="text-5xl mb-6">🎉</div>
      <h1 class="text-2xl font-bold text-white mb-3">Payment confirmed!</h1>
      <p class="text-gray-400 text-sm mb-8">Your files are unlocked and ready to download.</p>
      ${proposal.paid
        ? `<a href="${proposal.file_url}" target="_blank" class="btn-primary text-base px-8 py-4">↓ Download Your Files</a>`
        : `<a id="file-link" href="#" target="_blank" class="btn-primary text-base px-8 py-4">↓ Download Your Files</a>`
      }
    </div>

    <div class="mt-8 pt-8 border-t border-gray-800">
      <a href="/" class="text-gray-600 hover:text-gray-400 text-sm">← Back to ProposalLock</a>
    </div>
  </div>

  ${proposal.paid ? "" : `
  <script>
    (function poll() {
      setTimeout(async () => {
        try {
          const res = await fetch('/api/proposals/${id}/status');
          const data = await res.json();
          if (data.paid) {
            const full = await fetch('/api/proposals/${id}');
            const p = await full.json();
            document.getElementById('pending-state').classList.add('hidden');
            document.getElementById('success-state').classList.remove('hidden');
            if (p.file_url) {
              document.getElementById('file-link').href = p.file_url;
            }
            return;
          }
        } catch(e) {}
        poll();
      }, 2000);
    })();
  </script>`}
  `);
  return c.html(html);
});

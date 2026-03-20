import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createProposal, getProposal, markPaid, markPaidByVariant } from "./db.ts";
import { createCheckoutLink, verifyWebhookSignature } from "./lemonsqueezy.ts";

const app = new Hono();

// Serve static files from public/
app.use("/assets/*", serveStatic({ root: "./public" }));

// ─── API Routes ───────────────────────────────────────────────────────────────

// ─── Security: HTML escaping ───
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Security: ID validation ───
const VALID_ID = /^[a-f0-9]{32}$/;

// ─── Security: Rate limiting (in-memory) ───
const rateLimits = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string, maxPerMinute = 10): boolean {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= maxPerMinute) return false;
  entry.count++;
  return true;
}

// POST /api/proposals -- create proposal + LS checkout
app.post("/api/proposals", async (c) => {
  // Rate limit: 10 proposals per minute per IP
  const ip = c.req.header("x-forwarded-for") || "unknown";
  if (!checkRateLimit(ip, 10)) {
    return c.json({ error: "Too many requests. Try again in a minute." }, 429);
  }

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const { title, client_name, file_url, price } = body;
  if (!title || !client_name || !file_url || !price) {
    return c.json({ error: "Missing required fields: title, client_name, file_url, price" }, 400);
  }

  // Input validation: length limits
  if (typeof title !== "string" || title.length > 200) return c.json({ error: "Title too long (max 200 chars)" }, 400);
  if (typeof client_name !== "string" || client_name.length > 100) return c.json({ error: "Client name too long (max 100 chars)" }, 400);
  if (typeof file_url !== "string" || file_url.length > 2000) return c.json({ error: "File URL too long (max 2000 chars)" }, 400);

  // URL validation: must be https
  if (!file_url.startsWith("https://")) {
    return c.json({ error: "File URL must start with https://" }, 400);
  }

  const priceCents = Math.round(parseFloat(price) * 100);
  if (isNaN(priceCents) || priceCents < 100) {
    return c.json({ error: "Price must be at least $1.00" }, 400);
  }
  if (priceCents > 1_000_000) {
    return c.json({ error: "Price cannot exceed $10,000" }, 400);
  }

  // Full UUID for strong proposal IDs (128 bits entropy)
  const id = crypto.randomUUID().replace(/-/g, "");
  const baseUrl = process.env.BASE_URL || `https://${c.req.header("host")}`;
  const successUrl = `${baseUrl}/p/${id}/success`;

  const checkout = await createCheckoutLink({
    proposalId: id,
    title,
    clientName: client_name,
    priceCents,
    successUrl,
  });

  const proposal = createProposal({
    id,
    title,
    client_name,
    file_url,
    price_cents: priceCents,
    ls_variant_id: checkout?.variantId ?? null,
    ls_checkout_url: checkout?.checkoutUrl ?? null,
  });

  return c.json({
    id: proposal.id,
    proposal_url: `${baseUrl}/p/${id}`,
    checkout_url: proposal.ls_checkout_url,
  });
});

// GET /api/proposals/:id — public data (never exposes file_url if unpaid)
app.get("/api/proposals/:id", (c) => {
  const proposal = getProposal(c.req.param("id"));
  if (!proposal) return c.json({ error: "Not found" }, 404);

  return c.json({
    id: proposal.id,
    title: proposal.title,
    client_name: proposal.client_name,
    price_cents: proposal.price_cents,
    ls_checkout_url: proposal.ls_checkout_url,
    paid: proposal.paid === 1,
    paid_at: proposal.paid_at,
    // Only expose file_url if paid
    file_url: proposal.paid === 1 ? proposal.file_url : null,
  });
});

// GET /api/proposals/:id/status — fast polling endpoint
app.get("/api/proposals/:id/status", (c) => {
  const proposal = getProposal(c.req.param("id"));
  if (!proposal) return c.json({ error: "Not found" }, 404);
  return c.json({ paid: proposal.paid === 1 });
});

// POST /api/webhooks/lemonsqueezy — LS order_created event
app.post("/api/webhooks/lemonsqueezy", async (c) => {
  const signature = c.req.header("x-signature") || "";
  const rawBody = await c.req.text();

  const valid = await verifyWebhookSignature(rawBody, signature);
  if (!valid) return c.json({ error: "Invalid signature" }, 401);

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const eventName = payload?.meta?.event_name;

  if (eventName === "order_created") {
    const customData = payload?.meta?.custom_data;
    const proposalId = customData?.proposal_id;

    if (proposalId && typeof proposalId === "string") {
      markPaid(proposalId);
      console.log(`Payment confirmed for proposal ${proposalId.slice(0, 8)}...`);
    }
    // NOTE: Removed markPaidByVariant fallback -- shared variant ID would unlock ALL proposals
  }

  return c.json({ ok: true });
});

// ─── HTML Pages ───────────────────────────────────────────────────────────────

// Serve landing page + proposal creator at /
app.get("/", (c) => {
  return c.html(landingPage());
});

// Proposal page (XSS protection: validate ID is hex-only before injecting into HTML)
app.get("/p/:id", (c) => {
  const id = c.req.param("id");
  if (!VALID_ID.test(id)) return c.text("Not found", 404);
  return c.html(proposalPage(id));
});

// Success page
app.get("/p/:id/success", (c) => {
  const id = c.req.param("id");
  if (!VALID_ID.test(id)) return c.text("Not found", 404);
  return c.html(successPage(id));
});

// ─── Page HTML ────────────────────────────────────────────────────────────────

function landingPage(): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ProposalLock -- Your files unlock the moment they pay</title>
  <meta name="description" content="Create a proposal link. Attach your deliverables. Get paid before they download." />
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'] },
          colors: {
            warm: {
              50: '#fdfcfb',
              100: '#faf6f1',
              200: '#f3ece3',
              300: '#e8ddd0',
              400: '#c9b99a',
              500: '#a89272',
              600: '#8b7355',
              700: '#6b5a44',
              800: '#4a3f32',
              900: '#2d2620',
              950: '#1a1714',
            },
            accent: {
              50: '#eef2ff',
              100: '#e0e7ff',
              200: '#c7d2fe',
              300: '#a5b4fc',
              400: '#818cf8',
              500: '#6366f1',
              600: '#4f46e5',
              700: '#4338ca',
            },
            amber: {
              50: '#fffbeb',
              100: '#fef3c7',
              400: '#fbbf24',
              500: '#f59e0b',
              600: '#d97706',
            }
          }
        }
      }
    }
  </script>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .accent-gradient { background: linear-gradient(135deg, #4f46e5, #6366f1); }
  </style>
</head>
<body class="bg-warm-50 text-warm-900 min-h-screen antialiased">

  <!-- Nav -->
  <nav class="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <div class="w-8 h-8 accent-gradient rounded-lg flex items-center justify-center">
        <i data-lucide="lock" class="w-4 h-4 text-white"></i>
      </div>
      <span class="font-semibold text-warm-900 text-lg tracking-tight">ProposalLock</span>
    </div>
    <a href="#create" class="text-sm font-medium text-accent-600 hover:text-accent-700 transition">Create a proposal</a>
  </nav>

  <!-- Hero -->
  <section class="max-w-2xl mx-auto px-6 pt-16 pb-20 text-center">
    <div class="inline-flex items-center gap-2 bg-accent-50 border border-accent-200 rounded-full px-4 py-1.5 text-sm text-accent-700 mb-8">
      <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
      No subscription. $29 once. Yours forever.
    </div>
    <h1 class="text-4xl sm:text-5xl font-bold leading-[1.15] tracking-tight mb-6 text-warm-950">
      Your files unlock<br />the moment they pay.
    </h1>
    <p class="text-lg text-warm-600 mb-10 max-w-md mx-auto leading-relaxed">
      Create a proposal link. Attach your deliverables. Get paid before they download.
    </p>
    <a href="#create" class="inline-flex items-center gap-2 accent-gradient hover:opacity-90 text-white font-semibold px-8 py-3.5 rounded-xl transition text-base shadow-lg shadow-accent-500/20">
      Create Your First Proposal Free
      <i data-lucide="arrow-right" class="w-4 h-4"></i>
    </a>
    <p class="text-sm text-warm-500 mt-5">No account needed. Works in 30 seconds.</p>
  </section>

  <!-- Pain Points -->
  <section class="max-w-2xl mx-auto px-6 py-16">
    <h2 class="text-sm font-semibold text-warm-500 uppercase tracking-widest mb-8 text-center">Sound familiar?</h2>
    <div class="space-y-4">
      <div class="border-l-2 border-accent-300 pl-5 py-2">
        <p class="text-warm-800 leading-relaxed">"Sent files. Client said will pay Friday. That was 3 weeks ago."</p>
        <p class="text-sm text-warm-500 mt-1">-- r/freelance, 2024 (100+ upvotes)</p>
      </div>
      <div class="border-l-2 border-accent-300 pl-5 py-2">
        <p class="text-warm-800 leading-relaxed">2+ hours chasing invoices every week instead of doing client work.</p>
      </div>
      <div class="border-l-2 border-accent-300 pl-5 py-2">
        <p class="text-warm-800 leading-relaxed">HoneyBook charges $66/month. You just need a pay-to-unlock link.</p>
      </div>
    </div>
  </section>

  <!-- How It Works -->
  <section class="max-w-2xl mx-auto px-6 py-16">
    <h2 class="text-sm font-semibold text-warm-500 uppercase tracking-widest mb-10 text-center">How it works</h2>
    <div class="grid sm:grid-cols-3 gap-8">
      <div class="text-center">
        <p class="text-2xl font-bold text-accent-500 mb-2">1</p>
        <p class="font-medium text-warm-800 mb-1 text-sm">Paste your file URL</p>
        <p class="text-warm-600 text-sm">Set a price for access</p>
      </div>
      <div class="text-center">
        <p class="text-2xl font-bold text-accent-500 mb-2">2</p>
        <p class="font-medium text-warm-800 mb-1 text-sm">Send the link to your client</p>
        <p class="text-warm-600 text-sm">They see a clean proposal page</p>
      </div>
      <div class="text-center">
        <p class="text-2xl font-bold text-accent-500 mb-2">3</p>
        <p class="font-medium text-warm-800 mb-1 text-sm">Files unlock on payment</p>
        <p class="text-warm-600 text-sm">Instant, automatic access</p>
      </div>
    </div>
  </section>

  <!-- Proposal Creator Form -->
  <section id="create" class="max-w-2xl mx-auto px-6 py-16">
    <div class="bg-white border border-warm-200 rounded-2xl p-8 shadow-sm">
      <h2 class="text-xl font-semibold text-warm-900 mb-1">Create a proposal</h2>
      <p class="text-sm text-warm-500 mb-8">Free to try. Sell up to $29 worth of work, then unlock unlimited with ProposalLock.</p>

      <form id="proposalForm" class="space-y-5">
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Project title</label>
          <input type="text" name="title" required placeholder="Brand redesign -- Acme Corp"
            class="w-full bg-warm-50 border border-warm-200 rounded-xl px-4 py-3 text-warm-900 placeholder-warm-300 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-400 transition" />
        </div>
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Client name</label>
          <input type="text" name="client_name" required placeholder="Jane Smith"
            class="w-full bg-warm-50 border border-warm-200 rounded-xl px-4 py-3 text-warm-900 placeholder-warm-300 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-400 transition" />
        </div>
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Your file URL <span class="text-warm-500 font-normal">(Google Drive or Dropbox shareable link)</span></label>
          <input type="url" name="file_url" required placeholder="https://drive.google.com/file/d/..."
            class="w-full bg-warm-50 border border-warm-200 rounded-xl px-4 py-3 text-warm-900 placeholder-warm-300 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-400 transition" />
        </div>
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Price (USD)</label>
          <div class="relative">
            <span class="absolute left-4 top-1/2 -translate-y-1/2 text-warm-500 font-medium">$</span>
            <input type="number" name="price" required min="1" step="0.01" placeholder="500"
              class="w-full bg-warm-50 border border-warm-200 rounded-xl pl-8 pr-4 py-3 text-warm-900 placeholder-warm-300 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-400 transition" />
          </div>
        </div>
        <button type="submit" id="submitBtn"
          class="w-full accent-gradient hover:opacity-90 disabled:opacity-50 text-white font-semibold px-6 py-3.5 rounded-xl transition shadow-lg shadow-accent-500/20 flex items-center justify-center gap-2">
          Create Proposal
          <i data-lucide="arrow-right" class="w-4 h-4"></i>
        </button>
        <div id="formError" class="hidden text-red-500 text-sm text-center"></div>
      </form>

      <div id="proposalResult" class="hidden mt-6 bg-green-50 border border-green-200 rounded-xl p-5">
        <div class="flex items-center gap-2 mb-2">
          <i data-lucide="check-circle-2" class="w-5 h-5 text-green-600"></i>
          <p class="text-green-700 font-semibold">Proposal created!</p>
        </div>
        <p class="text-sm text-warm-500 mb-3">Share this link with your client:</p>
        <div class="flex gap-2">
          <input id="proposalUrl" readonly
            class="flex-1 bg-white border border-warm-200 rounded-lg px-3 py-2 text-sm text-warm-800" />
          <button onclick="copyUrl()" class="bg-warm-100 hover:bg-warm-200 text-warm-700 text-sm px-4 py-2 rounded-lg transition font-medium flex items-center gap-1.5">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
            Copy
          </button>
        </div>
      </div>
    </div>
  </section>

  <!-- Pricing -->
  <section class="max-w-2xl mx-auto px-6 py-16">
    <h2 class="text-sm font-semibold text-warm-500 uppercase tracking-widest mb-8 text-center">Simple pricing</h2>
    <div class="bg-white border border-warm-200 rounded-2xl p-8 max-w-sm mx-auto text-center shadow-sm">
      <div class="text-5xl font-bold text-warm-950 mb-1 tracking-tight">$29</div>
      <div class="text-warm-500 text-sm mb-8">one-time -- no subscription -- lifetime access</div>
      <ul class="text-left space-y-3 text-warm-700 text-sm mb-8">
        <li class="flex items-center gap-2.5"><i data-lucide="check" class="w-4 h-4 text-accent-500 flex-shrink-0"></i> Unlimited proposals</li>
        <li class="flex items-center gap-2.5"><i data-lucide="check" class="w-4 h-4 text-accent-500 flex-shrink-0"></i> Payment-gated file delivery</li>
        <li class="flex items-center gap-2.5"><i data-lucide="check" class="w-4 h-4 text-accent-500 flex-shrink-0"></i> Auto-unlock on payment</li>
        <li class="flex items-center gap-2.5"><i data-lucide="check" class="w-4 h-4 text-accent-500 flex-shrink-0"></i> Works with Google Drive & Dropbox</li>
        <li class="flex items-center gap-2.5"><i data-lucide="check" class="w-4 h-4 text-accent-500 flex-shrink-0"></i> 30-day money-back guarantee</li>
      </ul>
      <a href="${process.env.LS_CHECKOUT_URL || '#create'}"
        class="block w-full accent-gradient hover:opacity-90 text-white font-semibold py-3.5 rounded-xl transition shadow-lg shadow-accent-500/20">
        Get ProposalLock -- $29
      </a>
      <p class="text-xs text-warm-500 mt-4">vs HoneyBook at $66/month = $792/year</p>
    </div>
  </section>

  <!-- FAQ -->
  <section class="max-w-2xl mx-auto px-6 py-16">
    <h2 class="text-sm font-semibold text-warm-500 uppercase tracking-widest mb-8 text-center">Frequently asked questions</h2>
    <div class="space-y-6">
      <div class="bg-white border border-warm-200 rounded-xl p-5 shadow-sm">
        <p class="font-medium text-warm-800 mb-2">Does this work with Google Drive or Dropbox?</p>
        <p class="text-warm-500 text-sm leading-relaxed">Yes. Paste any shareable link -- Google Drive, Dropbox, OneDrive, or a direct URL. Use "anyone with link" sharing so the file is accessible once unlocked.</p>
      </div>
      <div class="bg-white border border-warm-200 rounded-xl p-5 shadow-sm">
        <p class="font-medium text-warm-800 mb-2">What happens if my client doesn't pay?</p>
        <p class="text-warm-500 text-sm leading-relaxed">The file URL stays hidden. They see a locked state with the payment button. No file access until payment clears.</p>
      </div>
      <div class="bg-white border border-warm-200 rounded-xl p-5 shadow-sm">
        <p class="font-medium text-warm-800 mb-2">Can I change the price after sending?</p>
        <p class="text-warm-500 text-sm leading-relaxed">No. The price is locked when the proposal is created. This protects both you and your client. Create a new proposal if you need a different price.</p>
      </div>
      <div class="bg-white border border-warm-200 rounded-xl p-5 shadow-sm">
        <p class="font-medium text-warm-800 mb-2">Do I need an account?</p>
        <p class="text-warm-500 text-sm leading-relaxed">No accounts, no login, no dashboard. Paste your file, set a price, get a link. That is the whole product.</p>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="max-w-2xl mx-auto px-6 py-10 border-t border-warm-200 text-center">
    <div class="flex items-center justify-center gap-2 mb-3">
      <div class="w-6 h-6 accent-gradient rounded-md flex items-center justify-center">
        <i data-lucide="lock" class="w-3 h-3 text-white"></i>
      </div>
      <span class="font-semibold text-warm-700 text-sm">ProposalLock</span>
    </div>
    <p class="text-warm-500 text-sm">&copy; 2026 ProposalLock &middot; <a href="mailto:hello@proposallock.io" class="hover:text-accent-600 transition">Contact</a></p>
  </footer>

  <script>
    lucide.createIcons();

    const form = document.getElementById('proposalForm');
    const submitBtn = document.getElementById('submitBtn');
    const formError = document.getElementById('formError');
    const proposalResult = document.getElementById('proposalResult');
    const proposalUrlInput = document.getElementById('proposalUrl');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Creating...</span>';
      formError.classList.add('hidden');

      const data = Object.fromEntries(new FormData(form));
      try {
        const res = await fetch('/api/proposals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Something went wrong');

        proposalUrlInput.value = json.proposal_url;
        proposalResult.classList.remove('hidden');
        proposalResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        form.reset();
        lucide.createIcons();
      } catch (err) {
        formError.textContent = err.message;
        formError.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Create Proposal <i data-lucide="arrow-right" class="w-4 h-4 inline"></i>';
        lucide.createIcons();
      }
    });

    function copyUrl() {
      proposalUrlInput.select();
      document.execCommand('copy');
      const btn = event.target.closest('button');
      btn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5"></i> Copied!';
      lucide.createIcons();
      setTimeout(() => {
        btn.innerHTML = '<i data-lucide="copy" class="w-3.5 h-3.5"></i> Copy';
        lucide.createIcons();
      }, 2000);
    }
  </script>
</body>
</html>`;
}

function proposalPage(id: string): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ProposalLock -- Proposal</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'] },
          colors: {
            warm: { 50: '#fdfcfb', 100: '#faf6f1', 200: '#f3ece3', 300: '#e8ddd0', 400: '#c9b99a', 500: '#a89272', 600: '#8b7355', 700: '#6b5a44', 800: '#4a3f32', 900: '#2d2620', 950: '#1a1714' },
            accent: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca' },
          }
        }
      }
    }
  </script>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .accent-gradient { background: linear-gradient(135deg, #4f46e5, #6366f1); }
  </style>
</head>
<body class="bg-warm-50 text-warm-900 min-h-screen flex items-start justify-center pt-12 px-6 antialiased">
  <div class="w-full max-w-md">
    <div class="text-center mb-8 flex items-center justify-center gap-2">
      <div class="w-6 h-6 accent-gradient rounded-md flex items-center justify-center">
        <i data-lucide="lock" class="w-3 h-3 text-white"></i>
      </div>
      <span class="text-xs text-warm-500 tracking-widest uppercase font-semibold">Secured by ProposalLock</span>
    </div>

    <div id="loading" class="text-center text-warm-500 py-12 flex items-center justify-center gap-2">
      <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
      Loading proposal...
    </div>

    <div id="content" class="hidden">
      <div class="bg-white border border-warm-200 rounded-2xl p-6 mb-4 shadow-sm">
        <p class="text-xs text-warm-500 uppercase tracking-wider mb-1 font-medium">Project</p>
        <h1 id="title" class="text-2xl font-bold text-warm-950 mb-4"></h1>
        <div class="flex items-center gap-2 text-warm-500 text-sm">
          <i data-lucide="user" class="w-4 h-4"></i>
          <span>Prepared for</span>
          <span id="clientName" class="text-warm-800 font-medium"></span>
        </div>
      </div>

      <!-- Locked state -->
      <div id="lockedState" class="hidden">
        <div class="bg-white border border-amber-200 rounded-2xl p-6 mb-4 text-center shadow-sm">
          <div class="w-14 h-14 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i data-lucide="lock" class="w-6 h-6 text-amber-600"></i>
          </div>
          <p class="text-warm-800 font-semibold mb-1">Files locked until payment</p>
          <p class="text-warm-500 text-sm mb-5">Pay once to access all deliverables for this project.</p>
          <div class="text-3xl font-bold text-warm-950 mb-6 tracking-tight" id="price"></div>
          <a id="checkoutBtn" href="#" target="_blank"
            class="flex items-center justify-center gap-2 w-full accent-gradient hover:opacity-90 text-white font-semibold py-3.5 rounded-xl transition text-center shadow-lg shadow-accent-500/20">
            <i data-lucide="credit-card" class="w-4 h-4"></i>
            Pay to Unlock Files
          </a>
          <p class="text-xs text-warm-500 mt-4 flex items-center justify-center gap-1">
            <i data-lucide="shield-check" class="w-3 h-3"></i>
            Secure payment via LemonSqueezy -- Files unlock instantly
          </p>
        </div>
        <p id="pollingStatus" class="text-center text-xs text-warm-500 flex items-center justify-center gap-1.5">
          <i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i>
          Waiting for payment confirmation...
        </p>
      </div>

      <!-- Paid/unlocked state -->
      <div id="unlockedState" class="hidden">
        <div class="bg-white border border-green-200 rounded-2xl p-6 text-center shadow-sm">
          <div class="w-14 h-14 bg-green-50 border border-green-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i data-lucide="check-circle-2" class="w-6 h-6 text-green-600"></i>
          </div>
          <p class="text-green-700 font-semibold text-lg mb-1">Payment confirmed!</p>
          <p class="text-warm-500 text-sm mb-6">Your files are unlocked and ready to download.</p>
          <a id="fileLink" href="#" target="_blank"
            class="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3.5 rounded-xl transition shadow-lg shadow-green-500/20">
            <i data-lucide="download" class="w-4 h-4"></i>
            Download Files
          </a>
        </div>
      </div>
    </div>

    <div id="error" class="hidden text-center text-red-500 py-12">Proposal not found.</div>
  </div>

  <script>
    lucide.createIcons();

    const proposalId = '${id}';
    let pollTimer = null;

    async function loadProposal() {
      try {
        const res = await fetch('/api/proposals/' + proposalId);
        if (!res.ok) throw new Error('Not found');
        const data = await res.json();
        renderProposal(data);
      } catch (e) {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error').classList.remove('hidden');
      }
    }

    function renderProposal(data) {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('content').classList.remove('hidden');

      document.getElementById('title').textContent = data.title;
      document.getElementById('clientName').textContent = data.client_name;

      const price = (data.price_cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

      if (data.paid) {
        document.getElementById('unlockedState').classList.remove('hidden');
        document.getElementById('fileLink').href = data.file_url || '#';
        stopPolling();
      } else {
        document.getElementById('lockedState').classList.remove('hidden');
        document.getElementById('price').textContent = price;
        const checkoutBtn = document.getElementById('checkoutBtn');
        if (data.ls_checkout_url) {
          checkoutBtn.href = data.ls_checkout_url;
        } else {
          checkoutBtn.textContent = 'Payment not configured';
          checkoutBtn.classList.add('opacity-50', 'pointer-events-none');
        }
        startPolling();
      }
      lucide.createIcons();
    }

    function startPolling() {
      pollTimer = setInterval(async () => {
        const res = await fetch('/api/proposals/' + proposalId + '/status');
        const { paid } = await res.json();
        if (paid) {
          clearInterval(pollTimer);
          await loadProposal();
        }
      }, 3000);
    }

    function stopPolling() {
      if (pollTimer) clearInterval(pollTimer);
    }

    loadProposal();
  </script>
</body>
</html>`;
}

function successPage(id: string): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ProposalLock -- Payment Confirmed</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'] },
          colors: {
            warm: { 50: '#fdfcfb', 100: '#faf6f1', 200: '#f3ece3', 300: '#e8ddd0', 400: '#c9b99a', 500: '#a89272', 700: '#6b5a44', 800: '#4a3f32', 900: '#2d2620', 950: '#1a1714' },
            accent: { 50: '#eef2ff', 500: '#6366f1', 600: '#4f46e5' },
          }
        }
      }
    }
  </script>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .accent-gradient { background: linear-gradient(135deg, #4f46e5, #6366f1); }
  </style>
</head>
<body class="bg-warm-50 text-warm-900 min-h-screen flex items-center justify-center px-6 antialiased">
  <div class="w-full max-w-md text-center">
    <div class="w-16 h-16 bg-green-50 border border-green-200 rounded-2xl flex items-center justify-center mx-auto mb-6">
      <i data-lucide="party-popper" class="w-8 h-8 text-green-600"></i>
    </div>
    <h1 class="text-3xl font-bold text-warm-950 mb-3 tracking-tight">Payment confirmed!</h1>
    <p class="text-warm-500 mb-8">Your files are now unlocked and ready to download.</p>

    <div id="loading" class="text-warm-500 text-sm flex items-center justify-center gap-2">
      <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
      Loading your files...
    </div>
    <div id="fileSection" class="hidden">
      <div class="bg-white border border-green-200 rounded-2xl p-6 mb-6 shadow-sm">
        <p class="text-sm text-warm-500 mb-4">Your deliverables:</p>
        <a id="fileLink" href="#" target="_blank"
          class="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3.5 rounded-xl transition shadow-lg shadow-green-500/20">
          <i data-lucide="download" class="w-4 h-4"></i>
          Download Files
        </a>
      </div>
      <p class="text-xs text-warm-500 flex items-center justify-center gap-1">
        <i data-lucide="bookmark" class="w-3 h-3"></i>
        Bookmark this page -- your link stays active.
      </p>
    </div>
    <div id="error" class="hidden text-amber-600 text-sm">
      Payment received! Files will unlock shortly. <a href="/p/${id}" class="underline font-medium hover:text-amber-700 transition">Return to proposal</a>
    </div>
  </div>

  <script>
    lucide.createIcons();

    async function loadFiles() {
      try {
        const res = await fetch('/api/proposals/${id}');
        const data = await res.json();
        document.getElementById('loading').classList.add('hidden');

        if (data.paid && data.file_url) {
          document.getElementById('fileLink').href = data.file_url;
          document.getElementById('fileSection').classList.remove('hidden');
          lucide.createIcons();
        } else {
          document.getElementById('error').classList.remove('hidden');
        }
      } catch (e) {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error').classList.remove('hidden');
      }
    }
    loadFiles();
  </script>
</body>
</html>`;
}

// ─── Start Server ─────────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT || "3000");
console.log(`ProposalLock running on http://localhost:${port}`);

// Start server
serve({ fetch: app.fetch, port });

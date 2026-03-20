import { Hono } from "hono";
// Use platform-appropriate static file serving
const serveStatic = typeof globalThis.Bun !== "undefined"
  ? (await import("hono/bun")).serveStatic
  : (await import("@hono/node-server/serve-static")).serveStatic;
import { createProposal, getProposal, markPaid, markPaidByVariant } from "./db";
import { createCheckoutLink, verifyWebhookSignature } from "./lemonsqueezy";

const app = new Hono();

// Serve static files from public/
app.use("/assets/*", serveStatic({ root: "./public" }));

// ─── API Routes ───────────────────────────────────────────────────────────────

// POST /api/proposals — create proposal + LS checkout
app.post("/api/proposals", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const { title, client_name, file_url, price } = body;
  if (!title || !client_name || !file_url || !price) {
    return c.json({ error: "Missing required fields: title, client_name, file_url, price" }, 400);
  }

  const priceCents = Math.round(parseFloat(price) * 100);
  if (isNaN(priceCents) || priceCents < 100) {
    return c.json({ error: "Price must be at least $1.00" }, 400);
  }

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
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

  const payload = JSON.parse(rawBody);
  const eventName = payload?.meta?.event_name;

  if (eventName === "order_created") {
    const customData = payload?.meta?.custom_data;
    const proposalId = customData?.proposal_id;
    const variantId = String(payload?.data?.attributes?.first_order_item?.variant_id || "");

    if (proposalId) {
      markPaid(proposalId);
      console.log(`✅ Proposal ${proposalId} marked paid via webhook`);
    } else if (variantId) {
      markPaidByVariant(variantId);
      console.log(`✅ Variant ${variantId} proposals marked paid`);
    }
  }

  return c.json({ ok: true });
});

// ─── HTML Pages ───────────────────────────────────────────────────────────────

// Serve landing page + proposal creator at /
app.get("/", (c) => {
  return c.html(landingPage());
});

// Proposal page
app.get("/p/:id", (c) => {
  const id = c.req.param("id");
  return c.html(proposalPage(id));
});

// Success page
app.get("/p/:id/success", (c) => {
  const id = c.req.param("id");
  return c.html(successPage(id));
});

// ─── Page HTML ────────────────────────────────────────────────────────────────

function landingPage(): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ProposalLock — Your files unlock the moment they pay</title>
  <meta name="description" content="Create a proposal link. Attach your deliverables. Get paid before they download." />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { sans: ['-apple-system','BlinkMacSystemFont','Inter','Segoe UI','Roboto','sans-serif'] },
          colors: { accent: '#6366f1' }
        }
      }
    }
  </script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif; }
    .gradient-text { background: linear-gradient(135deg, #818cf8, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  </style>
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen">

  <!-- Hero -->
  <section class="max-w-2xl mx-auto px-6 pt-20 pb-16 text-center">
    <div class="inline-flex items-center gap-2 bg-indigo-950 border border-indigo-800 rounded-full px-4 py-1.5 text-sm text-indigo-300 mb-8">
      <span class="w-2 h-2 bg-indigo-400 rounded-full"></span>
      No subscription. $29 once. Yours forever.
    </div>
    <h1 class="text-4xl sm:text-5xl font-bold leading-tight mb-5">
      Your files unlock<br /><span class="gradient-text">the moment they pay.</span>
    </h1>
    <p class="text-lg text-gray-400 mb-8">
      Create a proposal link. Attach your deliverables.<br class="hidden sm:block" />Get paid before they download.
    </p>
    <a href="#create" class="inline-block bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3.5 rounded-lg transition text-base">
      Create Your First Proposal Free →
    </a>
    <p class="text-sm text-gray-600 mt-4">No account needed. Works in 30 seconds.</p>
  </section>

  <!-- Pain Points -->
  <section class="max-w-2xl mx-auto px-6 py-12 border-t border-gray-800">
    <h2 class="text-xl font-semibold text-gray-300 mb-6 text-center">Sound familiar?</h2>
    <div class="space-y-4">
      <div class="flex gap-4 bg-gray-900 border border-gray-800 rounded-xl p-4">
        <span class="text-2xl mt-0.5">😤</span>
        <p class="text-gray-300">"Sent files. Client said will pay Friday. That was 3 weeks ago."<br /><span class="text-xs text-gray-500">— r/freelance, 2024 (100+ upvotes)</span></p>
      </div>
      <div class="flex gap-4 bg-gray-900 border border-gray-800 rounded-xl p-4">
        <span class="text-2xl mt-0.5">⏳</span>
        <p class="text-gray-300">2+ hours chasing invoices every week instead of doing client work.</p>
      </div>
      <div class="flex gap-4 bg-gray-900 border border-gray-800 rounded-xl p-4">
        <span class="text-2xl mt-0.5">💸</span>
        <p class="text-gray-300">HoneyBook charges $66/month. You just need a pay-to-unlock link.</p>
      </div>
    </div>
  </section>

  <!-- How It Works -->
  <section class="max-w-2xl mx-auto px-6 py-12 border-t border-gray-800">
    <h2 class="text-xl font-semibold text-gray-300 mb-8 text-center">How it works</h2>
    <div class="grid sm:grid-cols-3 gap-6">
      <div class="text-center">
        <div class="w-10 h-10 bg-indigo-900 border border-indigo-700 rounded-full flex items-center justify-center text-indigo-300 font-bold text-sm mx-auto mb-3">1</div>
        <p class="text-gray-300 text-sm">Paste your file URL and set a price</p>
      </div>
      <div class="text-center">
        <div class="w-10 h-10 bg-indigo-900 border border-indigo-700 rounded-full flex items-center justify-center text-indigo-300 font-bold text-sm mx-auto mb-3">2</div>
        <p class="text-gray-300 text-sm">Send the proposal link to your client</p>
      </div>
      <div class="text-center">
        <div class="w-10 h-10 bg-indigo-900 border border-indigo-700 rounded-full flex items-center justify-center text-indigo-300 font-bold text-sm mx-auto mb-3">3</div>
        <p class="text-gray-300 text-sm">Files unlock the moment payment clears</p>
      </div>
    </div>
  </section>

  <!-- Proposal Creator Form -->
  <section id="create" class="max-w-2xl mx-auto px-6 py-12 border-t border-gray-800">
    <h2 class="text-xl font-semibold text-gray-300 mb-2">Create a proposal</h2>
    <p class="text-sm text-gray-500 mb-6">Free to try. Sell up to $29 worth of work — then unlock unlimited with ProposalLock.</p>

    <form id="proposalForm" class="space-y-4">
      <div>
        <label class="block text-sm text-gray-400 mb-1.5">Project title</label>
        <input type="text" name="title" required placeholder="Brand redesign — Acme Corp"
          class="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition" />
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-1.5">Client name</label>
        <input type="text" name="client_name" required placeholder="Jane Smith"
          class="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition" />
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-1.5">Your file URL <span class="text-gray-600">(Google Drive or Dropbox shareable link)</span></label>
        <input type="url" name="file_url" required placeholder="https://drive.google.com/file/d/..."
          class="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition" />
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-1.5">Price (USD)</label>
        <div class="relative">
          <span class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">$</span>
          <input type="number" name="price" required min="1" step="0.01" placeholder="500"
            class="w-full bg-gray-900 border border-gray-700 rounded-lg pl-8 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition" />
        </div>
      </div>
      <button type="submit" id="submitBtn"
        class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-6 py-3.5 rounded-lg transition">
        Create Proposal →
      </button>
      <div id="formError" class="hidden text-red-400 text-sm text-center"></div>
    </form>

    <div id="proposalResult" class="hidden mt-6 bg-gray-900 border border-green-700 rounded-xl p-5">
      <p class="text-green-400 font-semibold mb-2">✓ Proposal created!</p>
      <p class="text-sm text-gray-400 mb-3">Share this link with your client:</p>
      <div class="flex gap-2">
        <input id="proposalUrl" readonly
          class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
        <button onclick="copyUrl()" class="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded-lg transition">
          Copy
        </button>
      </div>
    </div>
  </section>

  <!-- Pricing -->
  <section class="max-w-2xl mx-auto px-6 py-12 border-t border-gray-800">
    <h2 class="text-xl font-semibold text-gray-300 mb-6 text-center">Simple pricing</h2>
    <div class="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-sm mx-auto text-center">
      <div class="text-5xl font-bold text-white mb-1">$29</div>
      <div class="text-gray-500 text-sm mb-6">one-time · no subscription · lifetime access</div>
      <ul class="text-left space-y-2.5 text-gray-300 text-sm mb-6">
        <li class="flex gap-2"><span class="text-green-400">✓</span> Unlimited proposals</li>
        <li class="flex gap-2"><span class="text-green-400">✓</span> Payment-gated file delivery</li>
        <li class="flex gap-2"><span class="text-green-400">✓</span> Auto-unlock on payment</li>
        <li class="flex gap-2"><span class="text-green-400">✓</span> Works with Google Drive & Dropbox</li>
        <li class="flex gap-2"><span class="text-green-400">✓</span> 30-day money-back guarantee</li>
      </ul>
      <a href="${process.env.LS_CHECKOUT_URL || '#create'}"
        class="block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg transition">
        Get ProposalLock — $29
      </a>
      <p class="text-xs text-gray-600 mt-3">vs HoneyBook at $66/month = $792/year</p>
    </div>
  </section>

  <!-- FAQ -->
  <section class="max-w-2xl mx-auto px-6 py-12 border-t border-gray-800">
    <h2 class="text-xl font-semibold text-gray-300 mb-6 text-center">FAQ</h2>
    <div class="space-y-5">
      <div>
        <p class="font-medium text-gray-200 mb-1">Does this work with Google Drive or Dropbox?</p>
        <p class="text-gray-500 text-sm">Yes. Paste any shareable link — Google Drive, Dropbox, OneDrive, or a direct URL. Use a "anyone with link" sharing setting so the file is accessible once unlocked.</p>
      </div>
      <div>
        <p class="font-medium text-gray-200 mb-1">What happens if my client doesn't pay?</p>
        <p class="text-gray-500 text-sm">The file URL stays hidden. They see a locked state with the payment button — that's it. No file access until payment clears.</p>
      </div>
      <div>
        <p class="font-medium text-gray-200 mb-1">Can I change the price after sending?</p>
        <p class="text-gray-500 text-sm">No — the price is locked when the proposal is created. This protects both you and your client. Create a new proposal if you need a different price.</p>
      </div>
      <div>
        <p class="font-medium text-gray-200 mb-1">Do I need an account?</p>
        <p class="text-gray-500 text-sm">No accounts, no login, no dashboard. Paste your file, set a price, get a link. That's the whole product.</p>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="max-w-2xl mx-auto px-6 py-8 border-t border-gray-800 text-center">
    <p class="text-gray-600 text-sm">© 2026 ProposalLock · <a href="mailto:hello@proposallock.io" class="hover:text-gray-400 transition">Contact</a></p>
  </footer>

  <script>
    const form = document.getElementById('proposalForm');
    const submitBtn = document.getElementById('submitBtn');
    const formError = document.getElementById('formError');
    const proposalResult = document.getElementById('proposalResult');
    const proposalUrlInput = document.getElementById('proposalUrl');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating…';
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
      } catch (err) {
        formError.textContent = err.message;
        formError.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Proposal →';
      }
    });

    function copyUrl() {
      proposalUrlInput.select();
      document.execCommand('copy');
      const btn = event.target;
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 2000);
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
  <title>ProposalLock — Proposal</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif; }
  </style>
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen flex items-start justify-center pt-16 px-6">
  <div class="w-full max-w-md">
    <div class="text-center mb-8">
      <span class="text-xs text-indigo-400 tracking-widest uppercase font-semibold">Secured by ProposalLock</span>
    </div>

    <div id="loading" class="text-center text-gray-500 py-12">Loading proposal…</div>

    <div id="content" class="hidden">
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-4">
        <p class="text-xs text-gray-500 uppercase tracking-wider mb-1">Project</p>
        <h1 id="title" class="text-2xl font-bold text-white mb-4"></h1>
        <div class="flex items-center gap-2 text-gray-400 text-sm">
          <span>For:</span>
          <span id="clientName" class="text-gray-200"></span>
        </div>
      </div>

      <!-- Locked state -->
      <div id="lockedState" class="hidden">
        <div class="bg-gray-900 border border-yellow-900 rounded-2xl p-6 mb-4 text-center">
          <div class="text-4xl mb-3">🔒</div>
          <p class="text-gray-300 font-medium mb-1">Files locked until payment</p>
          <p class="text-gray-500 text-sm mb-4">Pay once to access all deliverables for this project.</p>
          <div class="text-2xl font-bold text-white mb-5" id="price"></div>
          <a id="checkoutBtn" href="#" target="_blank"
            class="block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3.5 rounded-lg transition text-center">
            Pay to Unlock Files →
          </a>
          <p class="text-xs text-gray-600 mt-3">Secure payment via LemonSqueezy · Files unlock instantly</p>
        </div>
        <p id="pollingStatus" class="text-center text-xs text-gray-600">Waiting for payment confirmation…</p>
      </div>

      <!-- Paid/unlocked state -->
      <div id="unlockedState" class="hidden">
        <div class="bg-gray-900 border border-green-800 rounded-2xl p-6 text-center">
          <div class="text-4xl mb-3">✅</div>
          <p class="text-green-400 font-semibold text-lg mb-1">Payment confirmed!</p>
          <p class="text-gray-400 text-sm mb-5">Your files are unlocked and ready to download.</p>
          <a id="fileLink" href="#" target="_blank"
            class="block w-full bg-green-700 hover:bg-green-600 text-white font-semibold py-3.5 rounded-lg transition">
            Download Files →
          </a>
        </div>
      </div>
    </div>

    <div id="error" class="hidden text-center text-red-400 py-12">Proposal not found.</div>
  </div>

  <script>
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
    }

    function startPolling() {
      pollTimer = setInterval(async () => {
        const res = await fetch('/api/proposals/' + proposalId + '/status');
        const { paid } = await res.json();
        if (paid) {
          clearInterval(pollTimer);
          await loadProposal(); // Reload with file URL
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
  <title>ProposalLock — Payment Confirmed</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif; }
  </style>
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen flex items-center justify-center px-6">
  <div class="w-full max-w-md text-center">
    <div class="text-6xl mb-6">🎉</div>
    <h1 class="text-3xl font-bold text-white mb-3">Payment confirmed!</h1>
    <p class="text-gray-400 mb-8">Your files are now unlocked and ready to download.</p>

    <div id="loading" class="text-gray-500 text-sm">Loading your files…</div>
    <div id="fileSection" class="hidden">
      <div class="bg-gray-900 border border-green-800 rounded-2xl p-6 mb-6">
        <p class="text-sm text-gray-400 mb-3">Your deliverables:</p>
        <a id="fileLink" href="#" target="_blank"
          class="block w-full bg-green-700 hover:bg-green-600 text-white font-semibold py-3.5 rounded-lg transition">
          Download Files →
        </a>
      </div>
      <p class="text-xs text-gray-600">Bookmark this page — your link stays active.</p>
    </div>
    <div id="error" class="hidden text-yellow-400 text-sm">
      Payment received! Files will unlock shortly. <a href="/p/${id}" class="underline">Return to proposal</a>
    </div>
  </div>

  <script>
    async function loadFiles() {
      try {
        const res = await fetch('/api/proposals/${id}');
        const data = await res.json();
        document.getElementById('loading').classList.add('hidden');

        if (data.paid && data.file_url) {
          document.getElementById('fileLink').href = data.file_url;
          document.getElementById('fileSection').classList.remove('hidden');
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

// Bun export (used when running with bun)
export default {
  port,
  fetch: app.fetch,
};

// Node.js fallback (used on Render/Railway)
if (typeof globalThis.Bun === "undefined") {
  const { serve } = await import("@hono/node-server");
  serve({ fetch: app.fetch, port });
}

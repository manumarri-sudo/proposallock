import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";
import {
  createProposal,
  getProposal,
  markPaid,
  getProposalsByEmail,
  supabase,
} from "./db";
import { createCheckoutLink, verifyWebhookSignature } from "./lemonsqueezy";
import { notifyFreelancerPaid } from "./notify";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

const app = new Hono();

// ─── Security middleware ───
app.use(secureHeaders());
// CSRF on all mutating routes except webhooks (webhooks use HMAC)
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/api/webhooks/")) return next();
  return csrf({ origin: process.env.BASE_URL || "" })(c, next);
});

// Static files: Vercel serves public/ automatically at root.
// For local dev, static serving is handled in src/index.ts.

// ─── Analytics: lightweight page view tracking ───
app.use("*", async (c, next) => {
  await next();
  // Fire-and-forget: only track GET requests to HTML pages (not API, assets, or non-200)
  if (
    c.req.method === "GET" &&
    !c.req.path.startsWith("/api/") &&
    !c.req.path.startsWith("/assets/") &&
    c.res.status === 200
  ) {
    const url = new URL(c.req.url);
    const path = url.pathname;
    const referrer = c.req.header("Referer") || null;
    const utm_source = url.searchParams.get("utm_source") || null;
    const utm_medium = url.searchParams.get("utm_medium") || null;
    const utm_campaign = url.searchParams.get("utm_campaign") || null;
    supabase
      .from("page_views")
      .insert({ path, referrer, utm_source, utm_medium, utm_campaign })
      .then(({ error }) => {
        if (error) console.error("[Analytics] insert error:", error.message);
      });
  }
});

// ─── Security: HTML escaping ───
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

// Cleanup stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimits) {
    if (now > entry.resetAt) rateLimits.delete(ip);
  }
}, 300_000);

// ─── Security: Email validation ───
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Auth: per-request Supabase client with cookie session ───
function createRequestClient(c: any) {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(c.req.header("Cookie") ?? "");
      },
      setAll(cookiesToSet: any[]) {
        cookiesToSet.forEach(({ name, value, options }: any) => {
          c.header(
            "Set-Cookie",
            serializeCookieHeader(name, value, {
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "Lax",
              path: "/",
            }),
            { append: true }
          );
        });
      },
    },
  });
}

// Always use getUser() (server-verified), never getSession() alone
async function getSessionUser(
  c: any
): Promise<{ id: string; email: string } | null> {
  const client = createRequestClient(c);
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user || !user.email) return null;
  return { id: user.id, email: user.email };
}

// Shared Tailwind config block
const ogMeta = `
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${process.env.BASE_URL || "https://proposallock.vercel.app"}">
  <meta property="og:title" content="ProposalLock -- Your files unlock the moment they pay">
  <meta property="og:description" content="Create a proposal link. Attach your deliverables. Get paid before they download. Free for freelancers.">
  <meta property="og:image" content="${process.env.BASE_URL || "https://proposallock.vercel.app"}/assets/banner.svg">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="ProposalLock">
  <meta name="twitter:description" content="Payment-gated file delivery for freelancers. Free to use.">`;

const tailwindConfig = `
  ${ogMeta}
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'] },
          colors: {
            warm: {
              50: '#fdfcfb', 100: '#faf6f1', 200: '#f3ece3', 300: '#e8ddd0',
              400: '#c9b99a', 500: '#a89272', 600: '#8b7355', 700: '#6b5a44',
              800: '#4a3f32', 900: '#2d2620', 950: '#1a1714',
            },
            accent: {
              50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc',
              400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca',
            },
            amber: { 50: '#fffbeb', 100: '#fef3c7', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706' },
          }
        }
      }
    }
  </script>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .accent-gradient { background: linear-gradient(135deg, #4f46e5, #6366f1); }
  </style>`;

// Shared nav HTML
function navHtml(loggedIn = false): string {
  return `
  <nav class="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex items-center justify-between gap-4">
    <a href="/" class="flex items-center gap-2 flex-shrink-0" aria-label="ProposalLock home">
      <div class="w-8 h-8 accent-gradient rounded-lg flex items-center justify-center" aria-hidden="true">
        <i data-lucide="lock" class="w-4 h-4 text-white"></i>
      </div>
      <span class="font-semibold text-warm-900 text-lg tracking-tight">ProposalLock</span>
    </a>
    <div class="flex items-center gap-2 sm:gap-4 flex-wrap justify-end">
      ${loggedIn ? '<a href="/dashboard" class="text-sm font-medium text-accent-600 hover:text-accent-700 transition">Dashboard</a>' : ""}
      <a href="#create" class="text-sm font-medium text-accent-600 hover:text-accent-700 transition hidden sm:inline">Create a proposal</a>
      ${loggedIn ? '<a href="/auth/logout" class="text-sm text-warm-500 hover:text-warm-700 transition">Log out</a>' : '<a href="/login" class="text-sm text-warm-500 hover:text-warm-700 transition">Log in</a>'}
    </div>
  </nav>`;
}

// Shared footer HTML
function footerHtml(): string {
  return `
  <footer class="max-w-2xl mx-auto px-4 sm:px-6 py-10 border-t border-warm-200 text-center">
    <div class="flex items-center justify-center gap-2 mb-3">
      <div class="w-6 h-6 accent-gradient rounded-md flex items-center justify-center">
        <i data-lucide="lock" class="w-3 h-3 text-white"></i>
      </div>
      <span class="font-semibold text-warm-700 text-sm">ProposalLock</span>
    </div>
    <p class="text-warm-500 text-sm">
      &copy; 2026 ProposalLock &middot;
      <a href="/privacy" class="hover:text-accent-600 transition">Privacy</a> &middot;
      <a href="/terms" class="hover:text-accent-600 transition">Terms</a> &middot;
      <a href="mailto:hello@proposallock.io" class="hover:text-accent-600 transition">Contact</a>
    </p>
  </footer>`;
}

// ─── API Routes ──────────────────────────────────────────────────────────────

// POST /api/proposals -- create proposal + LS checkout
app.post("/api/proposals", async (c) => {
  const ip = c.req.header("x-forwarded-for") || "unknown";
  if (!checkRateLimit(ip, 10)) {
    return c.json({ error: "Too many requests. Try again in a minute." }, 429);
  }

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const { title, client_name, file_url, price, email } = body;
  if (!title || !client_name || !file_url || !price) {
    return c.json(
      { error: "Missing required fields: title, client_name, file_url, price" },
      400
    );
  }

  if (typeof title !== "string" || title.length > 200)
    return c.json({ error: "Title too long (max 200 chars)" }, 400);
  if (typeof client_name !== "string" || client_name.length > 100)
    return c.json({ error: "Client name too long (max 100 chars)" }, 400);
  if (typeof file_url !== "string" || file_url.length > 2000)
    return c.json({ error: "File URL too long (max 2000 chars)" }, 400);
  // Validate file_url: must be https:// OR a valid upload path (uploads/{uuid}/{filename})
  const VALID_UPLOAD_PATH = /^uploads\/[a-f0-9]{32}\/[a-zA-Z0-9._-]+$/;
  if (!file_url.startsWith("https://") && !VALID_UPLOAD_PATH.test(file_url))
    return c.json({ error: "File URL must start with https://" }, 400);

  // Validate email if provided
  let freelancerEmail: string | null = null;
  if (email && typeof email === "string") {
    if (!EMAIL_RE.test(email) || email.length > 320)
      return c.json({ error: "Invalid email address" }, 400);
    freelancerEmail = email.toLowerCase();
  }

  const priceCents = Math.round(parseFloat(price) * 100);
  if (isNaN(priceCents) || priceCents < 100)
    return c.json({ error: "Price must be at least $1.00" }, 400);
  if (priceCents > 1_000_000)
    return c.json({ error: "Price cannot exceed $10,000" }, 400);

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

  const isUpload = file_url.startsWith("uploads/");
  const proposal = await createProposal({
    id,
    title,
    client_name,
    file_url,
    price_cents: priceCents,
    ls_variant_id: checkout?.variantId ?? null,
    ls_checkout_url: checkout?.checkoutUrl ?? null,
    freelancer_email: freelancerEmail,
    file_type: isUpload ? "upload" : "url",
    storage_path: isUpload ? file_url : null,
  });

  return c.json({
    id: proposal.id,
    proposal_url: `${baseUrl}/p/${id}`,
    checkout_url: proposal.ls_checkout_url,
  });
});

// GET /api/proposals/:id -- public data (never exposes file_url if unpaid)
app.get("/api/proposals/:id", async (c) => {
  const id = c.req.param("id");
  if (!VALID_ID.test(id)) return c.json({ error: "Not found" }, 404);
  const proposal = await getProposal(id);
  if (!proposal) return c.json({ error: "Not found" }, 404);

  let fileUrl: string | null = null;
  if (proposal.paid === true) {
    if (proposal.file_type === "upload" && proposal.storage_path) {
      const { data } = await supabase.storage
        .from("proposal-files")
        .createSignedUrl(proposal.storage_path, 24 * 3600); // 24 hours (regenerated on each access)
      fileUrl = data?.signedUrl ?? null;
    } else {
      fileUrl = proposal.file_url;
    }
  }

  return c.json({
    id: proposal.id,
    title: proposal.title,
    client_name: proposal.client_name,
    price_cents: proposal.price_cents,
    ls_checkout_url: proposal.ls_checkout_url,
    paid: proposal.paid === true,
    paid_at: proposal.paid_at,
    file_url: fileUrl,
  });
});

// GET /api/proposals/:id/status -- fast polling endpoint
app.get("/api/proposals/:id/status", async (c) => {
  const id = c.req.param("id");
  if (!VALID_ID.test(id)) return c.json({ error: "Not found" }, 404);
  const proposal = await getProposal(id);
  if (!proposal) return c.json({ error: "Not found" }, 404);
  return c.json({ paid: proposal.paid === true });
});

// POST /api/webhooks/lemonsqueezy -- LS order_created event
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
      // Get proposal before marking paid (need email for notification)
      const proposal = await getProposal(proposalId);
      if (!proposal) {
        console.error(`Webhook: proposal ${proposalId.slice(0, 8)} not found`);
        return c.json({ ok: true });
      }
      await markPaid(proposalId);
      console.log(
        `Payment confirmed for proposal ${proposalId.slice(0, 8)}...`
      );

      // Send email notification to freelancer
      if (proposal?.freelancer_email) {
        notifyFreelancerPaid({
          freelancerEmail: proposal.freelancer_email,
          title: proposal.title,
          clientName: proposal.client_name,
          priceCents: proposal.price_cents,
          proposalId,
        }).catch((e) => console.error("Notification error:", e));
      }
    }
  }

  return c.json({ ok: true });
});

// ─── Auth Routes (Supabase Magic Link) ───────────────────────────────────────

// POST /auth/magic-link -- send magic link email
app.post("/auth/magic-link", async (c) => {
  const ip = c.req.header("x-forwarded-for") || "unknown";
  if (!checkRateLimit(ip, 5)) {
    return c.json({ error: "Too many requests. Try again in a minute." }, 429);
  }

  const body = await c.req.json().catch(() => null);
  if (!body?.email || !EMAIL_RE.test(body.email)) {
    return c.json({ error: "Valid email required" }, 400);
  }

  const client = createRequestClient(c);
  const baseUrl = process.env.BASE_URL || `https://${c.req.header("host")}`;
  const { error } = await client.auth.signInWithOtp({
    email: body.email.toLowerCase(),
    options: { emailRedirectTo: `${baseUrl}/auth/callback` },
  });

  if (error) {
    console.error("Magic link error:", error.message);
    return c.json({ error: "Failed to send login link" }, 500);
  }

  return c.json({ ok: true });
});

// GET /auth/callback -- handle all Supabase auth redirect flows
app.get("/auth/callback", async (c) => {
  const url = new URL(c.req.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const code = url.searchParams.get("code");
  const accessToken = url.searchParams.get("access_token");
  const refreshToken = url.searchParams.get("refresh_token");
  const client = createRequestClient(c);

  // PKCE flow: exchange code for session
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return c.redirect("/dashboard");
    console.error("PKCE exchange failed:", error.message);
  }

  // Token hash flow (email OTP verification)
  if (tokenHash && type) {
    const { error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as any,
    });
    if (!error) return c.redirect("/dashboard");
    console.error("OTP verify failed:", error.message);
  }

  // Implicit flow: access_token + refresh_token forwarded from hash fragment
  if (accessToken && refreshToken) {
    const { error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (!error) return c.redirect("/dashboard");
    console.error("setSession failed:", error.message);
  }

  // First load: hash fragment is client-side only, forward to server as query params
  return c.html(`<!DOCTYPE html>
<html><head><title>Logging in...</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"></head>
<body>
  <p>Completing login...</p>
  <script>
    const hash = window.location.hash.substring(1);
    if (hash) {
      window.location.href = '/auth/callback?' + hash;
    } else {
      window.location.href = '/login?error=auth_failed';
    }
  </script>
</body></html>`);
});

// GET /auth/logout
app.get("/auth/logout", async (c) => {
  const client = createRequestClient(c);
  await client.auth.signOut();
  return c.redirect("/");
});

// POST /api/upload -- upload file to Supabase Storage (30-day signed URL on retrieval)
app.post("/api/upload", async (c) => {
  const ip = c.req.header("x-forwarded-for") || "unknown";
  if (!checkRateLimit(ip, 5)) {
    return c.json({ error: "Too many requests. Try again in a minute." }, 429);
  }

  const formData = await c.req.formData().catch(() => null);
  if (!formData) return c.json({ error: "Invalid form data" }, 400);

  const file = formData.get("file") as File | null;
  if (!file) return c.json({ error: "No file provided" }, 400);

  if (file.size > 50 * 1024 * 1024)
    return c.json({ error: "File too large (max 50MB)" }, 400);

  const ALLOWED_TYPES = [
    "application/pdf",
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/zip", "application/x-zip-compressed",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
  ];
  if (!ALLOWED_TYPES.includes(file.type))
    return c.json({ error: "File type not allowed" }, 400);

  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_").substring(0, 200);
  const path = `uploads/${crypto.randomUUID().replace(/-/g, "")}/${safeName}`;

  const buffer = await file.arrayBuffer();
  const { error } = await supabase.storage
    .from("proposal-files")
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (error) {
    console.error("Storage upload error:", error.message);
    return c.json({ error: "Upload failed" }, 500);
  }

  return c.json({ path });
});

// ─── HTML Pages ──────────────────────────────────────────────────────────────

// Login page
app.get("/login", (c) => {
  return c.html(loginPage());
});

// Dashboard (requires auth)
app.get("/dashboard", async (c) => {
  const user = await getSessionUser(c);
  if (!user) {
    return c.redirect("/login");
  }
  const proposals = await getProposalsByEmail(user.email);
  return c.html(dashboardPage(user.email, proposals));
});

// Landing page
app.get("/", async (c) => {
  const user = await getSessionUser(c);
  return c.html(landingPage(!!user));
});

// Proposal page
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

// Privacy Policy
app.get("/privacy", async (c) => {
  const user = await getSessionUser(c);
  return c.html(privacyPage(!!user));
});

// Terms of Service
app.get("/terms", async (c) => {
  const user = await getSessionUser(c);
  return c.html(termsPage(!!user));
});

// ─── Page HTML ───────────────────────────────────────────────────────────────

function loginPage(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Log in -- ProposalLock</title>
  ${tailwindConfig}
</head>
<body class="bg-warm-50 text-warm-900 min-h-screen flex items-center justify-center px-4 sm:px-6 antialiased">
  <div class="w-full max-w-sm">
    <div class="text-center mb-8">
      <div class="w-12 h-12 accent-gradient rounded-xl flex items-center justify-center mx-auto mb-4" aria-hidden="true">
        <i data-lucide="lock" class="w-6 h-6 text-white"></i>
      </div>
      <h1 class="text-2xl font-bold text-warm-950 tracking-tight">Log in to ProposalLock</h1>
      <p class="text-warm-500 text-sm mt-2">We will send you a magic link -- no password needed.</p>
    </div>

    <div class="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
      <form id="loginForm" class="space-y-4">
        <div>
          <label for="login-email" class="block text-sm font-medium text-warm-700 mb-1.5">Email address</label>
          <input type="email" id="login-email" name="email" required placeholder="you@example.com"
            class="w-full bg-warm-50 border border-warm-200 rounded-xl px-4 py-3 text-warm-900 placeholder-warm-300 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-400 transition" />
        </div>
        <button type="submit" id="loginBtn"
          class="w-full accent-gradient hover:opacity-90 disabled:opacity-50 text-white font-semibold px-6 py-3.5 rounded-xl transition shadow-lg shadow-accent-500/20 flex items-center justify-center gap-2">
          <i data-lucide="mail" class="w-4 h-4" aria-hidden="true"></i>
          Send Magic Link
        </button>
      </form>
      <div id="loginSuccess" class="hidden mt-4 bg-green-50 border border-green-200 rounded-xl p-4 text-center" role="status" aria-live="polite">
        <p class="text-green-700 text-sm font-medium">Check your email for a login link.</p>
      </div>
      <div id="loginError" class="hidden mt-4 text-red-500 text-sm text-center" role="alert" aria-live="assertive"></div>
    </div>

    <p class="text-center text-warm-500 text-xs mt-6">
      <a href="/" class="hover:text-accent-600 transition">Back to home</a>
    </p>
  </div>

  <script>
    lucide.createIcons();
    const form = document.getElementById('loginForm');
    const btn = document.getElementById('loginBtn');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      btn.innerHTML = 'Sending...';
      document.getElementById('loginError').classList.add('hidden');
      try {
        const res = await fetch('/auth/magic-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email.value }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        document.getElementById('loginSuccess').classList.remove('hidden');
        form.classList.add('hidden');
      } catch (err) {
        document.getElementById('loginError').textContent = err.message;
        document.getElementById('loginError').classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="mail" class="w-4 h-4"></i> Send Magic Link';
        lucide.createIcons();
      }
    });
  </script>
</body>
</html>`;
}

function dashboardPage(
  email: string,
  proposals: Array<{
    id: string;
    title: string;
    client_name: string;
    price_cents: number;
    paid: boolean;
    created_at: string;
  }>
): string {
  const rows = proposals
    .map((p) => {
      const price = (p.price_cents / 100).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      });
      const date = new Date(p.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const status = p.paid
        ? '<span class="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-0.5 rounded-full text-xs font-medium"><i data-lucide="check-circle-2" class="w-3 h-3"></i> Paid</span>'
        : '<span class="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-xs font-medium"><i data-lucide="clock" class="w-3 h-3"></i> Pending</span>';
      const baseUrl =
        process.env.BASE_URL || "https://proposallock.vercel.app";
      return `
        <tr class="border-b border-warm-100 hover:bg-warm-50 transition">
          <td class="py-3 px-4">
            <a href="${baseUrl}/p/${escapeHtml(p.id)}" class="text-accent-600 hover:text-accent-700 font-medium text-sm transition">${escapeHtml(p.title)}</a>
          </td>
          <td class="py-3 px-4 text-sm text-warm-600">${escapeHtml(p.client_name)}</td>
          <td class="py-3 px-4 text-sm text-warm-800 font-medium">${price}</td>
          <td class="py-3 px-4">${status}</td>
          <td class="py-3 px-4 text-sm text-warm-500">${date}</td>
        </tr>`;
    })
    .join("");

  const totalRevenue = proposals
    .filter((p) => p.paid)
    .reduce((sum, p) => sum + p.price_cents, 0);
  const revenueFormatted = (totalRevenue / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const paidCount = proposals.filter((p) => p.paid).length;
  const pendingCount = proposals.filter((p) => !p.paid).length;

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dashboard -- ProposalLock</title>
  ${tailwindConfig}
</head>
<body class="bg-warm-50 text-warm-900 min-h-screen antialiased">
  ${navHtml(true)}

  <main class="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
      <div>
        <h1 class="text-2xl font-bold text-warm-950 tracking-tight">Dashboard</h1>
        <p class="text-warm-500 text-sm">${escapeHtml(email)}</p>
      </div>
      <a href="#create" class="inline-flex items-center justify-center gap-2 accent-gradient hover:opacity-90 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm shadow-lg shadow-accent-500/20">
        <i data-lucide="plus" class="w-4 h-4" aria-hidden="true"></i>
        New Proposal
      </a>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
      <div class="bg-white border border-warm-200 rounded-xl p-5 shadow-sm">
        <p class="text-xs text-warm-500 uppercase tracking-wider mb-1">Total Revenue</p>
        <p class="text-2xl font-bold text-warm-950">${revenueFormatted}</p>
      </div>
      <div class="bg-white border border-warm-200 rounded-xl p-5 shadow-sm">
        <p class="text-xs text-warm-500 uppercase tracking-wider mb-1">Paid</p>
        <p class="text-2xl font-bold text-green-600">${paidCount}</p>
      </div>
      <div class="bg-white border border-warm-200 rounded-xl p-5 shadow-sm">
        <p class="text-xs text-warm-500 uppercase tracking-wider mb-1">Pending</p>
        <p class="text-2xl font-bold text-amber-600">${pendingCount}</p>
      </div>
    </div>

    <!-- Proposals Table -->
    ${
      proposals.length > 0
        ? `
    <div class="bg-white border border-warm-200 rounded-2xl shadow-sm overflow-x-auto">
      <table class="w-full min-w-[600px]">
        <thead>
          <tr class="bg-warm-50 border-b border-warm-200">
            <th class="text-left py-3 px-4 text-xs font-semibold text-warm-500 uppercase tracking-wider">Project</th>
            <th class="text-left py-3 px-4 text-xs font-semibold text-warm-500 uppercase tracking-wider">Client</th>
            <th class="text-left py-3 px-4 text-xs font-semibold text-warm-500 uppercase tracking-wider">Price</th>
            <th class="text-left py-3 px-4 text-xs font-semibold text-warm-500 uppercase tracking-wider">Status</th>
            <th class="text-left py-3 px-4 text-xs font-semibold text-warm-500 uppercase tracking-wider">Created</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
        : `
    <div class="bg-white border border-warm-200 rounded-2xl p-12 text-center shadow-sm">
      <div class="w-14 h-14 bg-warm-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <i data-lucide="file-text" class="w-6 h-6 text-warm-400"></i>
      </div>
      <p class="text-warm-800 font-semibold mb-1">No proposals yet</p>
      <p class="text-warm-500 text-sm">Create your first proposal to get started.</p>
    </div>`
    }
  </main>

  ${footerHtml()}
  <script>lucide.createIcons();</script>
</body>
</html>`;
}

function landingPage(loggedIn = false): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ProposalLock -- Your files unlock the moment they pay</title>
  <meta name="description" content="Create a proposal link. Attach your deliverables. Get paid before they download." />
  ${tailwindConfig}
</head>
<body class="bg-warm-50 text-warm-900 min-h-screen antialiased">

  ${navHtml(loggedIn)}

  <!-- Hero -->
  <section class="max-w-2xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-16 sm:pb-20 text-center">
    <div class="inline-flex items-center gap-2 bg-accent-50 border border-accent-200 rounded-full px-4 py-1.5 text-sm text-accent-700 mb-8">
      <i data-lucide="sparkles" class="w-3.5 h-3.5" aria-hidden="true"></i>
      Free for freelancers. No subscription. No hidden fees.
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
    <p class="text-sm text-warm-500 mt-5">Works in 30 seconds.</p>
  </section>

  <!-- Pain Points -->
  <section class="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
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
  <section class="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
    <h2 class="text-sm font-semibold text-warm-500 uppercase tracking-widest mb-10 text-center">How it works</h2>
    <div class="grid sm:grid-cols-3 gap-8">
      <div class="text-center">
        <p class="text-2xl font-bold text-accent-500 mb-2">1</p>
        <p class="font-medium text-warm-800 mb-1 text-sm">Upload a file or paste a link</p>
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
  <section id="create" class="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
    <div class="bg-white border border-warm-200 rounded-2xl p-5 sm:p-8 shadow-sm">
      <h2 class="text-xl font-semibold text-warm-900 mb-1">Create a proposal</h2>
      <p class="text-sm text-warm-500 mb-8">Always free. Create a proposal, set your price, and get paid before your client downloads.</p>

      <form id="proposalForm" class="space-y-5">
        <div>
          <label for="proposal-email" class="block text-sm font-medium text-warm-700 mb-1.5">Your email <span class="text-warm-400 font-normal">(for payment notifications)</span></label>
          <input type="email" id="proposal-email" name="email" placeholder="you@example.com"
            class="w-full bg-warm-50 border border-warm-200 rounded-xl px-4 py-3 text-warm-900 placeholder-warm-300 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-400 transition" />
        </div>
        <div>
          <label for="proposal-title" class="block text-sm font-medium text-warm-700 mb-1.5">Project title</label>
          <input type="text" id="proposal-title" name="title" required placeholder="Brand redesign -- Acme Corp"
            class="w-full bg-warm-50 border border-warm-200 rounded-xl px-4 py-3 text-warm-900 placeholder-warm-300 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-400 transition" />
        </div>
        <div>
          <label for="proposal-client" class="block text-sm font-medium text-warm-700 mb-1.5">Client name</label>
          <input type="text" id="proposal-client" name="client_name" required placeholder="Jane Smith"
            class="w-full bg-warm-50 border border-warm-200 rounded-xl px-4 py-3 text-warm-900 placeholder-warm-300 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-400 transition" />
        </div>
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5" id="deliverable-label">Your deliverable</label>
          <div class="flex rounded-xl border border-warm-200 overflow-hidden mb-2 bg-warm-50" role="group" aria-label="File delivery method">
            <button type="button" id="modeUrl" onclick="setFileMode('url')" aria-pressed="true"
              class="flex-1 py-2 text-sm font-medium transition bg-white text-accent-600 border-r border-warm-200">
              Link (Google Drive / Dropbox)
            </button>
            <button type="button" id="modeUpload" onclick="setFileMode('upload')" aria-pressed="false"
              class="flex-1 py-2 text-sm font-medium transition text-warm-500">
              Upload file (30-day hosting)
            </button>
          </div>
          <div id="urlInput">
            <input type="url" name="file_url" placeholder="https://drive.google.com/file/d/..." aria-labelledby="deliverable-label"
              class="w-full bg-warm-50 border border-warm-200 rounded-xl px-4 py-3 text-warm-900 placeholder-warm-300 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-400 transition" />
          </div>
          <div id="uploadInput" class="hidden">
            <input type="file" id="fileUpload" accept=".pdf,.zip,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.pptx,.txt" aria-label="Upload deliverable file"
              class="w-full bg-warm-50 border border-warm-200 rounded-xl px-4 py-3 text-warm-900 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-accent-50 file:text-accent-700 focus:outline-none cursor-pointer" />
            <p class="text-xs text-warm-400 mt-1">PDF, ZIP, images, Office docs -- max 50MB. Stored securely for 30 days after upload.</p>
            <div id="uploadProgress" class="hidden mt-2 text-xs text-warm-500 flex items-center gap-1.5" role="status" aria-live="polite">
              <i data-lucide="loader-2" class="w-3 h-3 animate-spin" aria-hidden="true"></i>
              Uploading...
            </div>
          </div>
        </div>
        <div>
          <label for="proposal-price" class="block text-sm font-medium text-warm-700 mb-1.5">Price (USD)</label>
          <div class="relative">
            <span class="absolute left-4 top-1/2 -translate-y-1/2 text-warm-500 font-medium" aria-hidden="true">$</span>
            <input type="number" id="proposal-price" name="price" required min="1" step="0.01" placeholder="500"
              class="w-full bg-warm-50 border border-warm-200 rounded-xl pl-8 pr-4 py-3 text-warm-900 placeholder-warm-300 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-400 transition" />
          </div>
        </div>
        <button type="submit" id="submitBtn"
          class="w-full accent-gradient hover:opacity-90 disabled:opacity-50 text-white font-semibold px-6 py-3.5 rounded-xl transition shadow-lg shadow-accent-500/20 flex items-center justify-center gap-2">
          Create Proposal
          <i data-lucide="arrow-right" class="w-4 h-4"></i>
        </button>
        <div id="formError" class="hidden text-red-500 text-sm text-center" role="alert" aria-live="assertive"></div>
      </form>

      <div id="proposalResult" class="hidden mt-6 bg-green-50 border border-green-200 rounded-xl p-5" role="status" aria-live="polite">
        <div class="flex items-center gap-2 mb-2">
          <i data-lucide="check-circle-2" class="w-5 h-5 text-green-600"></i>
          <p class="text-green-700 font-semibold">Proposal created!</p>
        </div>
        <p class="text-sm text-warm-500 mb-3">Share this link with your client:</p>
        <div class="flex gap-2">
          <input id="proposalUrl" readonly
            class="flex-1 bg-white border border-warm-200 rounded-lg px-3 py-2 text-sm text-warm-800" />
          <button onclick="copyUrl()" aria-label="Copy proposal URL" class="bg-warm-100 hover:bg-warm-200 text-warm-700 text-sm px-4 py-2 rounded-lg transition font-medium flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-accent-500/20">
            <i data-lucide="copy" class="w-3.5 h-3.5" aria-hidden="true"></i>
            Copy
          </button>
        </div>
      </div>
    </div>
  </section>

  <!-- Security -->
  <section class="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
    <h2 class="text-sm font-semibold text-warm-500 uppercase tracking-widest mb-8 text-center">Security you can trust</h2>
    <div class="grid sm:grid-cols-3 gap-6">
      <div class="bg-white border border-warm-200 rounded-xl p-5 text-center shadow-sm">
        <div class="w-10 h-10 bg-accent-50 rounded-lg flex items-center justify-center mx-auto mb-3" aria-hidden="true">
          <i data-lucide="shield-check" class="w-5 h-5 text-accent-600"></i>
        </div>
        <p class="font-medium text-warm-800 text-sm mb-1">HMAC-verified webhooks</p>
        <p class="text-warm-500 text-xs">Every payment is cryptographically verified before unlocking files.</p>
      </div>
      <div class="bg-white border border-warm-200 rounded-xl p-5 text-center shadow-sm">
        <div class="w-10 h-10 bg-accent-50 rounded-lg flex items-center justify-center mx-auto mb-3" aria-hidden="true">
          <i data-lucide="eye-off" class="w-5 h-5 text-accent-600"></i>
        </div>
        <p class="font-medium text-warm-800 text-sm mb-1">Hidden until paid</p>
        <p class="text-warm-500 text-xs">File URLs are never exposed in the browser, API, or source code until payment clears.</p>
      </div>
      <div class="bg-white border border-warm-200 rounded-xl p-5 text-center shadow-sm">
        <div class="w-10 h-10 bg-accent-50 rounded-lg flex items-center justify-center mx-auto mb-3" aria-hidden="true">
          <i data-lucide="lock" class="w-5 h-5 text-accent-600"></i>
        </div>
        <p class="font-medium text-warm-800 text-sm mb-1">Flexible delivery</p>
        <p class="text-warm-500 text-xs">Link to Google Drive or Dropbox, or upload files directly for 30-day secure hosting.</p>
      </div>
    </div>
  </section>

  <!-- FAQ -->
  <section class="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
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
        <p class="font-medium text-warm-800 mb-2">Is ProposalLock really free?</p>
        <p class="text-warm-500 text-sm leading-relaxed">Yes. Creating proposals is completely free for freelancers. When your client pays, LemonSqueezy processes the payment and takes a small transaction fee. You keep the rest -- no platform fee from ProposalLock.</p>
      </div>
      <div class="bg-white border border-warm-200 rounded-xl p-5 shadow-sm">
        <p class="font-medium text-warm-800 mb-2">How do I track my proposals?</p>
        <p class="text-warm-500 text-sm leading-relaxed">Log in with your email to access your dashboard. You will see all your proposals, payment status, and total revenue at a glance.</p>
      </div>
      <div class="bg-white border border-warm-200 rounded-xl p-5 shadow-sm">
        <p class="font-medium text-warm-800 mb-2">Can I upload files directly instead of linking?</p>
        <p class="text-warm-500 text-sm leading-relaxed">Yes. Toggle to "Upload file" when creating a proposal. Files up to 50MB are stored securely in Supabase Storage. After payment, your client gets a signed download link valid for 30 days.</p>
      </div>
      <div class="bg-white border border-warm-200 rounded-xl p-5 shadow-sm">
        <p class="font-medium text-warm-800 mb-2">Is my data secure?</p>
        <p class="text-warm-500 text-sm leading-relaxed">Yes. We use HMAC-SHA256 webhook verification, encrypted database connections, and Supabase Storage with signed URLs that expire after 30 days. Payments are processed securely through LemonSqueezy.</p>
      </div>
    </div>
  </section>

  ${footerHtml()}

  <script>
    lucide.createIcons();

    let fileMode = 'url';
    function setFileMode(mode) {
      fileMode = mode;
      document.getElementById('urlInput').classList.toggle('hidden', mode !== 'url');
      document.getElementById('uploadInput').classList.toggle('hidden', mode !== 'upload');
      document.getElementById('modeUrl').classList.toggle('bg-white', mode === 'url');
      document.getElementById('modeUrl').classList.toggle('text-accent-600', mode === 'url');
      document.getElementById('modeUrl').classList.toggle('text-warm-500', mode !== 'url');
      document.getElementById('modeUrl').setAttribute('aria-pressed', mode === 'url');
      document.getElementById('modeUpload').classList.toggle('bg-white', mode === 'upload');
      document.getElementById('modeUpload').classList.toggle('text-accent-600', mode === 'upload');
      document.getElementById('modeUpload').classList.toggle('text-warm-500', mode !== 'upload');
      document.getElementById('modeUpload').setAttribute('aria-pressed', mode === 'upload');
      // Toggle required on URL input
      const urlField = document.querySelector('#urlInput input');
      urlField.required = (mode === 'url');
    }

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

      const formData = new FormData(form);
      const data = Object.fromEntries(formData);

      // Handle file upload mode
      if (fileMode === 'upload') {
        const fileInput = document.getElementById('fileUpload');
        const file = fileInput.files[0];
        if (!file) {
          formError.textContent = 'Please select a file to upload.';
          formError.classList.remove('hidden');
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Create Proposal <i data-lucide="arrow-right" class="w-4 h-4 inline"></i>';
          lucide.createIcons();
          return;
        }
        try {
          document.getElementById('uploadProgress').classList.remove('hidden');
          submitBtn.innerHTML = '<span>Uploading file...</span>';
          const uploadForm = new FormData();
          uploadForm.append('file', file);
          const uploadRes = await fetch('/api/upload', { method: 'POST', body: uploadForm });
          const uploadJson = await uploadRes.json();
          if (!uploadRes.ok) throw new Error(uploadJson.error || 'Upload failed');
          data.file_url = uploadJson.path;
          document.getElementById('uploadProgress').classList.add('hidden');
          submitBtn.innerHTML = '<span>Creating...</span>';
        } catch (err) {
          document.getElementById('uploadProgress').classList.add('hidden');
          formError.textContent = err.message;
          formError.classList.remove('hidden');
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Create Proposal <i data-lucide="arrow-right" class="w-4 h-4 inline"></i>';
          lucide.createIcons();
          return;
        }
      }

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

    async function copyUrl() {
      const url = proposalUrlInput.value;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
        } else {
          proposalUrlInput.select();
          document.execCommand('copy');
        }
      } catch (err) {
        proposalUrlInput.select();
        document.execCommand('copy');
      }
      const btn = event.target.closest('button');
      btn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5" aria-hidden="true"></i> Copied!';
      lucide.createIcons();
      setTimeout(() => {
        btn.innerHTML = '<i data-lucide="copy" class="w-3.5 h-3.5" aria-hidden="true"></i> Copy';
        lucide.createIcons();
      }, 2000);
    }
  </script>
</body>
</html>`;
}

function proposalPage(id: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ProposalLock -- Proposal</title>
  ${tailwindConfig}
</head>
<body class="bg-warm-50 text-warm-900 min-h-screen flex items-start justify-center pt-8 sm:pt-12 px-4 sm:px-6 antialiased">
  <div class="w-full max-w-md">
    <div class="text-center mb-8 flex items-center justify-center gap-2">
      <div class="w-6 h-6 accent-gradient rounded-md flex items-center justify-center" aria-hidden="true">
        <i data-lucide="lock" class="w-3 h-3 text-white"></i>
      </div>
      <a href="${process.env.BASE_URL || "https://proposallock.vercel.app"}/?ref=proposal" class="text-xs text-warm-500 tracking-widest uppercase font-semibold hover:text-accent-600 transition">Powered by ProposalLock</a>
    </div>

    <div id="loading" class="text-center text-warm-500 py-12 flex items-center justify-center gap-2" role="status" aria-live="polite">
      <i data-lucide="loader-2" class="w-4 h-4 animate-spin" aria-hidden="true"></i>
      Loading proposal...
    </div>

    <div id="content" class="hidden">
      <div class="bg-white border border-warm-200 rounded-2xl p-5 sm:p-6 mb-4 shadow-sm">
        <p class="text-xs text-warm-500 uppercase tracking-wider mb-1 font-medium">Project</p>
        <h1 id="title" class="text-xl sm:text-2xl font-bold text-warm-950 mb-4"></h1>
        <div class="flex items-center gap-2 text-warm-500 text-sm">
          <i data-lucide="user" class="w-4 h-4" aria-hidden="true"></i>
          <span>Prepared for</span>
          <span id="clientName" class="text-warm-800 font-medium"></span>
        </div>
      </div>

      <!-- Locked state -->
      <div id="lockedState" class="hidden">
        <div class="bg-white border border-amber-200 rounded-2xl p-5 sm:p-6 mb-4 text-center shadow-sm">
          <div class="w-14 h-14 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto mb-4" aria-hidden="true">
            <i data-lucide="lock" class="w-6 h-6 text-amber-600"></i>
          </div>
          <p class="text-warm-800 font-semibold mb-1">Files locked until payment</p>
          <p class="text-warm-500 text-sm mb-5">Pay once to access all deliverables for this project.</p>
          <div class="text-3xl font-bold text-warm-950 mb-6 tracking-tight" id="price"></div>
          <a id="checkoutBtn" href="#" target="_blank"
            class="flex items-center justify-center gap-2 w-full accent-gradient hover:opacity-90 text-white font-semibold py-3.5 rounded-xl transition text-center shadow-lg shadow-accent-500/20">
            <i data-lucide="credit-card" class="w-4 h-4" aria-hidden="true"></i>
            Pay to Unlock Files
          </a>
          <p class="text-xs text-warm-500 mt-4 flex items-center justify-center gap-1">
            <i data-lucide="shield-check" class="w-3 h-3" aria-hidden="true"></i>
            Secure payment via LemonSqueezy -- Files unlock instantly
          </p>
        </div>
        <p id="pollingStatus" class="text-center text-xs text-warm-500 flex items-center justify-center gap-1.5" role="status" aria-live="polite">
          <i data-lucide="loader-2" class="w-3 h-3 animate-spin" aria-hidden="true"></i>
          Waiting for payment confirmation...
        </p>
      </div>

      <!-- Paid/unlocked state -->
      <div id="unlockedState" class="hidden">
        <div class="bg-white border border-green-200 rounded-2xl p-5 sm:p-6 text-center shadow-sm">
          <div class="w-14 h-14 bg-green-50 border border-green-200 rounded-2xl flex items-center justify-center mx-auto mb-4" aria-hidden="true">
            <i data-lucide="check-circle-2" class="w-6 h-6 text-green-600"></i>
          </div>
          <p class="text-green-700 font-semibold text-lg mb-1">Payment confirmed!</p>
          <p class="text-warm-500 text-sm mb-6">Your files are unlocked and ready to download.</p>
          <a id="fileLink" href="#" target="_blank"
            class="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3.5 rounded-xl transition shadow-lg shadow-green-500/20">
            <i data-lucide="download" class="w-4 h-4" aria-hidden="true"></i>
            Download Files
          </a>
        </div>
      </div>
    </div>

    <div id="error" class="hidden text-center text-red-500 py-12" role="alert">Proposal not found.</div>
  </div>

  <p class="text-center mt-8 mb-4">
    <a href="${process.env.BASE_URL || "https://proposallock.vercel.app"}/?ref=proposal" class="text-xs text-warm-400 hover:text-accent-600 transition">
      Get paid before you deliver -- try ProposalLock free
    </a>
  </p>

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
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ProposalLock -- Payment Confirmed</title>
  ${tailwindConfig}
</head>
<body class="bg-warm-50 text-warm-900 min-h-screen flex items-center justify-center px-4 sm:px-6 antialiased">
  <div class="w-full max-w-md text-center">
    <div class="w-16 h-16 bg-green-50 border border-green-200 rounded-2xl flex items-center justify-center mx-auto mb-6" aria-hidden="true">
      <i data-lucide="party-popper" class="w-8 h-8 text-green-600"></i>
    </div>
    <h1 class="text-2xl sm:text-3xl font-bold text-warm-950 mb-3 tracking-tight">Payment confirmed!</h1>
    <p class="text-warm-500 mb-8">Your files are now unlocked and ready to download.</p>

    <div id="loading" class="text-warm-500 text-sm flex items-center justify-center gap-2" role="status" aria-live="polite">
      <i data-lucide="loader-2" class="w-4 h-4 animate-spin" aria-hidden="true"></i>
      Loading your files...
    </div>
    <div id="fileSection" class="hidden">
      <div class="bg-white border border-green-200 rounded-2xl p-5 sm:p-6 mb-6 shadow-sm">
        <p class="text-sm text-warm-500 mb-4">Your deliverables:</p>
        <a id="fileLink" href="#" target="_blank"
          class="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3.5 rounded-xl transition shadow-lg shadow-green-500/20">
          <i data-lucide="download" class="w-4 h-4" aria-hidden="true"></i>
          Download Files
        </a>
      </div>
      <p class="text-xs text-warm-500 flex items-center justify-center gap-1">
        <i data-lucide="bookmark" class="w-3 h-3" aria-hidden="true"></i>
        Bookmark this page -- your link stays active.
      </p>
    </div>
    <div id="error" class="hidden text-amber-600 text-sm" role="alert">
      Payment received! Files will unlock shortly. <a href="/p/${id}" class="underline font-medium hover:text-amber-700 transition">Return to proposal</a>
    </div>
    <p class="mt-8">
      <a href="${process.env.BASE_URL || "https://proposallock.vercel.app"}/?ref=success" class="text-xs text-warm-400 hover:text-accent-600 transition">
        Powered by ProposalLock -- get paid before you deliver
      </a>
    </p>
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

function privacyPage(loggedIn = false): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy -- ProposalLock</title>
  ${tailwindConfig}
</head>
<body class="bg-warm-50 text-warm-900 min-h-screen antialiased">
  ${navHtml(loggedIn)}
  <main class="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
    <h1 class="text-2xl sm:text-3xl font-bold text-warm-950 mb-2 tracking-tight">Privacy Policy</h1>
    <p class="text-warm-500 text-sm mb-10">Last updated: March 21, 2026</p>
    <div class="prose prose-warm space-y-6 text-warm-700 text-sm leading-relaxed">

      <h2 class="text-lg font-semibold text-warm-900 mt-8">1. What we collect</h2>
      <p>When you create a proposal, we store: project title, client name, file URL, price, and optionally your email address. When your client pays, we record the payment timestamp. We collect IP addresses for rate limiting (held in memory only, not persisted).</p>

      <h2 class="text-lg font-semibold text-warm-900 mt-8">2. How we use your data</h2>
      <ul class="list-disc list-inside space-y-1">
        <li>Proposal data is used solely to gate file access behind payment.</li>
        <li>Email addresses are used only for payment notifications and dashboard access.</li>
        <li>We do not sell, rent, or share your data with third parties except as required for payment processing.</li>
      </ul>

      <h2 class="text-lg font-semibold text-warm-900 mt-8">3. Payment processing</h2>
      <p>Payments are processed by <strong>LemonSqueezy</strong> (Lemon Squeezy, LLC). We do not store credit card numbers, bank details, or payment credentials. LemonSqueezy's privacy policy governs payment data handling.</p>

      <h2 class="text-lg font-semibold text-warm-900 mt-8">4. File storage</h2>
      <p>If you paste a link, file URLs point to third-party services (Google Drive, Dropbox, etc.) that you control. We only store the URL reference. If you upload a file directly, it is stored securely in Supabase Storage. After payment, your client receives a signed download link that expires after 30 days.</p>

      <h2 class="text-lg font-semibold text-warm-900 mt-8">5. Data storage and security</h2>
      <p>Your data is stored in a PostgreSQL database hosted by <strong>Supabase</strong> with encryption at rest and in transit. Access is restricted via Row Level Security policies and service-role authentication.</p>

      <h2 class="text-lg font-semibold text-warm-900 mt-8">6. Data retention</h2>
      <p>Proposal data is retained as long as your proposals are active. You may request deletion of your data by contacting us at hello@proposallock.io. We will delete your data within 30 days of a verified request.</p>

      <h2 class="text-lg font-semibold text-warm-900 mt-8">7. Your rights</h2>
      <p>You have the right to access, correct, or delete your personal data. For EU residents, you have rights under GDPR including data portability and the right to withdraw consent. Contact hello@proposallock.io for any data requests.</p>

      <h2 class="text-lg font-semibold text-warm-900 mt-8">8. Contact</h2>
      <p>For privacy questions: <a href="mailto:hello@proposallock.io" class="text-accent-600 hover:text-accent-700">hello@proposallock.io</a></p>
    </div>
  </main>
  ${footerHtml()}
  <script>lucide.createIcons();</script>
</body>
</html>`;
}

function termsPage(loggedIn = false): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Terms of Service -- ProposalLock</title>
  ${tailwindConfig}
</head>
<body class="bg-warm-50 text-warm-900 min-h-screen antialiased">
  ${navHtml(loggedIn)}
  <main class="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
    <h1 class="text-2xl sm:text-3xl font-bold text-warm-950 mb-2 tracking-tight">Terms of Service</h1>
    <p class="text-warm-500 text-sm mb-10">Last updated: March 21, 2026</p>
    <div class="prose prose-warm space-y-6 text-warm-700 text-sm leading-relaxed">

      <h2 class="text-lg font-semibold text-warm-900 mt-8">1. Service description</h2>
      <p>ProposalLock is a tool that allows freelancers to create payment-gated proposal links. When a client pays via the embedded checkout, the linked files are automatically unlocked for download.</p>

      <h2 class="text-lg font-semibold text-warm-900 mt-8">2. Acceptable use</h2>
      <p>You agree not to use ProposalLock for illegal content, fraud, phishing, malware distribution, or any activity that violates applicable laws. We reserve the right to suspend access for violations.</p>

      <h2 class="text-lg font-semibold text-warm-900 mt-8">3. Payments and refunds</h2>
      <ul class="list-disc list-inside space-y-1">
        <li>ProposalLock is free for freelancers to create proposals.</li>
        <li>Client payments to freelancers: processed by LemonSqueezy. Refund disputes for client payments are handled between the freelancer and client.</li>
        <li>ProposalLock is not a party to transactions between freelancers and clients.</li>
      </ul>

      <h2 class="text-lg font-semibold text-warm-900 mt-8">4. Limitation of liability</h2>
      <p>ProposalLock is provided "as is" without warranties of any kind. We are not liable for: lost revenue from failed payments, file access issues caused by third-party hosting services, or disputes between freelancers and clients.</p>

      <h2 class="text-lg font-semibold text-warm-900 mt-8">5. File delivery disclaimer</h2>
      <p>ProposalLock gates access to URLs you provide. We do not verify, host, or guarantee the availability of linked files. Ensuring your file links work correctly and remain accessible is your responsibility.</p>

      <h2 class="text-lg font-semibold text-warm-900 mt-8">6. Account-less architecture</h2>
      <p>ProposalLock operates without traditional user accounts. Proposals are identified by cryptographically random 128-bit IDs. You are responsible for saving your proposal links. Optionally, you can provide an email to access a dashboard view of your proposals.</p>

      <h2 class="text-lg font-semibold text-warm-900 mt-8">7. Changes to terms</h2>
      <p>We may update these terms from time to time. Changes will be posted on this page with an updated "Last updated" date. Continued use after changes constitutes acceptance.</p>

      <h2 class="text-lg font-semibold text-warm-900 mt-8">8. Contact</h2>
      <p>Questions about these terms: <a href="mailto:hello@proposallock.io" class="text-accent-600 hover:text-accent-700">hello@proposallock.io</a></p>
    </div>
  </main>
  ${footerHtml()}
  <script>lucide.createIcons();</script>
</body>
</html>`;
}

// ─── 404 Page ────────────────────────────────────────────────────────────────
function notFoundPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Not Found -- ProposalLock</title>
  ${tailwindConfig}
</head>
<body class="bg-warm-50 text-warm-800 min-h-screen flex flex-col">
  ${navHtml()}
  <main class="flex-1 flex items-center justify-center px-4">
    <div class="text-center max-w-md">
      <div class="w-16 h-16 accent-gradient rounded-2xl flex items-center justify-center mx-auto mb-6">
        <i data-lucide="file-question" class="w-8 h-8 text-white"></i>
      </div>
      <h1 class="text-3xl font-bold text-warm-900 mb-3">Page not found</h1>
      <p class="text-warm-500 mb-8">The page you're looking for doesn't exist or has been moved.</p>
      <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
        <a href="/" class="inline-flex items-center gap-2 px-5 py-2.5 accent-gradient text-white font-medium rounded-lg hover:opacity-90 transition">
          <i data-lucide="home" class="w-4 h-4"></i>
          Back to home
        </a>
        <a href="/#create" class="inline-flex items-center gap-2 px-5 py-2.5 border border-warm-300 text-warm-700 font-medium rounded-lg hover:bg-warm-100 transition">
          <i data-lucide="plus" class="w-4 h-4"></i>
          Create a proposal
        </a>
      </div>
    </div>
  </main>
  ${footerHtml()}
  <script>lucide.createIcons();</script>
</body>
</html>`;
}

app.notFound((c) => {
  return c.html(notFoundPage(), 404);
});

// ─── Error Handler ───────────────────────────────────────────────────────────
app.onError((err, c) => {
  console.error(`[Error] ${c.req.method} ${c.req.path}:`, err.message);
  return c.json({ error: "Internal server error" }, 500);
});

// ─── Storage Init (runs once per cold start) ────────────────────────────────

async function ensureStorageBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === "proposal-files");
  if (!exists) {
    const { error } = await supabase.storage.createBucket("proposal-files", {
      public: false,
      fileSizeLimit: 50 * 1024 * 1024,
    });
    if (error) console.error("Failed to create storage bucket:", error.message);
    else console.log("Created proposal-files storage bucket");
  }
}
ensureStorageBucket().catch((e) => console.error("Storage init error:", e));

export default app;

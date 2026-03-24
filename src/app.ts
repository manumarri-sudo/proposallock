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
  recordReminderSent,
  supabase,
  createTestimonial,
  getPublicTestimonials,
  getProposalsPendingTestimonialEmail,
  markTestimonialEmailSent,
  testimonialExistsForProposal,
  createTemplate,
  getTemplatesByEmail,
  deleteTemplate,
} from "./db";
import { createCheckoutLink, verifyWebhookSignature } from "./lemonsqueezy";
import { notifyFreelancerPaid, notifyFreelancerViewed, notifyClientReminder, sendTestimonialRequestEmail, notifyClientProposal } from "./notify";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

const app = new Hono();

// ─── Global error handler ───
app.onError((err, c) => {
  console.error(`[Error] ${c.req.method} ${c.req.path}:`, err.message);
  return c.json({ error: "Internal server error" }, 500);
});

// ─── Security middleware ───
app.use(secureHeaders());
// CSRF on all mutating routes except webhooks (webhooks use HMAC)
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/api/webhooks/")) return next();
  return csrf({ origin: process.env.BASE_URL || "" })(c, next);
});

// Static assets -- served inline since Vercel rewrites all paths to /api
app.get("/assets/favicon.svg", (c) => {
  c.header("Content-Type", "image/svg+xml");
  c.header("Cache-Control", "public, max-age=86400");
  return c.body(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" rx="8" fill="url(#g)"/>
  <path d="M11 15v-4a5 5 0 0 1 10 0v4" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
  <rect x="9" y="15" width="14" height="10" rx="3" fill="#fff" fill-opacity=".95"/>
  <circle cx="16" cy="20" r="2" fill="url(#g2)"/>
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop stop-color="#6366f1"/>
      <stop offset="1" stop-color="#4338ca"/>
    </linearGradient>
    <linearGradient id="g2" x1="14" y1="18" x2="18" y2="22" gradientUnits="userSpaceOnUse">
      <stop stop-color="#6366f1"/>
      <stop offset="1" stop-color="#4338ca"/>
    </linearGradient>
  </defs>
</svg>`);
});

app.get("/assets/banner.svg", (c) => {
  c.header("Content-Type", "image/svg+xml");
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" fill="none">
  <rect width="1200" height="630" fill="#fdfcfb"/>
  <rect x="0" y="0" width="1200" height="630" fill="url(#bg)"/>
  <rect x="540" y="140" width="120" height="120" rx="28" fill="url(#accent)"/>
  <path d="M576 200v-16a24 24 0 0 1 48 0v16" stroke="#fff" stroke-width="8" stroke-linecap="round"/>
  <rect x="568" y="200" width="64" height="44" rx="12" fill="#fff" fill-opacity=".95"/>
  <circle cx="600" cy="222" r="8" fill="url(#accent)"/>
  <text x="600" y="320" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="52" font-weight="700" fill="#1a1714" text-anchor="middle">Your files unlock</text>
  <text x="600" y="385" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="52" font-weight="700" fill="#1a1714" text-anchor="middle">the moment they pay.</text>
  <text x="600" y="450" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="28" fill="#8b7355" text-anchor="middle">Payment-gated file delivery for freelancers. Free to use.</text>
  <text x="600" y="520" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="22" font-weight="600" fill="#6366f1" text-anchor="middle">proposallock.vercel.app</text>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop stop-color="#fdfcfb"/>
      <stop offset="1" stop-color="#faf6f1"/>
    </linearGradient>
    <linearGradient id="accent" x1="540" y1="140" x2="660" y2="260" gradientUnits="userSpaceOnUse">
      <stop stop-color="#6366f1"/>
      <stop offset="1" stop-color="#4338ca"/>
    </linearGradient>
  </defs>
</svg>`);
});

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
        return parseCookieHeader(c.req.header("Cookie") ?? "")
          .map(({ name, value }) => ({ name, value: value ?? "" }));
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

const tailwindScripts = `
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

// Full config with og meta (used on pages without custom meta tags)
const tailwindConfig = `${ogMeta}${tailwindScripts}`;

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
      <a href="/#create" class="text-sm font-medium text-accent-600 hover:text-accent-700 transition hidden sm:inline">Create a proposal</a>
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
      <a href="mailto:bytewiseai.info@gmail.com" class="hover:text-accent-600 transition">Contact</a>
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

  const { title, client_name, file_url, price, email, client_email, description } = body;
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

  if (description && (typeof description !== "string" || description.length > 2000))
    return c.json({ error: "Description too long (max 2000 chars)" }, 400);

  // Validate freelancer email if provided
  let freelancerEmail: string | null = null;
  if (email && typeof email === "string") {
    if (!EMAIL_RE.test(email) || email.length > 320)
      return c.json({ error: "Invalid email address" }, 400);
    freelancerEmail = email.toLowerCase();
  }

  // Validate client email if provided
  let clientEmail: string | null = null;
  if (client_email && typeof client_email === "string") {
    if (!EMAIL_RE.test(client_email) || client_email.length > 320)
      return c.json({ error: "Invalid client email address" }, 400);
    clientEmail = client_email.toLowerCase();
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
    client_email: clientEmail,
    description: typeof description === "string" ? description.trim() : null,
    testimonial_email_sent_at: null,
  });

  // Auto-email client if email provided (removes manual send friction)
  let clientEmailSent = false;
  if (clientEmail) {
    clientEmailSent = await notifyClientProposal({
      clientEmail,
      clientName: client_name,
      title,
      proposalUrl: `${baseUrl}/p/${id}`,
      priceCents,
    }).catch(() => false);
  }

  return c.json({
    id: proposal.id,
    proposal_url: `${baseUrl}/p/${id}`,
    checkout_url: proposal.ls_checkout_url,
    client_email_sent: clientEmailSent,
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
    created_at: proposal.created_at,
    description: proposal.description ?? null,
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

// POST /api/proposals/:id/remind -- send client reminder email (auth required)
app.post("/api/proposals/:id/remind", async (c) => {
  const id = c.req.param("id");
  if (!VALID_ID.test(id)) return c.json({ error: "Not found" }, 404);

  // Auth: require Supabase session
  const cookieHeader = c.req.header("Cookie") ?? "";
  const supabaseClient = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() { return parseCookieHeader(cookieHeader); },
      setAll() {},
    },
  });
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const proposal = await getProposal(id);
  if (!proposal) return c.json({ error: "Not found" }, 404);
  if (proposal.freelancer_email !== user.email) return c.json({ error: "Forbidden" }, 403);
  if (proposal.paid) return c.json({ error: "Proposal already paid" }, 400);
  if (!proposal.client_email) return c.json({ error: "No client email on file" }, 400);
  if (proposal.reminder_count >= 3) return c.json({ error: "Reminder limit reached (max 3)" }, 429);

  // 24h cooldown between reminders
  if (proposal.reminder_sent_at) {
    const hoursSince = (Date.now() - new Date(proposal.reminder_sent_at).getTime()) / 3600000;
    if (hoursSince < 24) return c.json({ error: "Wait 24h between reminders" }, 429);
  }

  const baseUrl = process.env.BASE_URL || `https://${c.req.header("host")}`;
  // Fire-and-forget: never fail the request due to email error
  notifyClientReminder({
    clientEmail: proposal.client_email,
    clientName: proposal.client_name,
    title: proposal.title,
    proposalId: proposal.id,
    paymentUrl: `${baseUrl}/p/${proposal.id}`,
  }).catch((e) => console.error("[remind] email error:", e));

  await recordReminderSent(id, proposal.reminder_count);
  return c.json({ sent: true, reminder_count: proposal.reminder_count + 1 });
});

// POST /api/testimonials -- submit a testimonial (no auth, proposal_id is access token)
app.post("/api/testimonials", async (c) => {
  const ip = c.req.header("x-forwarded-for") || "unknown";
  if (!checkRateLimit(ip, 5)) {
    return c.json({ error: "Too many requests. Try again in a minute." }, 429);
  }

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const { proposal_id, body: testimonialBody, rating, display_name } = body;

  if (!proposal_id || typeof proposal_id !== "string")
    return c.json({ error: "proposal_id required" }, 400);

  const proposal = await getProposal(proposal_id);
  if (!proposal) return c.json({ error: "Proposal not found" }, 404);
  if (!proposal.paid) return c.json({ error: "Proposal not yet paid" }, 400);
  if (!proposal.freelancer_email)
    return c.json({ error: "No freelancer email on proposal" }, 400);

  if (!testimonialBody || typeof testimonialBody !== "string")
    return c.json({ error: "body required" }, 400);
  if (testimonialBody.length < 20 || testimonialBody.length > 500)
    return c.json({ error: "body must be 20-500 characters" }, 400);

  if (rating !== undefined && rating !== null) {
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5)
      return c.json({ error: "rating must be 1-5" }, 400);
  }

  if (display_name !== undefined && display_name !== null) {
    if (typeof display_name !== "string" || display_name.length > 100)
      return c.json({ error: "display_name too long" }, 400);
  }

  await createTestimonial({
    proposal_id,
    freelancer_email: proposal.freelancer_email,
    body: testimonialBody,
    rating: rating ?? null,
    display_name: display_name ?? null,
  });

  return c.json({ success: true });
});

// GET /api/stats -- public proposal count for social proof
app.get("/api/stats", async (c) => {
  c.header("Cache-Control", "public, max-age=300"); // 5-min cache
  const [totalRes, paidRes] = await Promise.all([
    supabase.from("proposals").select("*", { count: "exact", head: true }),
    supabase.from("proposals").select("*", { count: "exact", head: true }).eq("paid", true),
  ]);
  return c.json({
    proposals: totalRes.count ?? 0,
    paid: paidRes.count ?? 0,
  });
});

// GET /api/testimonials/public -- sanitized testimonials for landing page (no PII)
app.get("/api/testimonials/public", async (c) => {
  const testimonials = await getPublicTestimonials();
  return c.json(testimonials);
});

// GET /api/templates -- list user's templates (auth required)
app.get("/api/templates", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const templates = await getTemplatesByEmail(user.email);
  return c.json(templates);
});

// POST /api/templates -- create template (auth required)
app.post("/api/templates", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const { title, default_price_cents, file_url, file_type } = body;
  if (!title || typeof title !== "string" || title.trim().length === 0)
    return c.json({ error: "title required" }, 400);
  if (typeof default_price_cents !== "number" || default_price_cents < 100)
    return c.json({ error: "default_price_cents must be >= 100" }, 400);
  if (!file_url || typeof file_url !== "string")
    return c.json({ error: "file_url required" }, 400);

  const template = await createTemplate({
    freelancer_email: user.email,
    title: title.trim().substring(0, 200),
    default_price_cents,
    file_url: file_url.substring(0, 2000),
    file_type: file_type === "upload" ? "upload" : "url",
  });
  return c.json(template, 201);
});

// DELETE /api/templates/:id -- delete template (auth required, IDOR guarded)
app.delete("/api/templates/:id", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  if (!VALID_ID.test(id)) return c.json({ error: "Not found" }, 404);

  await deleteTemplate(id, user.email);
  return c.json({ success: true });
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
  const [proposals, templates] = await Promise.all([
    getProposalsByEmail(user.email),
    getTemplatesByEmail(user.email),
  ]);

  // 48h testimonial check: fire-and-forget, never delays dashboard load
  getProposalsPendingTestimonialEmail(user.email).then(async (pending) => {
    for (const p of pending) {
      // Double-check no testimonial already exists (idempotent)
      const alreadyHasTestimonial = await testimonialExistsForProposal(p.id);
      if (!alreadyHasTestimonial && p.paid_at) {
        await markTestimonialEmailSent(p.id);
        sendTestimonialRequestEmail({
          freelancerEmail: user.email,
          title: p.title,
          paidAt: p.paid_at,
          proposalId: p.id,
        }).catch((e) => console.error("[testimonial] email error:", e));
      }
    }
  }).catch((e) => console.error("[testimonial] 48h check error:", e));

  return c.html(dashboardPage(user.email, proposals, templates));
});

// Landing page
app.get("/", async (c) => {
  const user = await getSessionUser(c);
  return c.html(landingPage(!!user));
});

// Proposal page
app.get("/p/:id", async (c) => {
  const id = c.req.param("id");
  if (!VALID_ID.test(id)) return c.text("Not found", 404);

  // Fetch proposal for OG tags + first-view notification (single DB call)
  const proposal = await getProposal(id);

  // First-view notification: fire-and-forget (uses already-fetched proposal)
  if (proposal && proposal.freelancer_email && !proposal.paid) {
    supabase
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .eq("path", `/p/${id}`)
      .then(({ count }) => {
        if (count === 0) {
          notifyFreelancerViewed({
            freelancerEmail: proposal.freelancer_email!,
            title: proposal.title,
            clientName: proposal.client_name,
            proposalId: id,
          }).catch((e) => console.error("[notify] view notification error:", e));
        }
      })
      .catch(() => {});
  }

  const meta = proposal ? { title: proposal.title, price_cents: proposal.price_cents } : undefined;
  return c.html(proposalPage(id, meta));
});

// Success page
app.get("/p/:id/success", (c) => {
  const id = c.req.param("id");
  if (!VALID_ID.test(id)) return c.text("Not found", 404);
  return c.html(successPage(id));
});

// Testimonial form (public -- no auth required, proposal_id is access token)
app.get("/testimonial", async (c) => {
  const pid = c.req.query("pid") || "";
  if (!pid) return c.text("Missing proposal ID", 400);
  const proposal = await getProposal(pid);
  if (!proposal || !proposal.paid) {
    return c.html(`<!DOCTYPE html><html><head><title>Not Found</title></head><body><p>Proposal not found or not yet paid.</p></body></html>`, 404);
  }
  return c.html(testimonialPage(pid, escapeHtml(proposal.title)));
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
    client_email: string | null;
    reminder_count: number;
  }>,
  templates: Array<{
    id: string;
    title: string;
    default_price_cents: number;
    file_url: string;
    file_type: string;
  }> = []
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
          <td class="py-3 px-4">
            <div class="flex items-center gap-1.5">
              <button onclick="copyProposalLink('${baseUrl}/p/${escapeHtml(p.id)}', this)" aria-label="Copy proposal link" class="inline-flex items-center gap-1 text-xs text-warm-500 hover:text-accent-600 bg-warm-100 hover:bg-accent-50 px-2 py-1 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-accent-500/20">
                <i data-lucide="copy" class="w-3 h-3" aria-hidden="true"></i>
                Copy
              </button>
              ${!p.paid && p.client_email && p.reminder_count < 3 ? `<button id="remind-${escapeHtml(p.id)}" onclick="sendReminder('${escapeHtml(p.id)}')" aria-label="Send reminder to client" class="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-amber-400/20">
                <i data-lucide="bell" class="w-3 h-3" aria-hidden="true"></i>
                Remind
              </button>` : ""}
            </div>
          </td>
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
      <a href="/#create" class="inline-flex items-center justify-center gap-2 accent-gradient hover:opacity-90 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm shadow-lg shadow-accent-500/20">
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
            <th class="py-3 px-4"></th>
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
      <p class="text-warm-500 text-sm mb-5">Create your first proposal to get started.</p>
      <a href="/#create" class="inline-flex items-center gap-2 accent-gradient hover:opacity-90 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm shadow-lg shadow-accent-500/20">
        <i data-lucide="plus" class="w-4 h-4" aria-hidden="true"></i>
        Create your first proposal
      </a>
    </div>`
    }

    <!-- My Templates Section -->
    ${templates.length > 0 ? `
    <div class="mt-8">
      <h2 class="text-base font-semibold text-warm-900 mb-3 flex items-center gap-2">
        <i data-lucide="bookmark" class="w-4 h-4 text-accent-500" aria-hidden="true"></i>
        My Templates
      </h2>
      <div class="bg-white border border-warm-200 rounded-2xl shadow-sm overflow-x-auto">
        <table class="w-full min-w-[500px]">
          <thead>
            <tr class="bg-warm-50 border-b border-warm-200">
              <th class="text-left py-3 px-4 text-xs font-semibold text-warm-500 uppercase tracking-wider">Template</th>
              <th class="text-left py-3 px-4 text-xs font-semibold text-warm-500 uppercase tracking-wider">Default Price</th>
              <th class="text-left py-3 px-4 text-xs font-semibold text-warm-500 uppercase tracking-wider">Type</th>
              <th class="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            ${templates.map((t) => {
              const price = (t.default_price_cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
              const baseUrl = process.env.BASE_URL || "https://proposallock.vercel.app";
              const useUrl = `${baseUrl}/?title=${encodeURIComponent(t.title)}&price_cents=${t.default_price_cents}&file_url=${encodeURIComponent(t.file_url)}#create`;
              return `
            <tr class="border-b border-warm-100 hover:bg-warm-50 transition">
              <td class="py-3 px-4 text-sm font-medium text-warm-800">${escapeHtml(t.title)}</td>
              <td class="py-3 px-4 text-sm text-warm-600">${price}</td>
              <td class="py-3 px-4 text-xs text-warm-400 uppercase tracking-wide">${escapeHtml(t.file_type)}</td>
              <td class="py-3 px-4 flex gap-2 justify-end">
                <a href="${useUrl}" class="inline-flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700 bg-accent-50 hover:bg-accent-100 px-3 py-1.5 rounded-lg transition font-medium">
                  <i data-lucide="play" class="w-3 h-3" aria-hidden="true"></i>
                  Use
                </a>
                <button onclick="deleteTemplate('${escapeHtml(t.id)}', this)" aria-label="Delete template" class="inline-flex items-center gap-1 text-xs text-warm-400 hover:text-red-500 bg-warm-100 hover:bg-red-50 px-2 py-1.5 rounded-lg transition">
                  <i data-lucide="trash-2" class="w-3 h-3" aria-hidden="true"></i>
                </button>
              </td>
            </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>` : ""}
  </main>

  ${footerHtml()}
  <script>
    lucide.createIcons();
    function copyProposalLink(url, btn) {
      navigator.clipboard.writeText(url).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="check" class="w-3 h-3"></i> Copied';
        btn.classList.add('text-green-600', 'bg-green-50');
        lucide.createIcons();
        setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('text-green-600', 'bg-green-50'); lucide.createIcons(); }, 2000);
      });
    }
    async function sendReminder(id) {
      const btn = document.getElementById('remind-' + id);
      if (!btn) return;
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Sending...';
      lucide.createIcons();
      try {
        const res = await fetch('/api/proposals/' + id + '/remind', { method: 'POST' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed');
        btn.innerHTML = '<i data-lucide="check" class="w-3 h-3"></i> Sent!';
        btn.classList.add('text-green-600', 'bg-green-50');
        lucide.createIcons();
        // Disable if max reminders reached
        if (json.reminder_count >= 3) {
          btn.disabled = true;
          btn.title = 'Reminder limit reached (max 3)';
        } else {
          setTimeout(() => {
            btn.innerHTML = '<i data-lucide="bell" class="w-3 h-3"></i> Remind';
            btn.classList.remove('text-green-600', 'bg-green-50');
            btn.disabled = false;
            lucide.createIcons();
          }, 3000);
        }
      } catch (err) {
        btn.innerHTML = '<i data-lucide="bell" class="w-3 h-3"></i> Remind';
        btn.disabled = false;
        lucide.createIcons();
        alert(err.message);
      }
    }
    async function deleteTemplate(id, btn) {
      if (!confirm('Delete this template?')) return;
      btn.disabled = true;
      try {
        const res = await fetch('/api/templates/' + id, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed');
        btn.closest('tr').remove();
        // Hide section header if no rows left
        const tbody = document.querySelector('table:last-of-type tbody');
        if (tbody && tbody.children.length === 0) {
          const section = btn.closest('.mt-8');
          if (section) section.remove();
        }
      } catch {
        btn.disabled = false;
        alert('Could not delete template. Please try again.');
      }
    }
    // Auto-trigger remind if ?remind= URL param is present (from "client viewed" email CTA)
    (function() {
      const remindId = new URLSearchParams(window.location.search).get('remind');
      if (!remindId) return;
      const btn = document.getElementById('remind-' + remindId);
      if (btn && !btn.disabled) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        btn.classList.add('ring-2', 'ring-amber-400', 'ring-offset-1');
        setTimeout(() => sendReminder(remindId), 800);
      }
    })();
  </script>
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
    <p class="text-sm text-warm-500 mt-5">Works in 30 seconds. &middot; <a href="/p/40f976088b8b451ead213f130c87f166" target="_blank" class="text-accent-600 hover:underline font-medium">See what your client sees</a></p>
    <p id="social-proof" class="hidden text-xs text-warm-400 mt-2"></p>
  </section>

  <!-- Founder note -->
  <section class="max-w-2xl mx-auto px-4 sm:px-6 pb-4 sm:pb-6">
    <div class="bg-amber-50 border border-amber-200 rounded-2xl px-6 py-5 text-center">
      <p class="text-warm-700 text-sm leading-relaxed">Built after losing $4,200 to a client who gave glowing feedback, approved every revision, then vanished the day files arrived. ProposalLock does one thing: your files don't move until money does.</p>
      <p class="text-xs text-warm-500 mt-2 font-medium">No mobile app. No team plans. No monthly fee. Just the thing you need.</p>
    </div>
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

      <!-- Quick-start templates -->
      <div class="mb-6">
        <p class="text-xs text-warm-500 uppercase tracking-wider font-semibold mb-2">Quick-start templates</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" onclick="applyTemplate('Logo Design Package','500','Logo files (PNG, SVG, brand guidelines PDF)')" class="text-xs bg-warm-100 hover:bg-accent-50 hover:text-accent-700 text-warm-600 px-3 py-1.5 rounded-lg transition font-medium border border-warm-200 hover:border-accent-200">Logo Design -- $500</button>
          <button type="button" onclick="applyTemplate('Website Redesign','2000','Figma design files + exported assets')" class="text-xs bg-warm-100 hover:bg-accent-50 hover:text-accent-700 text-warm-600 px-3 py-1.5 rounded-lg transition font-medium border border-warm-200 hover:border-accent-200">Website Redesign -- $2000</button>
          <button type="button" onclick="applyTemplate('Copywriting Package','350','Final copy doc (Word / Google Docs link)')" class="text-xs bg-warm-100 hover:bg-accent-50 hover:text-accent-700 text-warm-600 px-3 py-1.5 rounded-lg transition font-medium border border-warm-200 hover:border-accent-200">Copywriting -- $350</button>
        </div>
      </div>

      <form id="proposalForm" class="space-y-5">
        <div>
          <label for="proposal-email" class="block text-sm font-medium text-warm-700 mb-1.5">Your email <span class="text-warm-400 font-normal">(get notified when client views + pays)</span></label>
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
        <div>
          <label for="proposal-client-email" class="block text-sm font-medium text-warm-700 mb-1.5">Client email <span class="text-warm-400 font-normal">(optional -- auto-sends proposal + enables reminders)</span></label>
          <input type="email" id="proposal-client-email" name="client_email" placeholder="client@company.com"
            class="w-full bg-warm-50 border border-warm-200 rounded-xl px-4 py-3 text-warm-900 placeholder-warm-300 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-400 transition" />
        </div>
        <label class="flex items-center gap-2.5 cursor-pointer select-none">
          <input type="checkbox" id="saveAsTemplate" name="save_as_template" class="w-4 h-4 rounded border-warm-300 accent-accent-500 cursor-pointer" />
          <span class="text-sm text-warm-600">Save as template <span class="text-warm-400 font-normal">(log in to enable)</span></span>
        </label>
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
        <p id="clientNotified" class="hidden text-xs text-green-600 flex items-center gap-1 mb-2">
          <i data-lucide="mail-check" class="w-3 h-3" aria-hidden="true"></i>
          <span id="clientNotifiedText"></span>
        </p>
        <p class="text-sm text-warm-500 mb-3">Share this link with your client:</p>
        <div class="flex gap-2">
          <input id="proposalUrl" readonly
            class="flex-1 bg-white border border-warm-200 rounded-lg px-3 py-2 text-sm text-warm-800" />
          <button onclick="copyUrl()" aria-label="Copy proposal URL" class="bg-warm-100 hover:bg-warm-200 text-warm-700 text-sm px-4 py-2 rounded-lg transition font-medium flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-accent-500/20">
            <i data-lucide="copy" class="w-3.5 h-3.5" aria-hidden="true"></i>
            Copy
          </button>
        </div>
        <button id="shareBtn" onclick="shareProposal()" class="hidden mt-3 w-full bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2.5 rounded-lg transition font-medium flex items-center justify-center gap-1.5">
          <i data-lucide="share-2" class="w-3.5 h-3.5" aria-hidden="true"></i>
          Share with client
        </button>
        <div id="clientNotifiedRow" class="hidden mt-2 w-full bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2.5 rounded-lg flex items-center justify-center gap-1.5">
          <i data-lucide="send" class="w-3.5 h-3.5" aria-hidden="true"></i>
          <span>Email sent to your client</span>
        </div>
        <button id="emailTplBtn" onclick="copyEmailTemplate()" class="mt-2 w-full bg-white border border-warm-200 hover:border-accent-300 hover:text-accent-600 text-warm-600 text-sm px-4 py-2.5 rounded-lg transition font-medium flex items-center justify-center gap-1.5">
          <i data-lucide="mail" class="w-3.5 h-3.5" aria-hidden="true"></i>
          Copy email to client
        </button>
        <a id="mailtoBtn" href="#" class="mt-2 w-full bg-white border border-warm-200 hover:border-accent-300 hover:text-accent-600 text-warm-600 text-sm px-4 py-2.5 rounded-lg transition font-medium flex items-center justify-center gap-1.5">
          <i data-lucide="send" class="w-3.5 h-3.5" aria-hidden="true"></i>
          Open in email app
        </a>
        <p id="emailCopied" class="hidden text-xs text-green-600 text-center mt-1.5">Email template copied to clipboard!</p>
        <a id="previewLink" href="#" target="_blank" class="mt-2 w-full bg-warm-50 border border-warm-200 hover:border-accent-300 hover:text-accent-600 text-warm-500 text-sm px-4 py-2.5 rounded-lg transition font-medium flex items-center justify-center gap-1.5">
          <i data-lucide="eye" class="w-3.5 h-3.5" aria-hidden="true"></i>
          Preview your client's view
        </a>
        <a id="tweetBtn" href="#" target="_blank" rel="noopener noreferrer" class="mt-2 w-full bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white text-sm px-4 py-2.5 rounded-lg transition font-medium flex items-center justify-center gap-1.5">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.264 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          Share that you ship without chasing
        </a>
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
        <p class="font-medium text-warm-800 mb-2">Does my client need an account?</p>
        <p class="text-warm-500 text-sm leading-relaxed">No. Your client clicks the link you send, sees the project summary and price, and pays with a credit card. No signup, no account, no friction. Files unlock automatically the moment payment clears.</p>
      </div>
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

  <!-- Pricing comparison -->
  <section class="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
    <h2 class="text-sm font-semibold text-warm-500 uppercase tracking-widest mb-8 text-center">Why ProposalLock</h2>
    <div class="overflow-hidden rounded-2xl border border-warm-200 shadow-sm">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-warm-50 border-b border-warm-200">
            <th class="text-left px-5 py-3 font-medium text-warm-600"></th>
            <th class="px-5 py-3 font-semibold text-accent-600 text-center">ProposalLock</th>
            <th class="px-5 py-3 font-medium text-warm-500 text-center">HoneyBook</th>
            <th class="px-5 py-3 font-medium text-warm-500 text-center">Bonsai</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-warm-100 bg-white">
          <tr>
            <td class="px-5 py-3 text-warm-700">Price</td>
            <td class="px-5 py-3 text-center font-semibold text-accent-600">Free</td>
            <td class="px-5 py-3 text-center text-warm-500">$66/mo</td>
            <td class="px-5 py-3 text-center text-warm-500">$24/mo</td>
          </tr>
          <tr class="bg-warm-50/50">
            <td class="px-5 py-3 text-warm-700">Payment-gated file delivery</td>
            <td class="px-5 py-3 text-center text-green-600">&#10003;</td>
            <td class="px-5 py-3 text-center text-warm-400">&#10007;</td>
            <td class="px-5 py-3 text-center text-warm-400">&#10007;</td>
          </tr>
          <tr>
            <td class="px-5 py-3 text-warm-700">View notification email</td>
            <td class="px-5 py-3 text-center text-green-600">&#10003;</td>
            <td class="px-5 py-3 text-center text-green-600">&#10003;</td>
            <td class="px-5 py-3 text-center text-green-600">&#10003;</td>
          </tr>
          <tr class="bg-warm-50/50">
            <td class="px-5 py-3 text-warm-700">No monthly subscription</td>
            <td class="px-5 py-3 text-center text-green-600">&#10003;</td>
            <td class="px-5 py-3 text-center text-warm-400">&#10007;</td>
            <td class="px-5 py-3 text-center text-warm-400">&#10007;</td>
          </tr>
          <tr>
            <td class="px-5 py-3 text-warm-700">Works in 30 seconds</td>
            <td class="px-5 py-3 text-center text-green-600">&#10003;</td>
            <td class="px-5 py-3 text-center text-warm-400">Setup required</td>
            <td class="px-5 py-3 text-center text-warm-400">Setup required</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- Testimonials (dynamic -- hidden until populated) -->
  <section id="testimonials-section" class="hidden max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
    <h2 class="text-sm font-semibold text-warm-500 uppercase tracking-widest mb-8 text-center">What freelancers say</h2>
    <div id="testimonials-list" class="space-y-4"></div>
  </section>

  <!-- Bottom CTA -->
  <section class="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-16 text-center">
    <h2 class="text-2xl sm:text-3xl font-bold text-warm-950 mb-4 tracking-tight">Stop sending files on faith.</h2>
    <p class="text-warm-500 mb-8 max-w-sm mx-auto">Free to create. Files unlock automatically when payment clears. No subscription, no platform fee.</p>
    <a href="#create" class="inline-flex items-center gap-2 accent-gradient hover:opacity-90 text-white font-semibold px-8 py-3.5 rounded-xl transition text-base shadow-lg shadow-accent-500/20">
      Create a Free Proposal
      <i data-lucide="arrow-right" class="w-4 h-4"></i>
    </a>
    <p class="text-xs text-warm-400 mt-4">Takes 30 seconds. Works with Google Drive, Dropbox, or file upload.</p>
  </section>

  ${footerHtml()}

  <script>
    lucide.createIcons();

    // Load social proof counter
    (async () => {
      try {
        const res = await fetch('/api/stats');
        if (!res.ok) return;
        const { proposals, paid } = await res.json();
        const el = document.getElementById('social-proof');
        if (!el) return;
        if (paid && paid >= 1) {
          el.textContent = paid + ' client' + (paid !== 1 ? 's have' : ' has') + ' paid and downloaded files via ProposalLock.';
          el.classList.remove('hidden');
        } else if (proposals && proposals >= 3) {
          el.textContent = proposals + ' proposals created so far.';
          el.classList.remove('hidden');
        }
      } catch (_) {}
    })();

    // Load testimonials dynamically
    (async () => {
      try {
        const res = await fetch('/api/testimonials/public');
        if (!res.ok) return;
        const items = await res.json();
        if (!Array.isArray(items) || items.length === 0) return;
        const section = document.getElementById('testimonials-section');
        const list = document.getElementById('testimonials-list');
        items.forEach(t => {
          const stars = t.rating ? '&#9733;'.repeat(t.rating) + '&#9734;'.repeat(5 - t.rating) : '';
          const name = t.display_name || 'A freelance professional';
          list.innerHTML += \`<div class="bg-white border border-warm-200 rounded-xl p-5 shadow-sm">
            \${stars ? \`<p class="text-accent-500 text-sm mb-2" aria-label="\${t.rating} out of 5 stars">\${stars}</p>\` : ''}
            <p class="text-warm-700 leading-relaxed mb-3">"\${t.body}"</p>
            <p class="text-xs text-warm-400 font-medium">-- \${name}</p>
          </div>\`;
        });
        section.classList.remove('hidden');
      } catch (_) {}
    })();

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

        // Save as template (fire-and-forget, never blocks proposal creation)
        const saveAsTemplate = document.getElementById('saveAsTemplate').checked;
        if (saveAsTemplate && data.email && fileMode === 'url' && data.file_url) {
          const priceCents = Math.round(parseFloat(data.price || '0') * 100);
          fetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: data.title,
              default_price_cents: priceCents,
              file_url: data.file_url,
              file_type: 'url',
            }),
          }).catch(() => {}); // Silently ignore if not authenticated
        }

        proposalUrlInput.value = json.proposal_url;
        // Auto-copy URL to clipboard (reduces 1-click friction)
        if (navigator.clipboard && json.proposal_url) {
          navigator.clipboard.writeText(json.proposal_url).catch(() => {});
        }
        // Show client-notified badge if email was auto-sent
        const clientNotified = document.getElementById('clientNotified');
        const clientEmailInput = document.getElementById('proposal-client-email');
        if (clientNotified && json.client_email_sent && clientEmailInput && clientEmailInput.value) {
          const notifiedText = document.getElementById('clientNotifiedText');
          if (notifiedText) notifiedText.textContent = 'Email sent to ' + clientEmailInput.value;
          clientNotified.classList.remove('hidden');
          lucide.createIcons();
        }
        // Wire mailto: link
        const mailtoBtn = document.getElementById('mailtoBtn');
        if (mailtoBtn) {
          const clientEmailVal = document.getElementById('proposal-client-email').value || '';
          const emailSubject = encodeURIComponent('Your files are ready: ' + (data.title || 'your project'));
          const emailBodyLines = [
            'Hi ' + (data.client_name || ''),
            '',
            'Your deliverables are complete. Click the link below to review and unlock your files:',
            '',
            json.proposal_url,
            '',
            'Pay once to unlock. Files are available immediately after payment. No account needed.',
            '',
            'Let me know if you have any questions before you pay.',
          ];
          mailtoBtn.href = 'mailto:' + encodeURIComponent(clientEmailVal) + '?subject=' + emailSubject + '&body=' + encodeURIComponent(emailBodyLines.join('\\n'));
        }
        // Wire preview link
        const previewLink = document.getElementById('previewLink');
        if (previewLink) previewLink.href = json.proposal_url;
        // Wire tweet button
        const tweetBtn = document.getElementById('tweetBtn');
        if (tweetBtn) {
          const tweetText = encodeURIComponent('Just set up payment-gated file delivery for a client proposal. Files unlock the moment they pay -- no more chasing invoices. Free at proposallock.vercel.app');
          tweetBtn.href = 'https://twitter.com/intent/tweet?text=' + tweetText;
        }
        // Store for email template
        window._proposalTitle = data.title || 'your project';
        window._clientName = data.client_name || '';
        // Show client notification status
        const clientNotifiedRow = document.getElementById('clientNotifiedRow');
        const emailTplBtn = document.getElementById('emailTplBtn');
        if (json.client_email_sent && clientNotifiedRow) {
          clientNotifiedRow.classList.remove('hidden');
          if (emailTplBtn) emailTplBtn.classList.add('hidden'); // hide manual copy if auto-sent
        }
        proposalResult.classList.remove('hidden');
        proposalResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        // Show share button on mobile devices that support Web Share API
        const shareBtn = document.getElementById('shareBtn');
        if (shareBtn && navigator.share) shareBtn.classList.remove('hidden');
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

    // Pre-fill form from URL params (e.g. from "Use template" button in dashboard)
    (function prefillFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const title = params.get('title');
      const priceCents = params.get('price_cents');
      const fileUrl = params.get('file_url');
      if (title) document.getElementById('proposal-title').value = title;
      if (priceCents) document.getElementById('proposal-price').value = (parseInt(priceCents, 10) / 100).toFixed(2);
      if (fileUrl) {
        const urlField = document.querySelector('#urlInput input');
        if (urlField) urlField.value = fileUrl;
      }
      if (title || priceCents || fileUrl) {
        // Clean URL without reloading
        const url = new URL(window.location.href);
        url.searchParams.delete('title');
        url.searchParams.delete('price_cents');
        url.searchParams.delete('file_url');
        window.history.replaceState({}, '', url.toString());
      }
    })();

    async function shareProposal() {
      const url = proposalUrlInput.value;
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Proposal ready for review', text: 'Your proposal is ready. Pay to unlock the deliverables.', url });
          return;
        } catch (e) { /* user cancelled or share failed, fall through to copy */ }
      }
      await copyUrl();
    }

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

    async function copyEmailTemplate() {
      const url = proposalUrlInput.value;
      const title = window._proposalTitle || 'your project';
      const client = window._clientName ? ('Hi ' + window._clientName + ',') : 'Hi,';
      const template = [
        'Subject: Your files are ready -- ' + title,
        '',
        client,
        '',
        'Your deliverables for ' + title + ' are complete. Click the link below to review the project summary and unlock your files:',
        '',
        url,
        '',
        'Pay once to unlock -- files are available immediately after payment clears. No account needed.',
        '',
        'Let me know if you have any questions before you pay.',
      ].join('\\n');
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(template);
        } else {
          const ta = document.createElement('textarea');
          ta.value = template;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
      } catch (_) {}
      const copied = document.getElementById('emailCopied');
      if (copied) {
        copied.classList.remove('hidden');
        setTimeout(() => copied.classList.add('hidden'), 3000);
      }
    }

    function applyTemplate(title, price, fileHint) {
      document.getElementById('proposal-title').value = title;
      document.getElementById('proposal-price').value = price;
      const urlInput = document.querySelector('#urlInput input');
      if (urlInput) urlInput.placeholder = fileHint;
      document.getElementById('proposal-title').focus();
    }
  </script>
</body>
</html>`;
}

function proposalPage(id: string, meta?: { title: string; price_cents: number }): string {
  const safeTitle = meta ? escapeHtml(meta.title) : '';
  const priceStr = meta ? `$${(meta.price_cents / 100).toFixed(0)}` : null;
  const pageTitle = meta ? `${safeTitle} | ProposalLock` : 'ProposalLock -- Proposal';
  const ogTitle = meta ? `${safeTitle} -- Unlock Files` : 'ProposalLock -- Payment-gated file delivery';
  const ogDesc = meta && priceStr
    ? `Pay ${priceStr} to unlock your deliverables. Secure payment via LemonSqueezy.`
    : 'Payment-gated file delivery for freelancers. Pay to unlock your files.';
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${pageTitle}</title>
  <meta name="description" content="${ogDesc}" />
  <meta property="og:title" content="${ogTitle}" />
  <meta property="og:description" content="${ogDesc}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${ogTitle}" />
  <meta name="twitter:description" content="${ogDesc}" />
  ${tailwindScripts}
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

      <!-- Description block (optional, shown before payment) -->
      <div id="descriptionBlock" class="hidden bg-warm-100 border border-warm-200 rounded-2xl p-5 mb-4">
        <p class="text-xs text-warm-500 uppercase tracking-wider font-medium mb-2">What's included</p>
        <p id="descriptionText" class="text-sm text-warm-700 leading-relaxed whitespace-pre-line"></p>
      </div>

      <!-- Locked state -->
      <div id="lockedState" class="hidden">
        <div class="bg-white border border-amber-200 rounded-2xl p-5 sm:p-6 mb-4 text-center shadow-sm">
          <div class="w-14 h-14 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto mb-4" aria-hidden="true">
            <i data-lucide="lock" class="w-6 h-6 text-amber-600"></i>
          </div>
          <p class="text-warm-800 font-semibold mb-1">Files locked until payment</p>
          <p class="text-warm-500 text-sm mb-4">Pay once to access all deliverables for this project.</p>
          <div id="countdownWrap" class="hidden mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p class="text-xs text-amber-600 uppercase tracking-wider font-semibold mb-1">Offer expires in</p>
            <p id="countdown" class="text-2xl font-bold text-amber-700 tabular-nums tracking-tight"></p>
          </div>
          <div id="expiredMsg" class="hidden mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 font-medium">
            This proposal has expired. Contact the freelancer to request a new one.
          </div>
          <div class="text-3xl font-bold text-warm-950 mb-5 tracking-tight" id="price"></div>
          <a id="checkoutBtn" href="#" target="_blank"
            class="flex items-center justify-center gap-2 w-full accent-gradient hover:opacity-90 text-white font-semibold py-3.5 rounded-xl transition text-center shadow-lg shadow-accent-500/20">
            <i data-lucide="credit-card" class="w-4 h-4" aria-hidden="true"></i>
            <span id="checkoutBtnText">Pay to Unlock Files</span>
          </a>
          <p class="text-xs text-warm-500 mt-4 flex items-center justify-center gap-1">
            <i data-lucide="shield-check" class="w-3 h-3" aria-hidden="true"></i>
            Secure payment &middot; No account needed &middot; Files unlock instantly
          </p>
          <div class="mt-5 border-t border-warm-100 pt-4 text-left space-y-2">
            <p class="text-xs text-warm-500 uppercase tracking-wider font-semibold mb-2">What happens after you pay</p>
            <div class="flex items-start gap-2.5 text-sm text-warm-600">
              <span class="w-5 h-5 rounded-full bg-accent-50 text-accent-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
              <span>Complete checkout -- credit or debit card, no account required</span>
            </div>
            <div class="flex items-start gap-2.5 text-sm text-warm-600">
              <span class="w-5 h-5 rounded-full bg-accent-50 text-accent-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
              <span>Files unlock automatically the moment payment clears</span>
            </div>
            <div class="flex items-start gap-2.5 text-sm text-warm-600">
              <span class="w-5 h-5 rounded-full bg-accent-50 text-accent-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</span>
              <span>Download your deliverables -- available for 30 days</span>
            </div>
          </div>
        </div>
        <p id="pollingStatus" class="text-center text-xs text-warm-500 flex items-center justify-center gap-1.5 mt-3" role="status" aria-live="polite">
          <i data-lucide="info" class="w-3 h-3" aria-hidden="true"></i>
          Files unlock automatically on this page after payment.
        </p>

        <!-- Client FAQ (only visible in locked state) -->
        <div class="mt-4 bg-warm-50 border border-warm-200 rounded-xl p-4">
          <p class="text-xs text-warm-500 uppercase tracking-wider font-semibold mb-3">Common questions</p>
          <div class="space-y-3">
            <div>
              <p class="text-sm font-medium text-warm-800">Is this payment secure?</p>
              <p class="text-xs text-warm-500 mt-0.5 leading-relaxed">Yes. Payments are processed by LemonSqueezy (PCI-compliant). ProposalLock and your freelancer never see your card details.</p>
            </div>
            <div>
              <p class="text-sm font-medium text-warm-800">Do I need to create an account?</p>
              <p class="text-xs text-warm-500 mt-0.5 leading-relaxed">No. Pay once and your files unlock immediately. No signup, no account, no friction.</p>
            </div>
            <div>
              <p class="text-sm font-medium text-warm-800">What if I have an issue with the files?</p>
              <p class="text-xs text-warm-500 mt-0.5 leading-relaxed">Contact your freelancer directly -- they own the deliverables and set up this proposal. Your payment receipt includes their contact info.</p>
            </div>
            <div>
              <p class="text-sm font-medium text-warm-800">How long do I have to download?</p>
              <p class="text-xs text-warm-500 mt-0.5 leading-relaxed">Your download link stays active for 30 days. Bookmark this page after paying so you can come back anytime.</p>
            </div>
          </div>
        </div>
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

  <div class="mt-8 mb-4 text-center">
    <a href="${process.env.BASE_URL || "https://proposallock.vercel.app"}/?ref=proposal" class="inline-flex items-center gap-2 bg-white border border-warm-200 rounded-xl px-4 py-2.5 text-xs text-warm-500 hover:border-accent-300 hover:text-accent-600 transition shadow-sm">
      <div class="w-4 h-4 accent-gradient rounded flex items-center justify-center flex-shrink-0" aria-hidden="true">
        <i data-lucide="lock" class="w-2.5 h-2.5 text-white"></i>
      </div>
      Are you a freelancer? Get paid before you deliver -- ProposalLock is free
    </a>
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

      document.title = data.title + ' -- ProposalLock';
      document.getElementById('title').textContent = data.title;
      document.getElementById('clientName').textContent = data.client_name;

      // Show description block if present
      if (data.description) {
        const descEl = document.getElementById('descriptionBlock');
        if (descEl) {
          document.getElementById('descriptionText').textContent = data.description;
          descEl.classList.remove('hidden');
        }
      }

      const price = (data.price_cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

      if (data.paid) {
        document.getElementById('unlockedState').classList.remove('hidden');
        document.getElementById('fileLink').href = data.file_url || '#';
        stopPolling();
      } else {
        document.getElementById('lockedState').classList.remove('hidden');
        document.getElementById('price').textContent = price;
        const btnText = document.getElementById('checkoutBtnText');
        if (btnText) btnText.textContent = 'Pay ' + price + ' to Unlock Files';
        const checkoutBtn = document.getElementById('checkoutBtn');
        if (data.ls_checkout_url) {
          checkoutBtn.href = data.ls_checkout_url;
          checkoutBtn.addEventListener('click', () => {
            const ps = document.getElementById('pollingStatus');
            if (ps) {
              ps.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin" aria-hidden="true"></i> Checking for payment... this page updates automatically.';
              lucide.createIcons();
              // Reset status message after 90s if no payment detected
              setTimeout(() => {
                if (ps && ps.textContent.includes('Checking')) {
                  ps.innerHTML = '<i data-lucide="info" class="w-3 h-3" aria-hidden="true"></i> Files unlock automatically on this page after payment.';
                  lucide.createIcons();
                }
              }, 90000);
            }
          }, { once: true });
        } else {
          checkoutBtn.textContent = 'Payment not configured';
          checkoutBtn.classList.add('opacity-50', 'pointer-events-none');
        }
        startPolling();

        // Countdown timer: expires 48h after CLIENT'S FIRST VIEW (not creation)
        // This prevents "already expired" proposals when freelancer sends late
        const storageKey = 'pl_fv_' + proposalId;
        let firstViewMs = parseInt(localStorage.getItem(storageKey) || '0', 10);
        if (!firstViewMs) {
          firstViewMs = Date.now();
          try { localStorage.setItem(storageKey, String(firstViewMs)); } catch(_) {}
        }
        const expiresAt = firstViewMs + 48 * 3600 * 1000;
        startCountdown(expiresAt);
      }
      lucide.createIcons();
    }

    let countdownTimer = null;
    function startCountdown(expiresAt) {
      function update() {
        const now = Date.now();
        const remaining = expiresAt - now;
        const wrap = document.getElementById('countdownWrap');
        const display = document.getElementById('countdown');
        const expired = document.getElementById('expiredMsg');
        const btn = document.getElementById('checkoutBtn');
        if (remaining <= 0) {
          clearInterval(countdownTimer);
          if (wrap) wrap.classList.add('hidden');
          if (expired) expired.classList.remove('hidden');
          // Keep checkout button active -- soft expiry is for urgency, not a hard gate
          return;
        }
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        const hh = String(h).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        const ss = String(s).padStart(2, '0');
        // Only show urgency when < 24h remaining (don't alarm client prematurely)
        if (h < 24) {
          if (wrap) wrap.classList.remove('hidden');
          if (display) display.textContent = hh + ':' + mm + ':' + ss;
        } else {
          if (wrap) wrap.classList.add('hidden');
        }
      }
      update();
      countdownTimer = setInterval(update, 1000);
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
    <div class="mt-8 p-4 bg-accent-50 border border-accent-100 rounded-xl">
      <p class="text-sm font-medium text-accent-800 mb-1">Are you a freelancer too?</p>
      <p class="text-xs text-accent-700 mb-3">Create your own payment-gated proposal links. Free to use. No subscription.</p>
      <a href="${process.env.BASE_URL || "https://proposallock.vercel.app"}/?ref=success" class="inline-flex items-center gap-1.5 text-xs font-semibold text-white accent-gradient px-4 py-2 rounded-lg transition hover:opacity-90">
        Try ProposalLock free
        <i data-lucide="arrow-right" class="w-3 h-3"></i>
      </a>
    </div>
  </div>

  <script>
    lucide.createIcons();

    let _pollTimer = null;
    let _pollAttempts = 0;
    const MAX_POLLS = 10; // 30 seconds max

    async function loadFiles() {
      try {
        const res = await fetch('/api/proposals/${id}');
        const data = await res.json();

        if (data.paid && data.file_url) {
          if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
          document.getElementById('loading').classList.add('hidden');
          document.getElementById('fileLink').href = data.file_url;
          document.getElementById('fileSection').classList.remove('hidden');
          lucide.createIcons();
        } else {
          _pollAttempts++;
          if (_pollAttempts >= MAX_POLLS) {
            if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('error').classList.remove('hidden');
          }
          // else: keep polling -- webhook may not have fired yet
        }
      } catch (e) {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error').classList.remove('hidden');
      }
    }
    loadFiles();
    _pollTimer = setInterval(loadFiles, 3000);
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
      <p>Proposal data is retained as long as your proposals are active. You may request deletion of your data by contacting us at bytewiseai.info@gmail.com. We will delete your data within 30 days of a verified request.</p>

      <h2 class="text-lg font-semibold text-warm-900 mt-8">7. Your rights</h2>
      <p>You have the right to access, correct, or delete your personal data. For EU residents, you have rights under GDPR including data portability and the right to withdraw consent. Contact bytewiseai.info@gmail.com for any data requests.</p>

      <h2 class="text-lg font-semibold text-warm-900 mt-8">8. Contact</h2>
      <p>For privacy questions: <a href="mailto:bytewiseai.info@gmail.com" class="text-accent-600 hover:text-accent-700">bytewiseai.info@gmail.com</a></p>
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
      <p>Questions about these terms: <a href="mailto:bytewiseai.info@gmail.com" class="text-accent-600 hover:text-accent-700">bytewiseai.info@gmail.com</a></p>
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

function testimonialPage(pid: string, proposalTitle: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Share your experience -- ProposalLock</title>
  ${tailwindConfig}
</head>
<body class="bg-warm-50 text-warm-900 min-h-screen antialiased">
  ${navHtml(false)}

  <main class="max-w-lg mx-auto px-4 sm:px-6 py-10">
    <div class="bg-white border border-warm-200 rounded-2xl p-8 shadow-sm">
      <div class="mb-6">
        <h1 class="text-xl font-bold text-warm-950 mb-1">How did ProposalLock work for you?</h1>
        <p class="text-warm-500 text-sm">Proposal: <strong class="text-warm-700">${proposalTitle}</strong></p>
      </div>

      <div id="form-view">
        <form id="testimonial-form" class="space-y-5">
          <div>
            <label for="body" class="block text-sm font-medium text-warm-700 mb-1.5">Your experience <span class="text-warm-400">(20-500 chars)</span></label>
            <textarea
              id="body"
              name="body"
              rows="4"
              minlength="20"
              maxlength="500"
              required
              placeholder="Saved me from chasing another invoice..."
              class="w-full border border-warm-300 rounded-xl px-4 py-3 text-sm text-warm-900 placeholder-warm-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition resize-none"
            ></textarea>
            <p class="text-xs text-warm-400 mt-1 text-right"><span id="char-count">0</span>/500</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-warm-700 mb-2">Rating <span class="text-warm-400">(optional)</span></label>
            <div class="flex gap-2" id="star-rating" role="group" aria-label="Rating">
              ${[1,2,3,4,5].map(n => `
              <button type="button" data-star="${n}" aria-label="${n} star${n>1?'s':''}"
                class="star-btn w-9 h-9 text-2xl text-warm-300 hover:text-amber-400 transition focus:outline-none focus:text-amber-400" aria-pressed="false">&#9733;</button>`).join("")}
            </div>
          </div>

          <div>
            <label for="display_name" class="block text-sm font-medium text-warm-700 mb-1.5">How should we credit you? <span class="text-warm-400">(optional)</span></label>
            <input
              type="text"
              id="display_name"
              name="display_name"
              maxlength="100"
              placeholder="A freelance designer"
              class="w-full border border-warm-300 rounded-xl px-4 py-3 text-sm text-warm-900 placeholder-warm-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition"
            />
          </div>

          <button type="submit" id="submit-btn"
            class="w-full accent-gradient hover:opacity-90 text-white font-semibold px-5 py-3 rounded-xl transition text-sm shadow-lg shadow-accent-500/20">
            Submit
          </button>
          <p id="error-msg" class="text-red-600 text-sm hidden"></p>
        </form>
      </div>

      <div id="success-view" class="hidden text-center py-6">
        <div class="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <i data-lucide="check-circle-2" class="w-7 h-7 text-green-600"></i>
        </div>
        <h2 class="text-lg font-bold text-warm-950 mb-2">Thank you!</h2>
        <p class="text-warm-500 text-sm">Your experience helps other freelancers find ProposalLock.</p>
      </div>
    </div>
  </main>

  ${footerHtml()}

  <script>
    // Char counter
    const bodyEl = document.getElementById('body');
    const charCount = document.getElementById('char-count');
    bodyEl.addEventListener('input', () => { charCount.textContent = bodyEl.value.length; });

    // Star rating
    let selectedRating = null;
    document.querySelectorAll('.star-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const star = parseInt(btn.dataset.star);
        selectedRating = star;
        document.querySelectorAll('.star-btn').forEach(b => {
          const s = parseInt(b.dataset.star);
          b.style.color = s <= star ? '#f59e0b' : '';
          b.setAttribute('aria-pressed', s === star ? 'true' : 'false');
        });
      });
    });

    // Form submit
    document.getElementById('testimonial-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      const errMsg = document.getElementById('error-msg');
      btn.disabled = true;
      btn.textContent = 'Submitting...';
      errMsg.classList.add('hidden');

      const body = bodyEl.value.trim();
      const display_name = document.getElementById('display_name').value.trim() || null;

      try {
        const res = await fetch('/api/testimonials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proposal_id: '${pid}', body, rating: selectedRating, display_name })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          document.getElementById('form-view').classList.add('hidden');
          document.getElementById('success-view').classList.remove('hidden');
          if (window.lucide) lucide.createIcons();
        } else {
          errMsg.textContent = data.error || 'Something went wrong. Please try again.';
          errMsg.classList.remove('hidden');
          btn.disabled = false;
          btn.textContent = 'Submit';
        }
      } catch {
        errMsg.textContent = 'Network error. Please try again.';
        errMsg.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Submit';
      }
    });

    lucide.createIcons();
  </script>
</body>
</html>`;
}

export default app;

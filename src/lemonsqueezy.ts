const LS_API_KEY = process.env.LEMONSQUEEZY_API_KEY || "";
const LS_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID || "";
const LS_PRODUCT_ID = process.env.LEMONSQUEEZY_PRODUCT_ID || ""; // Master ProposalLock product
const LS_BASE_URL = "https://api.lemonsqueezy.com/v1";
let cachedVariantId = "";

const headers = {
  "Accept": "application/vnd.api+json",
  "Content-Type": "application/vnd.api+json",
  "Authorization": `Bearer ${LS_API_KEY}`,
};

/**
 * Create a LemonSqueezy checkout for a proposal.
 * Uses a single "master" variant with custom data to identify the proposal.
 */
export async function createCheckoutLink(params: {
  proposalId: string;
  title: string;
  clientName: string;
  priceCents: number;
  successUrl: string;
}): Promise<{ checkoutUrl: string; variantId: string } | null> {
  if (!LS_API_KEY || LS_API_KEY.length < 20 || !LS_STORE_ID || LS_STORE_ID.length < 2 || !LS_PRODUCT_ID || LS_PRODUCT_ID.length < 2) {
    console.warn("LemonSqueezy not configured — checkout will be unavailable");
    return null;
  }

  // Look up the first variant of the product (variant ID != product ID)
  // Cache resolved variant ID to avoid redundant API calls
  let variantId = cachedVariantId || process.env.LEMONSQUEEZY_VARIANT_ID || "";
  if (!variantId) {
    try {
      const varRes = await fetch(`${LS_BASE_URL}/variants?filter[product_id]=${LS_PRODUCT_ID}`, { headers });
      const varData = await varRes.json() as any;
      variantId = varData?.data?.[0]?.id || "";
      if (variantId) {
        cachedVariantId = variantId;
        console.log(`Resolved variant ID: ${variantId} for product ${LS_PRODUCT_ID}`);
      } else {
        console.error("No variants found for product", LS_PRODUCT_ID, JSON.stringify(varData));
        return null;
      }
    } catch (e) {
      console.error("Failed to look up variant:", e);
      return null;
    }
  }

  try {
    const res = await fetch(`${LS_BASE_URL}/checkouts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_options: {
              embed: false,
              media: false,
              logo: true,
              desc: true,
              discount: false,
              skip_trial: true,
            },
            checkout_data: {
              custom: {
                proposal_id: params.proposalId,
              },
              name: params.clientName,
            },
            product_options: {
              name: `ProposalLock — ${params.title}`,
              description: `Payment to unlock files for: ${params.title}`,
              redirect_url: params.successUrl,
            },
            preview: false,
            expires_at: null,
            custom_price: params.priceCents,
          },
          relationships: {
            store: {
              data: { type: "stores", id: LS_STORE_ID },
            },
            variant: {
              data: { type: "variants", id: variantId },
            },
          },
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("LS checkout create failed:", err);
      return null;
    }

    const json = await res.json() as any;
    return {
      checkoutUrl: json.data.attributes.url,
      variantId: variantId,
    };
  } catch (e) {
    console.error("LS API error:", e);
    return null;
  }
}

/**
 * Verify a LemonSqueezy webhook signature.
 */
export async function verifyWebhookSignature(
  body: string,
  signature: string
): Promise<boolean> {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET || "";
  if (!secret) {
    console.error("LEMONSQUEEZY_WEBHOOK_SECRET not configured -- rejecting webhook");
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Timing-safe comparison to prevent signature brute-force
  if (computed.length !== signature.length) return false;
  const a = encoder.encode(computed);
  const b2 = encoder.encode(signature);
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b2[i];
  }
  return result === 0;
}

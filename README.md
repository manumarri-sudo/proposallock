# ProposalLock

**Your files unlock the moment they pay.**

A web tool for freelancers to send proposals with files that unlock only after payment clears. No subscription, no accounts — one link, one payment, one unlock.

## Stack

- Runtime: Bun
- Backend: Hono
- DB: SQLite (bun:sqlite)
- Payments: LemonSqueezy
- Hosting: Render

## Local Development

```bash
bun install
cp env.template .env   # fill in your values
bun run dev
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `DB_PATH` | SQLite database path |
| `BASE_URL` | Public URL of this app |
| `LEMONSQUEEZY_API_KEY` | LS API key (`lsq_live_...`) |
| `LEMONSQUEEZY_STORE_ID` | LS store numeric ID |
| `LEMONSQUEEZY_PRODUCT_ID` | LS variant ID for the ProposalLock product |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | LS webhook signing secret |
| `LS_CHECKOUT_URL` | Direct checkout URL for the $29 ProposalLock product |

## LemonSqueezy Setup

1. Create a product in LemonSqueezy dashboard (ProposalLock, $29 one-time)
2. Get the variant ID from the product page
3. Set up a webhook pointing to `https://your-domain.com/api/webhooks/lemonsqueezy`
   - Event: `order_created`
   - Copy the signing secret to `LEMONSQUEEZY_WEBHOOK_SECRET`

## Deploy to Render

1. Push this repo to GitHub
2. Connect to Render: `render.com` → New Web Service → Connect repo
3. Set env vars in Render dashboard
4. Deploy

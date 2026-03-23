import { serve } from "@hono/node-server";
import { app } from "./app";
import { initDb } from "./db";

const PORT = parseInt(process.env.PORT || "3000");

initDb().then(() => {
  serve({ fetch: app.fetch, port: PORT });
  console.log(`🔒 ProposalLock running on http://localhost:${PORT}`);
}).catch(console.error);

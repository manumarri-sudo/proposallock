import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import app from "./app";

// Static file serving for local dev (Vercel serves public/ automatically)
app.use("/assets/*", serveStatic({ root: "./public/assets", rewriteRequestPath: (path) => path.replace(/^\/assets/, "") }));

const port = parseInt(process.env.PORT || "3000");
console.log(`ProposalLock v1.1.0 running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });

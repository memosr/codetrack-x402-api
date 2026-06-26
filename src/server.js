import "dotenv/config";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { createFacilitatorConfig } from "@coinbase/x402";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import {
  BUILDER_CODE,
  declareBuilderCodeExtension,
} from "@x402/extensions/builder-code";

import { getTopBuilders } from "./data.js";

const PORT = process.env.PORT || 4022;
const PAY_TO_ADDRESS = process.env.PAY_TO_ADDRESS;
const CDP_API_KEY_ID = process.env.CDP_API_KEY_ID;
const CDP_API_KEY_SECRET = process.env.CDP_API_KEY_SECRET;

// Payment is verified and settled on Base mainnet (eip155:8453) through the
// Coinbase CDP production facilitator. The leaderboard data itself comes from
// the CodeTrack Supabase index (see data.js).
const PAYMENT_NETWORK = "eip155:8453";
const LEADERBOARD_PRICE = "$0.001";
const FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";

// limit query-param bounds for GET /leaderboard.
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

// Base Builder Code attribution (ERC-8021 Schema 2 "a" / app code). Advertised
// in the /leaderboard 402 PAYMENT-REQUIRED extensions so settlement calldata
// can be attributed to this service. Override via BUILDER_CODE env if needed.
const BUILDER_CODE_VALUE = process.env.BUILDER_CODE || "bc_lhfd8zad";

if (!PAY_TO_ADDRESS) {
  // Fail fast: without a payTo address the facilitator can't settle payments.
  console.warn(
    "[warn] PAY_TO_ADDRESS is not set. /leaderboard will reject payments until you set it in .env",
  );
}

if (!CDP_API_KEY_ID || !CDP_API_KEY_SECRET) {
  // The CDP mainnet facilitator requires signed requests.
  console.warn(
    "[warn] CDP_API_KEY_ID / CDP_API_KEY_SECRET are not set. The CDP facilitator will reject verify/settle calls until you set them in .env",
  );
}

const app = express();
app.use(express.json());

// --- x402 wiring --------------------------------------------------------
// The Coinbase CDP facilitator config carries the production facilitator URL
// (https://api.cdp.coinbase.com/platform/v2/x402) plus the createAuthHeaders
// callback that signs each verify/settle/supported/bazaar request with the
// CDP API key read from CDP_API_KEY_ID / CDP_API_KEY_SECRET. The
// HTTPFacilitatorClient then talks to that hosted facilitator.
const facilitator = new HTTPFacilitatorClient(
  createFacilitatorConfig(CDP_API_KEY_ID, CDP_API_KEY_SECRET),
);

// The resource server registers the EVM "exact" scheme for Base mainnet, and
// paymentMiddleware gates the matching routes below.
const resourceServer = new x402ResourceServer(facilitator).register(
  PAYMENT_NETWORK,
  new ExactEvmScheme(),
);

// Input/output shapes advertised to Bazaar crawlers so agents know how to call
// the endpoint and what they'll get back.
const LEADERBOARD_INPUT_SCHEMA = {
  type: "object",
  properties: {
    limit: {
      type: "integer",
      minimum: 1,
      maximum: MAX_LIMIT,
      default: DEFAULT_LIMIT,
      description: "How many top builders to return.",
    },
  },
};

const LEADERBOARD_OUTPUT_EXAMPLE = {
  builders: [
    { code: "bc_lhfd8zad", tx_count: 1280 },
    { code: "bc_examplexyz", tx_count: 934 },
  ],
  count: 2,
  fetchedAt: "2026-06-26T00:00:00.000Z",
};

const routes = {
  "GET /leaderboard": {
    accepts: {
      scheme: "exact",
      network: PAYMENT_NETWORK,
      price: LEADERBOARD_PRICE,
      payTo: PAY_TO_ADDRESS,
    },
    // --- Bazaar discovery metadata --------------------------------------
    // description + mimeType + serviceName + tags feed the x402 Bazaar index.
    // The presence of the `bazaar` discovery extension is what makes this
    // resource discoverable; tags act as the category/search keywords.
    description:
      "Top Base Builder Codes ranked by on-chain transaction count, sourced from the CodeTrack index of Base mainnet.",
    mimeType: "application/json",
    serviceName: "codetrack-x402-api",
    tags: ["codetrack", "builder-codes", "base", "leaderboard", "analytics"],
    // Bazaar discovery extension (preserved) + Base Builder Code attribution.
    extensions: {
      ...declareDiscoveryExtension({
        method: "GET",
        input: { schema: LEADERBOARD_INPUT_SCHEMA },
        output: { example: LEADERBOARD_OUTPUT_EXAMPLE },
      }),
      [BUILDER_CODE]: declareBuilderCodeExtension(BUILDER_CODE_VALUE),
    },
  },
};

// --- Free routes --------------------------------------------------------
// GET / serves a small dark-themed HTML landing page. The machine-readable
// service metadata lives at GET /info below.
const LANDING_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="base:app_id" content="6a3e695f7fcafdab41c7e7f8" />
<meta name="talentapp:project_verification" content="8b71219f15903fe902359d76ca6ba3308f027da1e3cbc3f7d5f8fe717fd4ced65f67e1855bbf02c9eaaa38c40b5204e7233b19eb0e2bcba925cda378dda445db" />
<title>codetrack-x402-api</title>
<style>
  :root {
    --bg: #0b0e14;
    --surface: #141925;
    --border: #232a3a;
    --text: #e6e9ef;
    --muted: #9aa3b2;
    --accent: #5b8cff;
    --code-bg: #0d1018;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main {
    max-width: 720px;
    margin: 0 auto;
    padding: 3rem 1.25rem 4rem;
  }
  h1 {
    margin: 0 0 .5rem;
    font-size: clamp(1.9rem, 1.2rem + 3vw, 2.6rem);
    letter-spacing: -0.02em;
  }
  .lead {
    color: var(--muted);
    font-size: 1.05rem;
    margin: 0 0 .75rem;
  }
  .lead a { color: var(--accent); }
  .price {
    display: inline-block;
    margin-bottom: 2rem;
    padding: .2rem .6rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: .85rem;
    color: var(--accent);
    background: var(--surface);
  }
  h2 {
    font-size: 1.1rem;
    margin: 2rem 0 .75rem;
    letter-spacing: -0.01em;
  }
  ol { padding-left: 1.2rem; margin: 0; color: var(--muted); }
  ol li { margin: .25rem 0; }
  ol code { color: var(--text); }
  pre {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1rem;
    overflow-x: auto;
    margin: .5rem 0 0;
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: .9em;
  }
  pre code { color: #b9c7ff; }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: .75rem;
    margin-top: 1rem;
  }
  .links a {
    color: var(--text);
    text-decoration: none;
    padding: .55rem .9rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    transition: border-color .15s ease, color .15s ease;
  }
  .links a:hover { border-color: var(--accent); color: var(--accent); }
  footer {
    margin-top: 3rem;
    color: var(--muted);
    font-size: .85rem;
    border-top: 1px solid var(--border);
    padding-top: 1rem;
  }
  footer code { color: var(--text); }
</style>
</head>
<body>
<main>
  <h1>codetrack-x402-api</h1>
  <p class="lead">
    A pay-per-call API serving the
    <a href="https://codetrack-phi.vercel.app">CodeTrack</a>
    Base Builder Codes leaderboard, gated with
    <a href="https://x402.org">x402</a>.
    Each call costs ${LEADERBOARD_PRICE} USDC, settled on Base mainnet (${PAYMENT_NETWORK}).
  </p>
  <span class="price">${LEADERBOARD_PRICE} USDC / call &middot; ${PAYMENT_NETWORK}</span>

  <h2>How it works</h2>
  <ol>
    <li>Request <code>GET /leaderboard</code></li>
    <li>Server replies <code>402 Payment Required</code> with payment details</li>
    <li>Pay ${LEADERBOARD_PRICE} USDC over x402</li>
    <li>Retry and receive the leaderboard JSON</li>
  </ol>

  <h2>Try it (no payment, see the 402)</h2>
  <pre><code>curl -i http://localhost:${PORT}/leaderboard</code></pre>

  <h2>Links</h2>
  <div class="links">
    <a href="https://github.com/memosr/codetrack-x402-api">API repo</a>
    <a href="https://codetrack-phi.vercel.app">CodeTrack</a>
  </div>

  <footer>
    Machine-readable service info: <code>GET /info</code>
  </footer>
</main>
</body>
</html>`;

app.get("/", (_req, res) => {
  res.type("html").send(LANDING_PAGE_HTML);
});

// JSON service description for programmatic clients.
app.get("/info", (_req, res) => {
  res.json({
    name: "codetrack-x402-api",
    description:
      "Pay-per-call API serving the CodeTrack Base Builder Codes leaderboard, gated with x402.",
    endpoints: {
      "GET /": "HTML landing page (free).",
      "GET /info": "This service description as JSON (free).",
      "GET /leaderboard": `Top Base Builder Codes by transaction count. Costs ${LEADERBOARD_PRICE} per call via x402 on Base mainnet (${PAYMENT_NETWORK}). Query param: limit (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
    },
    payment: {
      protocol: "x402",
      price: LEADERBOARD_PRICE,
      network: PAYMENT_NETWORK,
      facilitator: FACILITATOR_URL,
    },
  });
});

// --- Paywall: applies only to the routes declared above -----------------
// This middleware runs BEFORE the /leaderboard handler, so any request without
// a valid payment — including the empty requests a Bazaar crawler sends — gets
// a 402 with the payment requirements and discovery metadata, and no
// leaderboard data is fetched.
app.use(paymentMiddleware(routes, resourceServer));

// --- Paid route ---------------------------------------------------------
app.get("/leaderboard", async (req, res) => {
  // Validate the limit query param: clamp into [1, MAX_LIMIT], default if absent.
  const rawLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  try {
    const builders = await getTopBuilders(limit);
    res.json({
      builders,
      count: builders.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[/leaderboard] failed to fetch leaderboard:", error);
    res.status(502).json({
      error: "Failed to fetch CodeTrack leaderboard",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

app.listen(PORT, () => {
  console.log(`codetrack-x402-api listening on http://localhost:${PORT}`);
  console.log(`  free:  GET /`);
  console.log(`  free:  GET /info`);
  console.log(
    `  paid:  GET /leaderboard  (${LEADERBOARD_PRICE} via x402, ${PAYMENT_NETWORK})`,
  );
});

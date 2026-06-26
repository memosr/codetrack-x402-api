# codetrack-x402-api

A pay-per-call HTTP API that serves the [CodeTrack](https://codetrack-phi.vercel.app)
**Base Builder Code leaderboard**, gated with the [x402](https://x402.org) payment
protocol. Every paid request settles **$0.001 USDC on Base mainnet**
(`eip155:8453`) through the Coinbase CDP production facilitator, with settlement
calldata attributed to a [Base Builder Code](https://docs.base.org).

No API keys, no accounts, no sign-up. An agent (or a human with a wallet) calls
the endpoint, gets a `402 Payment Required`, pays a tenth of a cent over x402,
and receives the leaderboard JSON.

- **Live URL:** https://codetrack-x402-api-production.up.railway.app
- **Price:** `$0.001` USDC / call (`1000` micro-USDC, 6 decimals)
- **Network:** Base mainnet — `eip155:8453`
- **Asset:** USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Builder Code:** `bc_lhfd8zad`

---

## How it works

The service exposes three routes — two free, one paid.

| Method & path      | Price         | Description                                                       |
| ------------------ | ------------- | ---------------------------------------------------------------- |
| `GET /`            | free          | Dark-themed HTML landing page.                                   |
| `GET /info`        | free          | Machine-readable service description (JSON).                     |
| `GET /leaderboard` | `$0.001` USDC | Top Base Builder Codes by transaction count, gated with x402.    |

The paid flow is the standard x402 handshake:

1. Client requests `GET /leaderboard`.
2. Server replies **`402 Payment Required`** with a `PAYMENT-REQUIRED` header
   describing the `exact` EVM scheme, the price, the payee, and the asset.
3. Client pays `$0.001` USDC over x402 and retries with the payment payload.
4. Server verifies and settles the payment, then returns the leaderboard JSON.

Verification and settlement run on Base mainnet through the **Coinbase CDP
production facilitator** (`https://api.cdp.coinbase.com/platform/v2/x402`). Each
settlement carries a **Base Builder Code attribution** (ERC-8021 Schema 2 `a` /
app code, `bc_lhfd8zad`), advertised in the 402 response extensions so on-chain
calldata is attributed to this service. The same response also carries a
**Bazaar discovery extension** so x402 agents can find and call the endpoint
automatically.

---

## Live demo

Hit the paid endpoint with no payment to see the 402 handshake:

```bash
curl -i https://codetrack-x402-api-production.up.railway.app/leaderboard
```

```http
HTTP/2 402
content-type: application/json; charset=utf-8
payment-required: eyJ4NDAyVmVyc2lvbiI6Miwi...   # base64 payment requirements
```

The `PAYMENT-REQUIRED` header (base64-encoded JSON) advertises:

- the `exact` EVM scheme on Base mainnet (`eip155:8453`),
- `amount: 1000` (micro-USDC, i.e. `$0.001`) of USDC
  (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) to the configured `payTo`
  address,
- a **Bazaar** discovery extension with the input/output schema
  (tags: `codetrack`, `builder-codes`, `base`, `leaderboard`, `analytics`), and
- a **builder-code** extension (`a: bc_lhfd8zad`) for settlement attribution.

The free machine-readable description is always open:

```bash
curl -s https://codetrack-x402-api-production.up.railway.app/info
```

To actually pay and read the data, use an x402-capable client (for example the
[`x402-fetch`](https://www.npmjs.com/package/x402-fetch) wrapper or an x402
agent) with a funded Base wallet.

---

## Response shape

`GET /leaderboard` accepts a single query param:

- `limit` — number of builders to return (default `10`, max `50`, clamped into
  range).

On success it returns:

```json
{
  "builders": [
    { "code": "bc_lhfd8zad", "tx_count": 1280 },
    { "code": "bc_examplexyz", "tx_count": 934 }
  ],
  "count": 2,
  "fetchedAt": "2026-06-26T00:00:00.000Z"
}
```

| Field       | Type     | Description                                              |
| ----------- | -------- | ------------------------------------------------------- |
| `builders`  | array    | Ranked list of `{ code, tx_count }`, highest first.     |
| `count`     | integer  | Number of builders in `builders`.                       |
| `fetchedAt` | ISO 8601 | Server timestamp when the data was fetched.             |

The data is sourced live from the CodeTrack **Supabase** index via the
`get_top_builders` RPC — the same RPC the CodeTrack frontend uses — so the
ranking always reflects the current on-chain transaction counts CodeTrack has
indexed for Base mainnet.

---

## Related projects

- **[CodeTrack](https://github.com/memosr/codetrack)** — the indexer and frontend
  behind the data ([codetrack-phi.vercel.app](https://codetrack-phi.vercel.app)).
  This API is a paid, machine-readable surface over its leaderboard.
- **[base-gas-x402](https://github.com/memosr/base-gas-x402)** — a companion
  x402-paid API in the same family, serving Base gas data per call.

---

## Run locally

```bash
npm install
cp .env.example .env   # then fill in the values below
npm start              # or: npm run dev  (node --watch)
```

The server logs the free and paid routes on startup and listens on `PORT`
(default `4022`):

```bash
curl -i http://localhost:4022/leaderboard
```

### Environment variables

All configuration is read from `.env` (see [`.env.example`](.env.example)).

| Variable                      | Required | Default       | Description                                                              |
| ----------------------------- | -------- | ------------- | ------------------------------------------------------------------------ |
| `PAY_TO_ADDRESS`              | yes      | —             | Base mainnet address that receives the USDC payments (the x402 `payTo`). |
| `CDP_API_KEY_ID`              | yes      | —             | Coinbase CDP API key ID used to sign facilitator verify/settle requests. |
| `CDP_API_KEY_SECRET`          | yes      | —             | Coinbase CDP API key secret paired with `CDP_API_KEY_ID`.                |
| `CODETRACK_SUPABASE_URL`      | yes      | —             | CodeTrack Supabase project URL.                                          |
| `CODETRACK_SUPABASE_ANON_KEY` | yes      | —             | CodeTrack Supabase anon/publishable read key (public, read-only).        |
| `BUILDER_CODE`                | no       | `bc_lhfd8zad` | Base Builder Code (ERC-8021 Schema 2 `a`) for settlement attribution.    |
| `PORT`                        | no       | `4022`        | Port the Express server listens on.                                      |

> **Security:** `.env` is git-ignored and must never be committed. The Supabase
> keys here are the public anon/read keys CodeTrack already ships; the CDP keys
> and `PAY_TO_ADDRESS` are yours and should be kept private.

---

## Tech stack

- **Node.js** (ES modules) + **[Express](https://expressjs.com) 5**
- **[`@x402/express`](https://www.npmjs.com/package/@x402/express)**,
  **`@x402/core`**, **`@x402/evm`**, **`@x402/extensions`** — x402 paywall,
  facilitator client, EVM `exact` scheme, and Bazaar / builder-code extensions
- **[`@coinbase/x402`](https://www.npmjs.com/package/@coinbase/x402)** — Coinbase
  CDP production facilitator config (request signing)
- **[`@supabase/supabase-js`](https://www.npmjs.com/package/@supabase/supabase-js)**
  — CodeTrack data access via the `get_top_builders` RPC
- **[`viem`](https://viem.sh)** — EVM primitives used by the x402 stack
- **[`dotenv`](https://www.npmjs.com/package/dotenv)** — environment loading

Base Builder Code: **`bc_lhfd8zad`**.

---

## What is x402?

[x402](https://x402.org) is an open payment protocol built on the long-reserved
HTTP `402 Payment Required` status code. A server answers a request with `402`
plus machine-readable payment requirements; the client pays on-chain (here,
USDC on Base) and retries; the server verifies the payment and serves the
response. It makes APIs natively payable per call — ideal for autonomous agents
that need to pay for data without accounts or API keys. Learn more at
[x402.org](https://x402.org).

---

## License

[MIT](LICENSE) © 2026 memosr

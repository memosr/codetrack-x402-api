# codetrack-x402-api

Pay-per-call HTTP API that serves the [CodeTrack](https://codetrack-phi.vercel.app)
Base Builder Codes leaderboard, gated with the [x402](https://x402.org) payment
protocol. Each paid call settles **$0.001 USDC on Base mainnet** (`eip155:8453`)
through the Coinbase CDP production facilitator.

The leaderboard data comes from the CodeTrack Supabase index (the same
`get_top_builders` RPC the CodeTrack frontend uses).

## Endpoints

| Method & path     | Price        | Description                                                        |
| ----------------- | ------------ | ------------------------------------------------------------------ |
| `GET /`           | free         | Dark-themed HTML landing page.                                     |
| `GET /info`       | free         | Machine-readable service description (JSON).                       |
| `GET /leaderboard`| $0.001 USDC  | Top Base Builder Codes by transaction count, gated with x402.      |

### `GET /leaderboard`

Query params:

- `limit` — number of builders to return (default `10`, max `50`).

Response:

```json
{
  "builders": [
    { "code": "bc_lhfd8zad", "tx_count": 1280 }
  ],
  "count": 1,
  "fetchedAt": "2026-06-26T00:00:00.000Z"
}
```

The 402 `PAYMENT-REQUIRED` response advertises:

- the `exact` EVM scheme on Base mainnet (`eip155:8453`),
- a Bazaar discovery extension (tags: `codetrack`, `builder-codes`, `base`,
  `leaderboard`, `analytics`) with input/output schema, and
- a Base Builder Code extension (ERC-8021 Schema 2 `a`) for settlement
  attribution.

## Setup

```bash
npm install
cp .env.example .env   # then fill in the values
npm start
```

### Environment

See [`.env.example`](.env.example). You need:

- `PAY_TO_ADDRESS` — Base mainnet address that receives payments.
- `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET` — Coinbase CDP keys for the x402
  facilitator.
- `CODETRACK_SUPABASE_URL` / `CODETRACK_SUPABASE_ANON_KEY` — CodeTrack Supabase
  public read keys.
- `BUILDER_CODE` — Base Builder Code (default `bc_lhfd8zad`).
- `PORT` — server port (default `4022`).

`.env` is git-ignored and must never be committed.

## Try it (no payment, see the 402)

```bash
curl -i http://localhost:4022/leaderboard
```

You'll get an HTTP `402 Payment Required` with the payment details encoded in
the `PAYMENT-REQUIRED` header.

## License

MIT

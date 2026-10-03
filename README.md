# Payrail Developer Sandbox

The open-source application behind [dapp.payrail.one](https://dapp.payrail.one). It is a Workstar and TypeScript workspace for building, validating and locally simulating programmable payment intents with the Payrail contracts SDK preview.

## What is included

- Conditional escrow, revenue split, payout policy and subscription scenarios
- Editable canonical intent fields and JSON arguments
- Integer-safe local policy simulation with inspectable output
- SDK code generation, intent export and session-local history
- Read-only Payrail devnet health and finality status
- Responsive developer UI, unit tests and Playwright browser tests

## Safety boundary

The public Payrail contract runtime and ABI are not released yet. This sandbox therefore uses a local preview provider. It never asks for wallet secrets, creates a signature or presents a simulation as a finalized network operation. `networkWrite` is always `false`.

## Run locally

```bash
npm ci
npm run dev
```

The Vite development server opens on `http://localhost:5173`. The Cloudflare Worker proxies only the read-only `/api/network` endpoint in production.

## Verify

```bash
npm run format:check
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

## Repository structure

```text
apps/dapp/              Workstar browser app and edge worker
packages/contracts-sdk/ Transport-neutral contract intent SDK preview
packages/ui-kit/        Minimal shared Payrail brand primitive
tests/e2e/              End-to-end sandbox checks
```

Licensed under Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

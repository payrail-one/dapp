# Payrail Live Contract Sandbox

The open-source Workstar application behind
[dapp.payrail.one](https://dapp.payrail.one). It compiles Payrail Contract
Language v1, signs with an ephemeral in-browser Ed25519 wallet and submits real
deploy/call operations to the four-validator Payrail development network.

## What works

- editable, non-evaluating source compiler for bounded `PRC1` bytecode;
- automatically funded ephemeral devnet wallet (tab lifetime only);
- canonical signed `ContractDeploy` and `ContractCall` envelopes;
- finalized block, transaction, execution-unit and event receipts;
- canonical contract balance and state query after execution;
- integer-only amounts and the same code/argument/fuel limits as the Rust VM.

The TEST asset has no monetary value. This runtime is intentionally narrow and
not EVM-compatible. It has no filesystem, network, clock, randomness, floating
point or unbounded execution. R1 is a separate external network and is not used
by this application.

## Run locally

```bash
npm ci --ignore-scripts
npm run dev
```

The Vite application opens on `http://localhost:4184`. The production
Cloudflare Worker proxies only the required Payrail devnet routes; signed
envelopes never contain private keys.

## Verify

```bash
npm run format:check
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser tests mock HTTP to test UI states. Release acceptance additionally
deploys and calls a signed contract through `https://devnet.payrail.one`, then
queries its finalized canonical state.

## Repository structure

```text
apps/dapp/              Workstar browser app and restricted edge proxy
packages/contracts-sdk/ PRC1 builder and source compiler
packages/wallet-core/   Browser Ed25519 signing and canonical envelopes
packages/api-client/    Typed Payrail devnet API boundary
packages/ui-kit/        Payrail brand primitive
tests/e2e/              Browser interaction tests
```

Licensed under Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

# github-native-key-ceremony

A GitHub Actions deploy pipeline for a small on-chain DAO. It is built around one question: **when GitHub is your only trust root, what is the best custody model for a deploy signing key?** No external KMS, no HSM, no third-party secrets vendor — only GitHub's own primitives.

This is a working example, not a slide deck. `contracts/` holds a minimal `GovToken` and `GovDAO` governance pair. `frontend/` is a small React UI for it. `.github/workflows/contracts-deploy.yml` is the actual ceremony that deploys it to Sepolia.

## The ceremony

- **Quorum gate.** Three GitHub Environments (`reviewer-a`, `reviewer-b`, `reviewer-c`), each with exactly one required reviewer. One environment's reviewer list needs only *one* approval to unblock, and GitHub has no native M-of-N setting. The 2-of-3 threshold is therefore enforced across three separate gates instead.
- **Split custody.** Each environment also holds one Shamir share (2-of-3) of the deploy key. No environment holds enough to rebuild the key. The key exists in assembled form only in the memory of the deploy job.
- **Short-lived, rotated keys.** The deploy key is never permanent. Every successful deploy sweeps the remaining ETH of the retiring key forward. It then generates a fresh key, splits it again, and writes one new share to each reviewer environment. A leaked key stays valid only until the next deploy.
- **Independently verifiable audit trail.** `npm run ceremony:audit` gets the real reviewer-approval history for a given tag directly from GitHub's own API. It does not read a log line that the deploy job wrote about itself.
- **Emergency freeze.** One repo variable (`CEREMONY_FREEZE`) halts every future run before any reviewer is notified and before any environment is touched.

Incident response: [`docs/KEY_COMPROMISE_RUNBOOK.md`](docs/KEY_COMPROMISE_RUNBOOK.md).

## What this deliberately does not do

Shares reach the deploy job as plain job outputs, which is not a protected channel. A job can bind to only one environment. Therefore one job cannot read three environment-scoped secrets. The shares must pass between jobs instead.

Nothing here protects against someone with repo write access who rewrites the workflow itself. That is a limit of any CI-based custody model, not something specific to this one.

Both limits are why a real KMS or signer service is the right answer at scale. With a real signer service the key never enters CI memory. Nothing exists to split, and nothing exists to pass.

## Running it

Hardhat 3 requires Node.js 22.13.0 or later. CI runs Node 24.

```
cd contracts
npm ci
npm test
```

`npm test` compiles the contracts first, so a separate compile step is not necessary. Two other scripts are available: `npm run compile` builds the contracts and generates their TypeScript types, and `npm run typecheck` runs `tsc` over the scripts and tests. Run `npm run compile` before `npm run typecheck`, because the typecheck reads the generated types.

The frontend at `frontend/` is a plain Vite and React app. Run `npm run build` inside `frontend/` to produce a static bundle. That build also typechecks. `.github/workflows/pages.yml` deploys the bundle to GitHub Pages after each push to `main`.

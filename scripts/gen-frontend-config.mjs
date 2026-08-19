#!/usr/bin/env node
// Emits frontend/.env from the deployment manifest so the UI's addresses match
// the on-chain deployment. Run locally after a deploy.
//
// Usage:  node scripts/gen-frontend-config.mjs [network]      (default: sepolia)
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const network = process.argv[2] ?? "sepolia";
const manifestPath = resolve(root, `contracts/deployments/${network}.json`);

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch {
  console.error(`Cannot read ${manifestPath}. Deploy first (npm run deploy:${network}) or pass a valid network.`);
  process.exit(1);
}

const token = manifest.contracts.GovToken.address;
const dao = manifest.contracts.GovDAO.address;
const chainId = manifest.chainId;

const envPath = resolve(root, "frontend/.env");
writeFileSync(
  envPath,
  `# GENERATED from contracts/deployments/${network}.json by scripts/gen-frontend-config.mjs.\n` +
    `# Do not edit by hand; re-run the generator after a deploy. Never commit.\n` +
    `VITE_TOKEN_ADDRESS=${token}\n` +
    `VITE_DAO_ADDRESS=${dao}\n` +
    `VITE_CHAIN_ID=${chainId}\n`,
);

// pages.yml uses repo variables instead of running this script in CI.
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `token=${token}\ndao=${dao}\nchain=${chainId}\n`,
  );
}

console.log(`Wrote frontend/.env from the ${network} manifest:`);
console.log(`  VITE_TOKEN_ADDRESS=${token}`);
console.log(`  VITE_DAO_ADDRESS=${dao}`);
console.log(`  VITE_CHAIN_ID=${chainId}`);

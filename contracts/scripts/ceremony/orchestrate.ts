// Ceremony entry point for contracts-deploy.yml's `deploy` job: combine the
// reviewer shares in memory, deploy, then rotate the key and push one fresh
// share back to each reviewer environment.
import { readFileSync, appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { network } from "hardhat";
import { split, combine } from "shamir-secret-sharing";
import { encodeShare, decodeShare } from "./share-codec.js";
import { openShare } from "./transport.js";
import { getRepositoryId, setEnvironmentSecret } from "./github-secrets.js";
import type { Wallet } from "ethers";
import { sweepRemainingBalance } from "./sweep.js";

const { ethers } = await network.getOrCreate();

const THRESHOLD = 2;
const TOTAL_SHARES = 3;
const SHARE_TARGETS = [
  { environment: "reviewer-a", secret: "DEPLOY_KEY_SHARE", envVar: "SHARE_A" },
  { environment: "reviewer-b", secret: "DEPLOY_KEY_SHARE", envVar: "SHARE_B" },
  { environment: "reviewer-c", secret: "DEPLOY_KEY_SHARE", envVar: "SHARE_C" },
];


async function main() {
  // Validated up front: rotation writes the only copy of the next key, so a
  // missing token must stop the run before it deploys or moves any funds.
  const adminToken = process.env.CEREMONY_ADMIN_TOKEN;
  if (!adminToken) {
    throw new Error("CEREMONY_ADMIN_TOKEN missing: refusing to deploy a key that could not then be rotated.");
  }
  const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? "").split("/");
  if (!owner || !repo) {
    throw new Error(`GITHUB_REPOSITORY must be "owner/repo", got "${process.env.GITHUB_REPOSITORY ?? ""}".`);
  }

  const rawShares = SHARE_TARGETS.map((t) => process.env[t.envVar]).filter((v): v is string => Boolean(v));
  if (rawShares.length < THRESHOLD) {
    throw new Error(
      `ceremony misconfigured: need at least ${THRESHOLD} of ${TOTAL_SHARES} deploy-key shares, found ${rawShares.length}`,
    );
  }

  const transportKey = process.env.CEREMONY_TRANSPORT_PRIVATE_KEY;
  if (!transportKey) {
    throw new Error("CEREMONY_TRANSPORT_PRIVATE_KEY missing: cannot open the reviewer shares.");
  }
  const shares = rawShares.slice(0, THRESHOLD).map((raw) => decodeShare(openShare(raw, transportKey)));
  const currentKeyBytes = Buffer.from(await combine(shares));
  const currentPrivateKey = `0x${currentKeyBytes.toString("hex")}`;

  const deployResult = spawnSync(
    "npx",
    ["hardhat", "run", "scripts/deploy.ts", "--network", "sepolia"],
    { stdio: "inherit", env: { ...process.env, DEPLOYER_PRIVATE_KEY: currentPrivateKey } },
  );
  currentKeyBytes.fill(0);

  if (deployResult.status !== 0) {
    throw new Error(
      `deploy failed with exit code ${deployResult.status}. Deploy key was NOT rotated, current shares are still valid`,
    );
  }

  const manifest = JSON.parse(readFileSync("deployments/sepolia.json", "utf8"));

  const retiringWallet = new ethers.Wallet(currentPrivateKey, ethers.provider);
  const newWallet = ethers.Wallet.createRandom().connect(ethers.provider);
  await sweepRemainingBalance(ethers, retiringWallet, newWallet.address);

  const newKeyBytes = Buffer.from(newWallet.privateKey.slice(2), "hex");
  const newShares = await split(new Uint8Array(newKeyBytes), TOTAL_SHARES, THRESHOLD);
  newKeyBytes.fill(0);

  const repositoryId = await getRepositoryId(adminToken, owner, repo);

  for (let i = 0; i < TOTAL_SHARES; i++) {
    const target = SHARE_TARGETS[i];
    await setEnvironmentSecret({
      token: adminToken,
      repositoryId,
      environment: target.environment,
      secretName: target.secret,
      value: encodeShare(newShares[i]),
    });
  }

  const summary = [
    `### Deploy ceremony — ${manifest.network}`,
    "",
    "| | |",
    "|---|---|",
    `| Commit | \`${process.env.GITHUB_SHA ?? "unknown"}\` |`,
    `| Deployer (retired by this run) | \`${manifest.deployer}\` |`,
    `| Deployer (effective next run) | \`${newWallet.address}\` |`,
    `| GovToken | \`${manifest.contracts.GovToken.address}\` |`,
    `| GovDAO | \`${manifest.contracts.GovDAO.address}\` |`,
    "| Quorum | reviewer-a, reviewer-b, reviewer-c each released one share — see this run's environment approvals for who/when |",
    "",
  ].join("\n");
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

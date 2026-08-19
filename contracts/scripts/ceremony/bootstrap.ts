// Seeds the first deploy key, since CI can only rotate one that exists.
// Run once, locally, never in CI.
import { Wallet } from "ethers";
import { split } from "shamir-secret-sharing";
import { encodeShare } from "./share-codec.js";

const THRESHOLD = 2;
const TOTAL_SHARES = 3;
const SHARE_TARGETS = [
  { environment: "reviewer-a", secret: "DEPLOY_KEY_SHARE" },
  { environment: "reviewer-b", secret: "DEPLOY_KEY_SHARE" },
  { environment: "reviewer-c", secret: "DEPLOY_KEY_SHARE" },
];

async function main() {
  const wallet = Wallet.createRandom();
  const keyBytes = Buffer.from(wallet.privateKey.slice(2), "hex");
  const shares = await split(new Uint8Array(keyBytes), TOTAL_SHARES, THRESHOLD);
  keyBytes.fill(0);

  console.log("Deployer address (public, safe to share/fund):", wallet.address);
  console.log("\nPaste each value below into its matching environment's secret,");
  console.log("then clear this terminal's scrollback. Nothing here should be committed or logged.\n");
  shares.forEach((share, i) => {
    const target = SHARE_TARGETS[i];
    console.log(`${target.environment} -> ${target.secret} = ${encodeShare(share)}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

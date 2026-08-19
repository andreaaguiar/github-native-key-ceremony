import hre, { network } from "hardhat";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";
import type { Signer } from "ethers";

// Hardhat 3 exposes no global connection; ethers and the network name come from
// an explicit one. Created at module scope so the constants below can use it.
const { ethers, networkName } = await network.getOrCreate();
import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

const QUORUM = ethers.parseEther("100000"); // 100,000 GOV
const THRESHOLD = ethers.parseEther("10000"); // 10,000 GOV

// On live networks the key comes from the ceremony;
// locally we fall back to Hardhat's funded account.
async function getDeployer(): Promise<Signer> {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (pk && pk.length > 0) {
    return new ethers.Wallet(pk, ethers.provider);
  }
  const [defaultSigner] = await ethers.getSigners();
  if (!defaultSigner) {
    throw new Error("No deployer available: set DEPLOYER_PRIVATE_KEY.");
  }
  return defaultSigner;
}

function commitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

async function main() {
  const deployer = await getDeployer();
  const deployerAddress = await deployer.getAddress();
  console.log("Network :", networkName);
  console.log("Deployer:", deployerAddress);

  // The deployer is only the temporary owner because the DAO needs the token
  // address first.
  const GovToken = await ethers.getContractFactory("GovToken", deployer);
  const token = await GovToken.deploy(deployerAddress);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("GovToken:", tokenAddress);

  // No initial mint: all supply comes from passed proposals, so the deploy key
  // never holds voting power.

  const GovDAO = await ethers.getContractFactory("GovDAO", deployer);
  const dao = await GovDAO.deploy(tokenAddress, QUORUM, THRESHOLD);
  await dao.waitForDeployment();
  const daoAddress = await dao.getAddress();
  console.log("GovDAO :", daoAddress);

  // The ownership transfer below is irreversible, so prove the DAO is live and
  // correctly wired first. Aborting here is still recoverable.
  if ((await ethers.provider.getCode(daoAddress)) === "0x") {
    throw new Error(`Aborting before handoff: no contract code at DAO address ${daoAddress}`);
  }
  const wiredToken = await dao.token();
  if (wiredToken.toLowerCase() !== tokenAddress.toLowerCase()) {
    throw new Error(`Aborting before handoff: DAO wired to ${wiredToken}, expected token ${tokenAddress}`);
  }
  if ((await dao.quorumVotes()) !== QUORUM || (await dao.proposalThreshold()) !== THRESHOLD) {
    throw new Error("Aborting before handoff: DAO governance parameters do not match the intended values");
  }
  console.log("Pre-handoff OK: DAO is live, wired to the token, params set.");

  await (await token.transferOwnership(daoAddress)).wait();

  // Confirm the transfer landed: a silent failure would leave the deploy key in
  // control of minting.
  const owner = await token.owner();
  if (owner.toLowerCase() !== daoAddress.toLowerCase()) {
    throw new Error(`Handoff failed: GovToken.owner() is ${owner}, expected DAO ${daoAddress}`);
  }
  const supply = await token.totalSupply();
  if (supply !== 0n) {
    throw new Error(`Unexpected initial supply ${supply}, expected 0`);
  }
  console.log("Verified: owner is DAO, supply 0.");

  // Best-effort: a flaky explorer should not undo a successful deploy.
  const isLive = networkName !== "hardhat" && networkName !== "localhost";
  if (isLive && process.env.ETHERSCAN_API_KEY) {
    // The explorer rejects verification until it has indexed the bytecode.
    const CONFIRMATIONS = 5;
    console.log(`Waiting for ${CONFIRMATIONS} confirmations before verifying...`);
    await token.deploymentTransaction()?.wait(CONFIRMATIONS);
    await dao.deploymentTransaction()?.wait(CONFIRMATIONS);

    for (const [name, address, args] of [
      ["GovToken", tokenAddress, [deployerAddress]],
      ["GovDAO", daoAddress, [tokenAddress, QUORUM, THRESHOLD]],
    ] as const) {
      try {
        await verifyContract({ address, constructorArgs: [...args], provider: "etherscan" }, hre);
        console.log(`Verified ${name} on the block explorer.`);
      } catch (err) {
        console.warn(`Explorer verification of ${name} failed (continuing):`, err);
      }
    }
  }

  // Deployment manifest, uploaded as a CI artifact for provenance.
  const manifest = {
    network: networkName,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployerAddress,
    commit: commitSha(),
    contracts: {
      GovToken: { address: tokenAddress, constructorArgs: [deployerAddress] },
      GovDAO: {
        address: daoAddress,
        constructorArgs: [tokenAddress, QUORUM.toString(), THRESHOLD.toString()],
      },
    },
  };
  mkdirSync("deployments", { recursive: true });
  const file = `deployments/${networkName}.json`;
  writeFileSync(file, JSON.stringify(manifest, null, 2));
  console.log("Wrote", file);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const { ethers, networkName } = await network.getOrCreate();

// On-chain monitor: backfills a recent window of events, then watches live for
// ownership takeover, unexpected mints, proposal spam, governance capture, and
// executions. Run with: npm run monitor:sepolia

type Severity = "INFO" | "WARN" | "CRITICAL";

const LOOKBACK_BLOCKS = 5000; // historical backfill window
const SPAM_THRESHOLD = 3;     // proposals from one proposer before flagging

function log(sev: Severity, rule: string, detail: string) {
  console.log(`${new Date().toISOString()} | ${sev.padEnd(8)} | ${rule.padEnd(18)} | ${detail}`);
}

function loadAddresses() {
  const path = resolve(import.meta.dirname, `../deployments/${networkName}.json`);
  const m = JSON.parse(readFileSync(path, "utf8"));
  return { dao: m.contracts.GovDAO.address as string, token: m.contracts.GovToken.address as string };
}

async function main() {
  const { dao: daoAddr, token: tokenAddr } = loadAddresses();
  const dao = await ethers.getContractAt("GovDAO", daoAddr);
  const token = await ethers.getContractAt("GovToken", tokenAddr);

  const quorum: bigint = await dao.quorumVotes();
  const threshold: bigint = await dao.proposalThreshold();
  const owner: string = await token.owner();

  log("INFO", "startup", `DAO ${daoAddr} token ${tokenAddr} on ${networkName}`);
  log("INFO", "params", `quorum=${ethers.formatEther(quorum)} threshold=${ethers.formatEther(threshold)} tokenOwner=${owner}`);

  // If the token owner is not the DAO, mint control has left governance.
  if (owner.toLowerCase() !== daoAddr.toLowerCase()) {
    log("CRITICAL", "ownership", `GovToken owner is NOT the DAO (${owner}), mint control is off-DAO`);
  }

  const proposalsByProposer = new Map<string, number>();

  function onProposalCreated(id: bigint, proposer: string) {
    const n = (proposalsByProposer.get(proposer) ?? 0) + 1;
    proposalsByProposer.set(proposer, n);
    log("INFO", "proposal-created", `#${id} by ${proposer}`);
    if (n >= SPAM_THRESHOLD) {
      log("WARN", "proposal-spam", `${proposer} created ${n} proposals (possible spam)`);
    }
  }

  function onVoteCast(id: bigint, voter: string, support: boolean, weight: bigint) {
    log("INFO", "vote-cast", `#${id} ${voter} ${support ? "FOR" : "AGAINST"} weight=${ethers.formatEther(weight)}`);
    // One voter meeting quorum alone can pass proposals unilaterally.
    if (weight >= quorum) {
      log("CRITICAL", "governance-capture", `${voter} cast ${ethers.formatEther(weight)} on #${id}, alone meets quorum`);
    }
  }

  function onExecuted(id: bigint) {
    log("WARN", "proposal-executed", `#${id} executed, its target call ran`);
  }

  function onMint(to: string, value: bigint) {
    log("WARN", "mint", `${ethers.formatEther(value)} GOV minted to ${to}`);
  }

  function onOwnership(prev: string, next: string) {
    const sev: Severity = next.toLowerCase() === daoAddr.toLowerCase() ? "INFO" : "CRITICAL";
    log(sev, "ownership-change", `GovToken owner ${prev} -> ${next}`);
  }

  // Backfill, so the monitor is useful immediately.
  const latest = await ethers.provider.getBlockNumber();
  const from = Math.max(0, latest - LOOKBACK_BLOCKS);
  log("INFO", "backfill", `scanning blocks ${from}..${latest}`);
  for (const e of await dao.queryFilter(dao.filters.ProposalCreated(), from, latest)) onProposalCreated(e.args.id, e.args.proposer);
  for (const e of await dao.queryFilter(dao.filters.VoteCast(), from, latest)) onVoteCast(e.args.proposalId, e.args.voter, e.args.support, e.args.weight);
  for (const e of await dao.queryFilter(dao.filters.ProposalExecuted(), from, latest)) onExecuted(e.args.id);
  for (const e of await token.queryFilter(token.filters.Transfer(ethers.ZeroAddress), from, latest)) onMint(e.args.to, e.args.value);
  for (const e of await token.queryFilter(token.filters.OwnershipTransferred(), from, latest)) onOwnership(e.args.previousOwner, e.args.newOwner);

  // Live subscription.
  log("INFO", "watching", "subscribed to live events (Ctrl+C to stop)");
  dao.on(dao.filters.ProposalCreated(), (id, proposer) => onProposalCreated(id, proposer));
  dao.on(dao.filters.VoteCast(), (proposalId, voter, support, weight) => onVoteCast(proposalId, voter, support, weight));
  dao.on(dao.filters.ProposalExecuted(), (id) => onExecuted(id));
  token.on(token.filters.Transfer(ethers.ZeroAddress), (_from, to, value) => onMint(to, value));
  token.on(token.filters.OwnershipTransferred(), (prev, next) => onOwnership(prev, next));

  await new Promise(() => {}); // keep the process alive for live events
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

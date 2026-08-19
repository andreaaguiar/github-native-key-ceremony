import { expect } from "chai";
import { network } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";
import type { GovToken, GovDAO } from "../types/ethers-contracts/index.js";

// Hardhat 3 has no global connection: ethers and the network helpers come from an
// explicit connection, created once for the whole suite.
const { ethers, networkHelpers } = await network.create();
const { time } = networkHelpers;

const DAY = 86400;

describe("GovDAO", () => {
  let token: GovToken;
  let dao: GovDAO;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let carol: HardhatEthersSigner;

  const QUORUM    = ethers.parseEther("100000");
  const THRESHOLD = ethers.parseEther("10000");

  beforeEach(async () => {
    [owner, alice, bob, carol] = await ethers.getSigners();

    const GovToken = await ethers.getContractFactory("GovToken");
    token = await GovToken.deploy(owner.address);

    const GovDAO = await ethers.getContractFactory("GovDAO");
    dao = await GovDAO.deploy(await token.getAddress(), QUORUM, THRESHOLD);

    // Distribute tokens and delegate votes
    // carol holds fewer than THRESHOLD (10,000), so she cannot create proposals
    await token.mint(alice.address, ethers.parseEther("500000"));
    await token.mint(bob.address,   ethers.parseEther("200000"));
    await token.mint(carol.address, ethers.parseEther("5000"));
    await token.connect(alice).delegate(alice.address);
    await token.connect(bob).delegate(bob.address);
    await token.connect(carol).delegate(carol.address);

    // Mine a block so getPastVotes is available
    await ethers.provider.send("evm_mine", []);
  });

  // ---------------------------------------------------------------------------
  // Proposal creation
  // ---------------------------------------------------------------------------

  describe("propose()", () => {
    it("creates a proposal when threshold is met", async () => {
      const tx = await dao.connect(alice).propose("Test proposal", ethers.ZeroAddress, "0x", 0);
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);

      const count = await dao.proposalCount();
      expect(count).to.equal(1n);
    });

    it("reverts when caller has insufficient voting power", async () => {
      // carol holds 5,000 GOV (< 10,000 threshold), so she cannot propose.
      await expect(
        dao.connect(carol).propose("Spam", ethers.ZeroAddress, "0x", 0)
      ).to.be.revertedWith("GovDAO: insufficient voting power to propose");
    });

    it("reverts on empty description", async () => {
      await expect(
        dao.connect(alice).propose("", ethers.ZeroAddress, "0x", 0)
      ).to.be.revertedWith("GovDAO: empty description");
    });
  });

  // ---------------------------------------------------------------------------
  // Voting
  // ---------------------------------------------------------------------------

  describe("castVote()", () => {
    let proposalId: bigint;

    beforeEach(async () => {
      const tx = await dao.connect(alice).propose("Vote test", ethers.ZeroAddress, "0x", 0);
      const receipt = await tx.wait();
      const event = receipt?.logs.find((l: any) => l.fragment?.name === "ProposalCreated");
      proposalId = (event as any).args[0];
    });

    it("records a FOR vote with correct weight", async () => {
      await dao.connect(alice).castVote(proposalId, true);
      const [,, forVotes] = await dao.getProposal(proposalId);
      expect(forVotes).to.equal(ethers.parseEther("500000"));
    });

    it("records an AGAINST vote", async () => {
      await dao.connect(alice).castVote(proposalId, false);
      const [,,, againstVotes] = await dao.getProposal(proposalId);
      expect(againstVotes).to.equal(ethers.parseEther("500000"));
    });

    it("reverts on double vote", async () => {
      await dao.connect(alice).castVote(proposalId, true);
      await expect(dao.connect(alice).castVote(proposalId, true))
        .to.be.revertedWith("GovDAO: already voted");
    });

    it("rejects votes from accounts with no power at snapshot", async () => {
      const [,,,, noTokens] = await ethers.getSigners();
      await expect(dao.connect(noTokens).castVote(proposalId, true))
        .to.be.revertedWith("GovDAO: no voting power at snapshot");
    });
  });

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  describe("execute()", () => {
    let proposalId: bigint;

    beforeEach(async () => {
      const tx = await dao.connect(alice).propose("Execution test", ethers.ZeroAddress, "0x", 0);
      const receipt = await tx.wait();
      const event = receipt?.logs.find((l: any) => l.fragment?.name === "ProposalCreated");
      proposalId = (event as any).args[0];
      await dao.connect(alice).castVote(proposalId, true);
    });

    it("cannot execute before voting period ends", async () => {
      await expect(dao.execute(proposalId)).to.be.revertedWith("GovDAO: proposal not succeeded");
    });

    it("cannot execute before timelock elapses", async () => {
      await time.increase(3 * DAY + 1);
      await expect(dao.execute(proposalId)).to.be.revertedWith("GovDAO: timelock not elapsed");
    });

    it("executes after voting + timelock", async () => {
      await time.increase(3 * DAY + 2 * DAY + 1);
      const tx = await dao.execute(proposalId);
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);
      const [,,,,,,s] = await dao.getProposal(proposalId);
      expect(s).to.equal(3n); // Executed
    });

    it("cannot execute twice", async () => {
      await time.increase(3 * DAY + 2 * DAY + 1);
      await dao.execute(proposalId);
      await expect(dao.execute(proposalId)).to.be.revertedWith("GovDAO: proposal not succeeded");
    });
  });

  // ---------------------------------------------------------------------------
  // State machine
  // ---------------------------------------------------------------------------

  describe("state()", () => {
    it("returns Defeated when quorum not reached", async () => {
      const tx = await dao.connect(alice).propose("Low quorum", ethers.ZeroAddress, "0x", 0);
      const receipt = await tx.wait();
      const event = receipt?.logs.find((l: any) => l.fragment?.name === "ProposalCreated");
      const id = (event as any).args[0];

      // carol votes FOR with 5,000 GOV and no one votes AGAINST, so the proposal
      // wins the majority (FOR > AGAINST) but falls short of the 100,000 quorum
      // it must be Defeated because of quorum specifically
      await dao.connect(carol).castVote(id, true);

      await time.increase(3 * DAY + 1);
      const [, , forVotes, againstVotes, , , s] = await dao.getProposal(id);
      expect(forVotes).to.equal(ethers.parseEther("5000"));
      expect(againstVotes).to.equal(0n);
      expect(forVotes).to.be.greaterThan(againstVotes); // majority is met
      expect(forVotes).to.be.lessThan(QUORUM);          // but quorum is not
      expect(s).to.equal(1n);                           // => Defeated
    });

    it("returns Cancelled after cancel()", async () => {
      const tx = await dao.connect(alice).propose("Cancel me", ethers.ZeroAddress, "0x", 0);
      const receipt = await tx.wait();
      const event = receipt?.logs.find((l: any) => l.fragment?.name === "ProposalCreated");
      const id = (event as any).args[0];
      await dao.connect(alice).cancel(id);
      const [,,,,,,s] = await dao.getProposal(id);
      expect(s).to.equal(4n); // Cancelled
    });
  });
});

export const GOV_TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function delegates(address) view returns (address)",
  "function delegate(address delegatee)",
  "function getVotes(address) view returns (uint256)",
  "function getPastVotes(address, uint256) view returns (uint256)",
] as const;

export const DAO_ABI = [
  "function propose(string description, address target, bytes callData, uint256 value) returns (uint256)",
  "function castVote(uint256 proposalId, bool support)",
  "function execute(uint256 proposalId)",
  "function cancel(uint256 proposalId)",
  "function getProposal(uint256 proposalId) view returns (address proposer, string description, uint256 forVotes, uint256 againstVotes, uint256 voteEnd, uint256 executeAfter, uint8 currentState)",
  "function hasVoted(uint256 proposalId, address voter) view returns (bool)",
  "function proposalCount() view returns (uint256)",
  "function quorumVotes() view returns (uint256)",
  "function proposalThreshold() view returns (uint256)",
  "event ProposalCreated(uint256 indexed id, address indexed proposer, string description, uint256 snapshotBlock, uint256 voteEnd)",
  "event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight)",
  "event ProposalExecuted(uint256 indexed id)",
] as const;

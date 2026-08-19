// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title GovDAO
/// @notice Token-gated DAO with proposal creation, voting, and execution.
///
/// Security notes for auditors:
///   - Voting power is snapshotted at proposal creation block to prevent flash loan attacks.
///   - Proposals can only be executed after a timelock delay post-quorum.
///   - Execution is guarded against reentrancy.
///   - Proposal spam is limited by a minimum token threshold.
contract GovDAO is ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    enum ProposalState { Active, Defeated, Succeeded, Executed, Cancelled }

    struct Proposal {
        uint256 id;
        address proposer;
        string description;
        address target;
        bytes callData;
        uint256 value;
        uint256 snapshotBlock;
        uint256 voteEnd;
        uint256 executeAfter;
        uint256 forVotes;
        uint256 againstVotes;
        bool executed;
        bool cancelled;
        mapping(address => bool) hasVoted;
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    ERC20Votes public immutable token;

    uint256 public votingPeriod   = 3 days;
    uint256 public timelockDelay  = 2 days;
    uint256 public quorumVotes;                     // set at construction
    uint256 public proposalThreshold;               // min tokens to propose

    uint256 private _proposalCount;
    mapping(uint256 => Proposal) private _proposals;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ProposalCreated(
        uint256 indexed id,
        address indexed proposer,
        string description,
        uint256 snapshotBlock,
        uint256 voteEnd
    );
    event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event ProposalExecuted(uint256 indexed id);
    event ProposalCancelled(uint256 indexed id);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address _token,
        uint256 _quorumVotes,
        uint256 _proposalThreshold
    ) {
        require(_token != address(0), "GovDAO: zero token address");
        require(_quorumVotes > 0, "GovDAO: zero quorum");
        require(_proposalThreshold > 0, "GovDAO: zero proposal threshold");
        token             = ERC20Votes(_token);
        quorumVotes       = _quorumVotes;
        proposalThreshold = _proposalThreshold;
    }

    // -------------------------------------------------------------------------
    // Proposal lifecycle
    // -------------------------------------------------------------------------

    /// @notice Create a new proposal.
    /// @param description  Human-readable description (stored on-chain for simplicity).
    /// @param target       Contract to call upon execution (address(0) for signalling proposals).
    /// @param callData     Encoded function call for execution.
    /// @param value        ETH value to forward on execution.
    function propose(
        string calldata description,
        address target,
        bytes  calldata callData,
        uint256 value
    ) external returns (uint256 proposalId) {
        uint256 votes = token.getPastVotes(msg.sender, block.number - 1);
        require(votes >= proposalThreshold, "GovDAO: insufficient voting power to propose");
        require(bytes(description).length > 0, "GovDAO: empty description");

        proposalId = ++_proposalCount;
        Proposal storage p = _proposals[proposalId];
        p.id            = proposalId;
        p.proposer      = msg.sender;
        p.description   = description;
        p.target        = target;
        p.callData      = callData;
        p.value         = value;
        p.snapshotBlock = block.number - 1;
        p.voteEnd       = block.timestamp + votingPeriod;
        p.executeAfter  = p.voteEnd + timelockDelay;

        emit ProposalCreated(proposalId, msg.sender, description, p.snapshotBlock, p.voteEnd);
    }

    /// @notice Cast a vote on an active proposal.
    function castVote(uint256 proposalId, bool support) external {
        Proposal storage p = _proposals[proposalId];
        require(state(proposalId) == ProposalState.Active, "GovDAO: proposal not active");
        require(!p.hasVoted[msg.sender], "GovDAO: already voted");

        uint256 weight = token.getPastVotes(msg.sender, p.snapshotBlock);
        require(weight > 0, "GovDAO: no voting power at snapshot");

        p.hasVoted[msg.sender] = true;
        if (support) {
            p.forVotes += weight;
        } else {
            p.againstVotes += weight;
        }

        emit VoteCast(proposalId, msg.sender, support, weight);
    }

    /// @notice Execute a succeeded proposal after the timelock.
    function execute(uint256 proposalId) external nonReentrant {
        require(state(proposalId) == ProposalState.Succeeded, "GovDAO: proposal not succeeded");
        Proposal storage p = _proposals[proposalId];
        require(block.timestamp >= p.executeAfter, "GovDAO: timelock not elapsed");

        p.executed = true;
        emit ProposalExecuted(proposalId);

        if (p.target != address(0)) {
            (bool ok, bytes memory ret) = p.target.call{value: p.value}(p.callData);
            require(ok, string(abi.encodePacked("GovDAO: execution failed: ", ret)));
        }
    }

    /// @notice Cancel a proposal. Only the proposer can cancel while it is still active.
    function cancel(uint256 proposalId) external {
        Proposal storage p = _proposals[proposalId];
        require(p.proposer == msg.sender, "GovDAO: not proposer");
        require(state(proposalId) == ProposalState.Active, "GovDAO: cannot cancel");
        p.cancelled = true;
        emit ProposalCancelled(proposalId);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function state(uint256 proposalId) public view returns (ProposalState) {
        Proposal storage p = _proposals[proposalId];
        require(p.id != 0, "GovDAO: unknown proposal");
        if (p.cancelled) return ProposalState.Cancelled;
        if (p.executed)  return ProposalState.Executed;
        if (block.timestamp <= p.voteEnd) return ProposalState.Active;
        if (p.forVotes < quorumVotes || p.forVotes <= p.againstVotes) return ProposalState.Defeated;
        return ProposalState.Succeeded;
    }

    function getProposal(uint256 proposalId) external view returns (
        address proposer,
        string memory description,
        uint256 forVotes,
        uint256 againstVotes,
        uint256 voteEnd,
        uint256 executeAfter,
        ProposalState currentState
    ) {
        Proposal storage p = _proposals[proposalId];
        require(p.id != 0, "GovDAO: unknown proposal");
        return (
            p.proposer,
            p.description,
            p.forVotes,
            p.againstVotes,
            p.voteEnd,
            p.executeAfter,
            state(proposalId)
        );
    }

    function hasVoted(uint256 proposalId, address voter) external view returns (bool) {
        return _proposals[proposalId].hasVoted[voter];
    }

    function proposalCount() external view returns (uint256) {
        return _proposalCount;
    }

    receive() external payable {}
}

import { Proposal } from "../hooks/useDAO";

interface Props {
  proposal: Proposal;
  onVote: (id: number, support: boolean) => void;
  onExecute: (id: number) => void;
  // True while a tx is in flight or the wallet is on the wrong network: in
  // either case the action must not be fired.
  disabled: boolean;
}

const STATE_COLORS: Record<string, string> = {
  Active:    "#2563eb",
  Defeated:  "#dc2626",
  Succeeded: "#16a34a",
  Executed:  "#6b7280",
  Cancelled: "#9ca3af",
};

export function ProposalCard({ proposal, onVote, onExecute, disabled }: Props) {
  const forPct = () => {
    const total = parseFloat(proposal.forVotes) + parseFloat(proposal.againstVotes);
    return total === 0 ? 0 : Math.round((parseFloat(proposal.forVotes) / total) * 100);
  };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>#{proposal.id} — {proposal.description}</span>
        <span style={{
          fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
          background: STATE_COLORS[proposal.state] + "22",
          color: STATE_COLORS[proposal.state],
        }}>
          {proposal.state}
        </span>
      </div>

      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
        Proposer: {proposal.proposer.slice(0, 8)}…{proposal.proposer.slice(-6)}
      </div>

      {/* Vote bar */}
      <div style={{ background: "#fee2e2", borderRadius: 4, height: 8, marginBottom: 4 }}>
        <div style={{ background: "#16a34a", borderRadius: 4, height: 8, width: `${forPct()}%` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
        <span>✅ {Number(proposal.forVotes).toLocaleString(undefined, { maximumFractionDigits: 0 })} FOR</span>
        <span>❌ {Number(proposal.againstVotes).toLocaleString(undefined, { maximumFractionDigits: 0 })} AGAINST</span>
      </div>

      {/* Actions */}
      {proposal.state === "Active" && !proposal.hasVoted && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            disabled={disabled}
            onClick={() => onVote(proposal.id, true)}
            style={{ flex: 1, padding: "6px 0", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
          >
            Vote FOR
          </button>
          <button
            disabled={disabled}
            onClick={() => onVote(proposal.id, false)}
            style={{ flex: 1, padding: "6px 0", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
          >
            Vote AGAINST
          </button>
        </div>
      )}
      {proposal.state === "Active" && proposal.hasVoted && (
        <div style={{ fontSize: 12, color: "#6b7280" }}>You have voted on this proposal.</div>
      )}
      {proposal.state === "Succeeded" && new Date() >= proposal.executeAfter && (
        <button
          disabled={disabled}
          onClick={() => onExecute(proposal.id)}
          style={{ width: "100%", padding: "6px 0", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
        >
          Execute
        </button>
      )}
      {proposal.state === "Succeeded" && new Date() < proposal.executeAfter && (
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Executable after {proposal.executeAfter.toLocaleString()}
        </div>
      )}
    </div>
  );
}

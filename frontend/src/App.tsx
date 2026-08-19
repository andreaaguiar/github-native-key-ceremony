import { useState } from "react";
import { useWallet } from "./hooks/useWallet";
import { useDAO } from "./hooks/useDAO";
import { ProposalCard } from "./components/ProposalCard";
import { DAO_ADDRESS, TOKEN_ADDRESS } from "./config";

export default function App() {
  const { signer, address, connect, error: walletError, isWrongNetwork, isCorrectNetwork } = useWallet();
  const {
    proposals, tokenBalance, votingPower,
    loading, txPending, error: daoError,
    delegate, createProposal, castVote, execute,
  } = useDAO(signer, address, isCorrectNetwork);

  const [newDesc, setNewDesc] = useState("");

  const actionsDisabled = txPending || !isCorrectNetwork;

  const handlePropose = async () => {
    if (!newDesc.trim() || actionsDisabled) return;
    await createProposal(newDesc.trim());
    setNewDesc("");
  };

  return (
    <div style={{ maxWidth: 680, margin: "40px auto", fontFamily: "system-ui, sans-serif", padding: "0 16px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>🏛️ GovDAO</h1>
        {!address ? (
          <button
            onClick={connect}
            style={{ padding: "8px 16px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}
          >
            Connect Wallet
          </button>
        ) : (
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
        )}
      </div>

      {/* Errors */}
      {(walletError || daoError) && (
        <div style={{ background: "#fee2e2", color: "#dc2626", padding: 10, borderRadius: 6, marginBottom: 16, fontSize: 13, overflowWrap: "anywhere" }}>
          {walletError ?? daoError}
        </div>
      )}

      {isWrongNetwork && (
        <div style={{ background: "#fef3c7", color: "#b45309", padding: 10, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          ⚠️ Wrong network — please switch to Sepolia.
        </div>
      )}

      {/* Wallet summary */}
      {address && (
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <div style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>GOV Balance</div>
            <div style={{ fontWeight: 600 }}>{Number(tokenBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          </div>
          <div style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Voting Power</div>
            <div style={{ fontWeight: 600 }}>{Number(votingPower).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              onClick={delegate}
              disabled={actionsDisabled}
              style={{ padding: "8px 12px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 8, cursor: "pointer", fontSize: 13 }}
            >
              Self-delegate
            </button>
          </div>
        </div>
      )}

      {/* New proposal */}
      {address && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>New Proposal</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Describe your proposal…"
              style={{ flex: 1, padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }}
            />
            <button
              onClick={handlePropose}
              disabled={actionsDisabled || !newDesc.trim()}
              style={{ padding: "8px 16px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}
            >
              {txPending ? "…" : "Submit"}
            </button>
          </div>
        </div>
      )}

      {/* Proposals list */}
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
        Proposals {loading && <span style={{ fontSize: 12, color: "#9ca3af" }}>Loading…</span>}
      </h2>
      {proposals.length === 0 && !loading && (
        <div style={{ color: "#9ca3af", fontSize: 14 }}>No proposals yet.</div>
      )}
      {proposals.map(p => (
        <ProposalCard
          key={p.id}
          proposal={p}
          onVote={castVote}
          onExecute={execute}
          disabled={actionsDisabled}
        />
      ))}

      <div style={{ marginTop: 40, paddingTop: 16, borderTop: "1px solid #e5e7eb", fontSize: 12, color: "#6b7280" }}>
        <div style={{ marginBottom: 6 }}>Verify you are on the official app: these are the contracts it interacts with.</div>
        <div>
          DAO:{" "}
          <a href={`https://sepolia.etherscan.io/address/${DAO_ADDRESS}`} target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8" }}>
            {DAO_ADDRESS}
          </a>
        </div>
        <div>
          Token (GOV):{" "}
          <a href={`https://sepolia.etherscan.io/address/${TOKEN_ADDRESS}`} target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8" }}>
            {TOKEN_ADDRESS}
          </a>
        </div>
      </div>
    </div>
  );
}

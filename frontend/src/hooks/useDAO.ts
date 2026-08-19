import { useState, useEffect, useCallback } from "react";
import { Contract, JsonRpcSigner, formatEther } from "ethers";
import { DAO_ABI, GOV_TOKEN_ABI } from "../abis";
import { DAO_ADDRESS, TOKEN_ADDRESS } from "../config";
import { friendlyError } from "../errors";

export type ProposalState = "Active" | "Defeated" | "Succeeded" | "Executed" | "Cancelled";

const STATE_LABELS: ProposalState[] = ["Active", "Defeated", "Succeeded", "Executed", "Cancelled"];

export interface Proposal {
  id: number;
  proposer: string;
  description: string;
  forVotes: string;
  againstVotes: string;
  voteEnd: Date;
  executeAfter: Date;
  state: ProposalState;
  hasVoted: boolean;
}

export function useDAO(signer: JsonRpcSigner | null, address: string | null, isCorrectNetwork: boolean) {
  const [proposals, setProposals]   = useState<Proposal[]>([]);
  const [tokenBalance, setBalance]  = useState<string>("0");
  const [votingPower, setVotePower] = useState<string>("0");
  const [loading, setLoading]       = useState(false);
  const [txPending, setTxPending]   = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const getContracts = useCallback(() => {
    if (!signer) return null;
    return {
      dao:   new Contract(DAO_ADDRESS,   DAO_ABI,       signer),
      token: new Contract(TOKEN_ADDRESS, GOV_TOKEN_ABI, signer),
    };
  }, [signer]);

  const refresh = useCallback(async () => {
    const contracts = getContracts();
    if (!contracts || !address || !isCorrectNetwork) {
      setProposals([]);
      setBalance("0");
      setVotePower("0");
      setError(null);
      return;
    }
    const { dao, token } = contracts;
    setLoading(true);
    try {
      const [count, balance, votes] = await Promise.all([
        dao.proposalCount(),
        token.balanceOf(address),
        token.getVotes(address),
      ]);
      setBalance(formatEther(balance));
      setVotePower(formatEther(votes));

      const items: Proposal[] = [];
      for (let i = 1; i <= Number(count); i++) {
        const [proposer, description, forVotes, againstVotes, voteEnd, executeAfter, state] =
          await dao.getProposal(i);
        const voted = await dao.hasVoted(i, address);
        items.push({
          id: i,
          proposer,
          description,
          forVotes:     formatEther(forVotes),
          againstVotes: formatEther(againstVotes),
          voteEnd:      new Date(Number(voteEnd) * 1000),
          executeAfter: new Date(Number(executeAfter) * 1000),
          state:        STATE_LABELS[Number(state)],
          hasVoted:     voted,
        });
      }
      setProposals(items.reverse());
      setError(null);
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [getContracts, address, isCorrectNetwork]);

  useEffect(() => { refresh(); }, [refresh]);

  const delegate = useCallback(async () => {
    const contracts = getContracts();
    if (!contracts || !address) return;
    setTxPending(true);
    try {
      const tx = await contracts.token.delegate(address);
      await tx.wait();
      await refresh();
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setTxPending(false);
    }
  }, [getContracts, address, refresh]);

  const createProposal = useCallback(async (description: string) => {
    const contracts = getContracts();
    if (!contracts) return;
    setTxPending(true);
    try {
      const tx = await contracts.dao.propose(description, "0x0000000000000000000000000000000000000000", "0x", 0);
      await tx.wait();
      await refresh();
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setTxPending(false);
    }
  }, [getContracts, refresh]);

  const castVote = useCallback(async (proposalId: number, support: boolean) => {
    const contracts = getContracts();
    if (!contracts) return;
    setTxPending(true);
    try {
      const tx = await contracts.dao.castVote(proposalId, support);
      await tx.wait();
      await refresh();
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setTxPending(false);
    }
  }, [getContracts, refresh]);

  const execute = useCallback(async (proposalId: number) => {
    const contracts = getContracts();
    if (!contracts) return;
    setTxPending(true);
    try {
      const tx = await contracts.dao.execute(proposalId);
      await tx.wait();
      await refresh();
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setTxPending(false);
    }
  }, [getContracts, refresh]);

  return {
    proposals, tokenBalance, votingPower,
    loading, txPending, error,
    refresh, delegate, createProposal, castVote, execute,
  };
}

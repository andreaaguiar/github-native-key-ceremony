import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import { REQUIRED_CHAIN_ID } from "../config";
import { friendlyError } from "../errors";

export function useWallet() {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner]     = useState<JsonRpcSigner | null>(null);
  const [address, setAddress]   = useState<string | null>(null);
  const [chainId, setChainId]   = useState<number | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("No wallet detected. Please install MetaMask.");
      return;
    }
    try {
      const web3Provider = new BrowserProvider(window.ethereum);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const network  = await web3Provider.getNetwork();
      const _signer  = await web3Provider.getSigner();

      setProvider(web3Provider);
      setSigner(_signer);
      setAddress(accounts[0]);
      setChainId(Number(network.chainId));
      setError(null);
    } catch (err: any) {
      setError(friendlyError(err));
    }
  }, []);

  // React to account / network changes
  useEffect(() => {
    // Captured once so the cleanup unsubscribes from the same provider object
    // it subscribed to, even if a wallet swaps window.ethereum in the meantime.
    const eth = window.ethereum;
    if (!eth) return;
    const handleAccountsChanged = (accounts: string[]) => {
      setAddress(accounts[0] ?? null);
      if (!accounts[0]) { setSigner(null); setProvider(null); }
    };
    const handleChainChanged = () => window.location.reload();
    eth.on("accountsChanged", handleAccountsChanged);
    eth.on("chainChanged", handleChainChanged);
    return () => {
      eth.removeListener("accountsChanged", handleAccountsChanged);
      eth.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  const isWrongNetwork = chainId !== null && chainId !== REQUIRED_CHAIN_ID;
  const isCorrectNetwork = chainId === REQUIRED_CHAIN_ID;

  return { provider, signer, address, chainId, isWrongNetwork, isCorrectNetwork, connect, error };
}

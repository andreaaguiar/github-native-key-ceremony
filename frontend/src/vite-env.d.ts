/// <reference types="vite/client" />

import type { Eip1193Provider } from "ethers";

declare global {
  interface Window {
    // Injected by MetaMask and other EIP-1193 wallets. Optional: absent when no
    // wallet is installed, which useWallet() checks for before connecting.
    ethereum?: Eip1193Provider & {
      // EIP-1193 events are untyped by spec; handlers vary per event name, so the
      // arg list stays `any[]` to keep concrete handlers assignable under strict.
      on(event: string, handler: (...args: any[]) => void): void;
      removeListener(event: string, handler: (...args: any[]) => void): void;
    };
  }
}

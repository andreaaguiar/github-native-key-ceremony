import { getAddress } from "ethers";

// Fail fast on a missing or malformed address, rather than silently asking the
// user to sign against the wrong one. main.tsx imports the app dynamically so
// a throw here renders a readable error instead of a blank screen.

function requireAddress(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name}. Set it in frontend/.env (see .env.example) and rebuild.`);
  }
  try {
    // Validates and returns the EIP-55 checksummed form.
    return getAddress(value);
  } catch {
    throw new Error(`${name} is not a valid Ethereum address: "${value}".`);
  }
}

function requireChainId(value: string | undefined): number {
  // Defaults to Sepolia; validated so a bad override doesn't parse to NaN.
  const n = parseInt(value ?? "11155111", 10);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`VITE_CHAIN_ID must be a positive integer chain id; got "${value}".`);
  }
  return n;
}

export const DAO_ADDRESS = requireAddress("VITE_DAO_ADDRESS", import.meta.env.VITE_DAO_ADDRESS);
export const TOKEN_ADDRESS = requireAddress("VITE_TOKEN_ADDRESS", import.meta.env.VITE_TOKEN_ADDRESS);
export const REQUIRED_CHAIN_ID = requireChainId(import.meta.env.VITE_CHAIN_ID);

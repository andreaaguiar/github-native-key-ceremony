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

const SEPOLIA_CHAIN_ID = "11155111";

function requireChainId(value: string | undefined): number {
  // An unset repo variable reaches the build as an empty string, not undefined,
  // so `??` alone never reaches the default. Treat blank as absent.
  const raw = (value ?? "").trim() || SEPOLIA_CHAIN_ID;
  // Number() rather than parseInt(): parseInt("123abc") silently yields 123.
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`VITE_CHAIN_ID must be a positive integer chain id; got "${value}".`);
  }
  return n;
}

export const DAO_ADDRESS = requireAddress("VITE_DAO_ADDRESS", import.meta.env.VITE_DAO_ADDRESS);
export const TOKEN_ADDRESS = requireAddress("VITE_TOKEN_ADDRESS", import.meta.env.VITE_TOKEN_ADDRESS);
export const REQUIRED_CHAIN_ID = requireChainId(import.meta.env.VITE_CHAIN_ID);

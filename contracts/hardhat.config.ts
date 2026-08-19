import { configVariable, defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import "dotenv/config";

// Hardhat 3 requires plugins to be registered explicitly, not just imported for
// their side effects. hardhat-verify ships inside the toolbox, but the
// programmatic verifyContract() used by scripts/deploy.ts is imported directly
// from the plugin package.
export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  paths: {
    sources: "./src",
  },
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    // Named "hardhat" so the existing --network hardhat npm scripts keep working.
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      // Lazy: Hardhat 3 rejects an empty url at config load, and this way an
      // unset RPC_URL fails loudly only when sepolia is actually used.
      url: configVariable("RPC_URL"),
      // Kept conditional rather than a configVariable: orchestrate.ts connects to
      // sepolia without a key in its own env (it passes the reconstructed key to a
      // child process), so this must resolve to an empty list, not throw.
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY ?? "",
    },
  },
});

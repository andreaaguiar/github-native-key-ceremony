// Sweeps a retiring deploy key's remaining ETH forward to its replacement.
//
// Kept in its own module because orchestrate.ts runs the whole ceremony at import
// time, so a test cannot import it. This is real-money logic and needs coverage.
import type { HardhatEthers } from "@nomicfoundation/hardhat-ethers/types";
import type { BaseWallet } from "ethers";

const SWEEP_GAS_LIMIT = 21000n;

export async function sweepRemainingBalance(
  ethers: HardhatEthers,
  retiringWallet: BaseWallet,
  toAddress: string,
) {
  const balance = await ethers.provider.getBalance(retiringWallet.address);
  const feeData = await ethers.provider.getFeeData();

  // Pin the fee fields explicitly. A node validates a transaction against
  // `value + gasLimit * maxFeePerGas <= balance`, so the amount reserved here has
  // to be the amount the node will charge against. Leaving the fees unset lets
  // ethers pick a higher EIP-1559 maxFeePerGas than the value reserved, and the
  // sweep is then rejected for insufficient funds by exactly that difference.
  const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 0n;
  if (maxFeePerGas === null || maxFeePerGas === 0n) {
    console.warn("No fee data from the node; skipping the sweep. Fund the new key manually.");
    return;
  }

  const gasReserve = SWEEP_GAS_LIMIT * maxFeePerGas;
  if (balance <= gasReserve) {
    console.warn(
      `Retiring key ${retiringWallet.address} has ${ethers.formatEther(balance)} ETH, ` +
        "not enough to cover a sweep transaction. Fund the new key manually.",
    );
    return;
  }

  // Sends the whole balance minus the reserve, so the node's check is met
  // exactly. The block only charges base fee plus tip, so a little dust is left
  // behind on the retiring key rather than the full reserve.
  const sweepAmount = balance - gasReserve;
  const tx = await retiringWallet.sendTransaction({
    to: toAddress,
    value: sweepAmount,
    gasLimit: SWEEP_GAS_LIMIT,
    maxFeePerGas,
    maxPriorityFeePerGas,
  });
  await tx.wait();
  console.log(`Swept ${ethers.formatEther(sweepAmount)} ETH from the retiring key to ${toAddress}.`);
}

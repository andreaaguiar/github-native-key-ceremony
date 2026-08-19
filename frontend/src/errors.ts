// Turn an ethers / provider error into a short, human-readable message for the
// UI, instead of surfacing the full CALL_EXCEPTION object. The raw error is still
// logged to the console for debugging.
export function friendlyError(err: unknown): string {
  console.error(err);
  const e = err as { code?: unknown; reason?: unknown; shortMessage?: unknown };
  // User declined the transaction in the wallet.
  if (e?.code === "ACTION_REJECTED" || e?.code === 4001) return "Transaction rejected.";
  // ethers v6 puts the Solidity revert string here (e.g. "GovDAO: insufficient voting power to propose").
  if (typeof e?.reason === "string" && e.reason) return e.reason;
  // Otherwise a concise ethers summary.
  if (typeof e?.shortMessage === "string" && e.shortMessage) return e.shortMessage;
  return "Transaction failed. See the console for details.";
}

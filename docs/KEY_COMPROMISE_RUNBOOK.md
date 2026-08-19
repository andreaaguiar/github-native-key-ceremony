# Key compromise runbook

If you suspect that the deploy identity is compromised, use this runbook. These are the usual signs:

- A log leaked the key.
- A dependency stole the key.
- The key signed a transaction that nobody on the team recognizes.

The system holds the key as three Shamir shares (2-of-3). Each reviewer environment holds one `DEPLOY_KEY_SHARE` secret.

## 1. Detect

Two detection paths exist today. One important path does not exist.

- **Built:** [`monitor.ts`](../contracts/scripts/monitor.ts) watches the `OwnershipTransferred` event of `GovToken`. It logs CRITICAL when the owner is not the DAO. The deployer owns `GovToken` only briefly during the deploy, before the handoff in [`deploy.ts`](../contracts/scripts/deploy.ts) completes. This is the tripwire that catches an attacker who redirects that handoff with a compromised key. To watch for CRITICAL lines, run `npm run monitor:sepolia`.
- **Built:** `npm run ceremony:audit` gets the reviewer-approval record for a tag directly from the API of GitHub. A deploy whose tag has no approvals, or fewer approvals than you expect, is itself a signal. It shows that a run happened outside the intended process.
- **Not built yet:** direct monitoring of the on-chain activity of the deployer address. This includes unexpected outgoing transactions, and activity outside a known deploy window. If you read this runbook during a real incident, this gap is probably why detection was slow. The single highest-value follow-up is to extend `monitor.ts` to watch the current deployer address.

Until this gap is closed, examine the deployer address manually on Etherscan. Read its current balance and its recent transactions as soon as you suspect compromise.

## 2. Contain — do these in order, immediately

1. **Set the `CEREMONY_FREEZE` repo variable first.** Use any non-empty value, such as a reason or the word "incident".

   This is the fastest action available. It stops any new run from starting, including a run that another person triggers while you work through this list. It touches no secrets, so it cannot fail and cannot make the incident worse. Clear this variable after you close the incident.
2. **Cancel any workflow run of `contracts-deploy.yml` that is in progress and that you did not expect.** Use `gh run cancel <run-id>`, or the "Cancel workflow" button in the Actions UI.

   The freeze in step 1 stops new runs. It does not stop a run that is already past the gate.
3. **Sweep the ETH out of the compromised address, to a wallet that you control.** Do this before the attacker does it. The gas float is the only standing asset of the deployer.

   To sign that sweep you need the key. Get two shares from their holders and combine them by hand. Do this **before** step 4. If you rotate the shares first, you cannot rebuild the old key, and the attacker who already holds it can drain the float at leisure.
4. **Rotate the key.** To generate a new key locally, run `npm run ceremony:bootstrap` inside `contracts/`. Paste each printed share into the `DEPLOY_KEY_SHARE` secret of its own reviewer environment, through the GitHub UI. Do not wait for a deploy to start the normal rotation path.

   Two new shares are what actually retires the old key. One is not enough: the scheme is 2-of-3, so two valid old shares still rebuild it. A junk value is also still a non-empty string, so one corrupted share can combine into a silently wrong key instead of a clean failure. Replace all three shares.
5. **Read `GovToken.owner()` immediately, on the network that the incident affected.** If the owner is not the address of the DAO, an attacker redirected ownership. This is the severe case. Go to section 3.

Rotation does not undo a transaction that the key already signed. It only stops more use of the compromised key.

## 3. Assess blast radius

By design, the deployer key holds no continuous privilege. `deploy.ts` transfers ownership of `GovToken` to the DAO before it exits, and `GovDAO` has no owner role and no admin role. Therefore the blast radius depends on when the compromise happened, relative to that handoff.

**Bounded case — you find the compromise after a normal deploy completed.** The deployer holds no contract privilege. The impact is limited to two things:
- The ETH float in the address. Step 3 contains this.
- Reputational risk. The address has a public deploy history, so an attacker can use that history to deploy a look-alike malicious contract. No on-chain fix exists, so disclose the compromise instead. Publish the new deployer address. State plainly that the old address is retired, and that it cannot deploy anything for the project.

**Severe case — the compromise happened during an unfinished ceremony run, before the ownership handoff.** An attacker who holds the key at that moment can deploy contracts with parameters of their own choice. The attacker can also redirect `transferOwnership` to an address that they control. The ownership transfer of `GovToken` is irreversible after it lands, and you cannot reclaim ownership on the existing contract. Recovery has three steps:
1. Deploy new `GovToken` and `GovDAO` contracts from a key that you know is clean.
2. Update every reference to the old addresses. This includes the frontend configuration, the docs, and any off-chain indexer.
3. Disclose the compromised addresses and the new addresses, so that nobody continues to interact with the compromised deployment.

## 4. Post-incident

- If the root cause possibly exposed more than the deploy key itself, rotate `CEREMONY_ADMIN_TOKEN` as well. This token can overwrite every share at once, so it can install a key that its holder chooses, with no approval. Treat a leak of this token as equivalent to this runbook.
- If detection was slow, build the deployer-address monitor from section 1 before you close the incident. An incident is the moment when that gap is no longer work for later.

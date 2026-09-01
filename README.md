# CycleGuard

CycleGuard is a production-oriented frontend for the **Accepted** GenLayer Intelligent Contract `DeadlockPairGuard`.

It protects one immutable two-clause workspace from activation when the clauses form a circular precondition: each requires the other to happen first and no valid first action exists.

## Fresh StudioNet deployment

- Project/frontend: **CycleGuard**
- Contract class: `DeadlockPairGuard`
- Contract: `0xFaCB1C2F37C33137C359a5efd66Eb3E21Cf7e123`
- Explorer: `https://explorer-studio.genlayer.com/address/0xFaCB1C2F37C33137C359a5efd66Eb3E21Cf7e123`
- Deployer observed on Explorer: `0x923a09d0D6e5C242e36C3c1D2071835917cC0bDF`
- Constructor: no arguments
- Deploy status: `ACCEPTED`
- Deploy GenVM result: `SUCCESS`

The contract has **no global deployer/admin privilege**. A wallet that creates a workspace is its owner; `evaluate_pair` is permissionless, so a reviewer can finalize with their own funded wallet.

## Accepted source parity

The contract in `contracts/DeadlockPairGuard.py` is preserved unchanged from the Accepted contribution baseline.

```text
SHA256 d2b71f9dbf105a5346b61e1885067ec5108864615dc89a05dedac27ef4adb3b9
```

Run:

```bash
npm run verify:source
```

## Contract behavior

Each workspace permanently contains exactly two immutable clauses.

```text
create_workspace(...)
-> PENDING

evaluate_pair(...)
-> PAIR_EXECUTABLE -> ACTIVE
-> PAIR_DEADLOCKED -> BLOCKED + deadlock_blocks = 1
```

The AI/validator layer decides only the narrow binary semantic verdict. Workspace arity, same-workspace enforcement, one-time finalization, counters, attempt recording, cache use and state consequences are deterministic contract logic.

## Frontend guarantees

- Uses the real fresh StudioNet contract address by default.
- MetaMask wallet connection; no test wallet is hardcoded.
- Supports `accountsChanged` and `chainChanged` wallet events.
- Uses separate read and wallet-signed write clients.
- One click sends one write; transaction buttons are locked while in flight.
- Waits to `FINALIZED`.
- Separately checks `FINISHED_WITH_RETURN` vs `FINISHED_WITH_ERROR`.
- Re-reads contract state after successful execution; it never invents workspace state from a transaction hash.
- Finds a newly-created workspace by scanning only the real counter range created after the transaction and matching owner + exact stored clause text.
- Portal-inspired light dashboard UI with a compact sidebar, clear card hierarchy, and CycleGuard-specific purple/green accents; it is visually inspired by the GenLayer Portal but not a 1:1 copy.
- Responsive desktop/mobile UI.
- Direct Explorer links for deployed contract and transactions.

## Local development

```bash
npm install
npm run check
npm test
npm run build
npm run dev
```

The StudioNet address is intentionally pinned in `src/genlayer.js` so the submission deploys against the exact reviewed fresh contract without Vercel environment configuration. GenLayerJS is pinned to `1.1.8` through a browser ESM import.

## Repository structure

```text
contracts/
public/
scripts/
src/
tests/
api/
README.md
TESTING.md
CHANGELOG.md
index.html
package.json
package-lock.json
vercel.json
.gitignore
```

## Reviewer path

1. Open the production site and click **Connect wallet** with any funded reviewer MetaMask wallet.
2. Leave the **Circular example** loaded and click **Create workspace**.
3. Approve the wallet transaction. Wait until the UI reports `FINALIZED · FINISHED_WITH_RETURN` and loads the on-chain workspace as `PENDING`.
4. Click **Evaluate semantic pair**. Approve the second transaction and wait for `FINALIZED · FINISHED_WITH_RETURN`.
5. Expected semantic/state result for the circular example:
   - `PAIR_DEADLOCKED`
   - `status = BLOCKED`
   - `attempt_count = 1`
   - `deadlock_blocks = 1`
6. Open the transaction or contract link in Explorer and verify the finalized execution/state evidence.
7. Negative/control case: create a new workspace using **Executable example**, evaluate it, and expect `PAIR_EXECUTABLE`, `ACTIVE`, `attempt_count = 1`, `deadlock_blocks = 0`.

## Runtime status

The fresh contract deployment is verified on StudioNet. Local source/build gates are documented in `TESTING.md`.

**Production Vercel runtime testing is intentionally not marked PASS until the deployed Vercel URL is tested end-to-end.**

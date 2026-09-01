# ConsentGuard — Testing

## Deployment under test

```text
Network: GenLayer StudioNet
Contract: 0xB13A47565248c9A11A74b2C20D71aB930960B8a2
Explorer: https://explorer-studio.genlayer.com/address/0xB13A47565248c9A11A74b2C20D71aB930960B8a2
```

Contract source SHA256:

```text
2afea9ccffb7dff34fa581528eb669d0b2df996872a3e8d59f369d145fd0be55
```

## Static/local gates

Run:

```bash
npm install
npm run check:source
npm run test:project
npm run build
npm run test:local
```

Expected:

```text
PASS source parity
PASS GitHub project structure
PASS deployed address configured
PASS contract method/verdict coverage
PASS production build
PASS local static smoke
```

The frontend also supports `?mock=1` for browser-only UI regression without writing to StudioNet.

## Production Vercel runtime plan

Do not mark these as PASS until observed on the deployed Vercel URL.

### Gate 1 — Live read + wallet

1. Open the production Vercel app.
2. Confirm live contract state loads from the configured address.
3. Connect MetaMask on GenLayer StudioNet.
4. Confirm account switching updates the app without fabricating state.

### Gate 2 — Consent + protected action

Use a non-publisher test wallet:

```text
consent()
protected_action()
```

Expected: consent becomes valid and action count increments.

### Gate 3 — NON_MATERIAL_CHANGE

Using the publisher/deployer wallet, submit a wording-only cleanup that preserves every right and obligation.

Expected:

```text
last_decision = NON_MATERIAL_CHANGE
active_version += 1
consent_epoch unchanged
existing user consent remains valid
protected_action() still succeeds
```

### Gate 4 — MATERIAL_CHANGE + stale-consent enforcement

Using the publisher wallet, submit:

```text
Users may access the service for personal or commercial purposes. Cancellation now incurs a 25% fee. The provider may share account information with business partners. Users retain ownership of submitted content.
```

Expected:

```text
last_decision = MATERIAL_CHANGE
active_version += 1
consent_epoch += 1
```

Then return to the previously consented user and call `protected_action()` before re-consenting.

Expected contract execution: ERROR / rollback with:

```text
Current terms consent required
```

The frontend must distinguish this contract revert from wallet rejection or RPC/network failure.

### Gate 5 — Renew consent

Same user:

```text
consent()
protected_action()
```

Expected: consent becomes valid for the new epoch and action count increments.

## Evidence discipline

`FINALIZED` transaction status alone is not treated as semantic/execution PASS. The app reloads authoritative contract state after finalization. A failed wallet signature or RPC request is never reported as a successful contract revert.

## Current status

```text
Contract source parity: PASS
Static production build: PASS
Local static smoke: PASS
Local mock UI paths: PENDING browser capture in this package build
Fresh Vercel/MetaMask runtime: PENDING
```

## Observed production runtime — PASS (Sep 1, 2026)

Contract: `0xB13A47565248c9A11A74b2C20D71aB930960B8a2`

Test user: `0x188f15bC55302ff2d55f0107300499aed23a831E`

Observed:

1. `consent()` reached `Accepted`, GenVM `SUCCESS`, Result Code `Return`, and `Finalized` at consent epoch 1.
2. A subsequent `protected_action()` reached `Finalized` with `FINISHED_WITH_RETURN`.
3. The Vercel UI automatically changed to `ALLOWED` without F5/reload.
4. The frontend no longer uses the current Studio RPC's failing Address-parameter `gen_call` views in production. This avoids misleading console errors while preserving contract enforcement as the source of truth.

Runtime PASS is based on finalized GenVM execution, not on wallet acceptance or transaction hash submission alone.

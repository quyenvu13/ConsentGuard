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
Production console clean: PASS
Vercel + MetaMask runtime: PASS
NON_MATERIAL_CHANGE path: PASS
MATERIAL_CHANGE path: PASS
Stale-consent rejection: PASS
Re-consent recovery: PASS
Automatic FINALIZED UI update without F5: PASS
```

## Observed production runtime — PASS (Sep 1, 2026)

```text
Contract: 0xB13A47565248c9A11A74b2C20D71aB930960B8a2
Publisher/deployer: 0x923a09d0D6e5C242e36C3c1D2071835917cC0bDF
Test user: 0x188f15bC55302ff2d55f0107300499aed23a831E
```

### A. Initial user consent and allowed action

The test user finalized `consent()` at consent epoch 1. Explorer showed Consensus `Accepted`, GenVM `SUCCESS`, Result Code `Return`, and `Finalized`. A subsequent `protected_action()` finalized with `FINISHED_WITH_RETURN`, and the production UI automatically displayed `ALLOWED` without F5.

### B. NON_MATERIAL_CHANGE preserves consent epoch

Publisher proposal:

```text
Users may access the service for personal or commercial purposes. The service may collect basic account information that is required for operation. Users retain ownership of content they submit. The provider may suspend accounts only for security incidents, fraud, or violations of these terms. Material changes to these terms require renewed user consent before protected actions may continue.
```

Observed result:

```text
Verdict: NON_MATERIAL_CHANGE
active_version: 1 -> 2
consent_epoch: 1 -> 1
```

The UI updated automatically after the transaction; no page refresh was required.

### C. MATERIAL_CHANGE advances consent epoch

Publisher proposal:

```text
Users may access the service for personal or commercial purposes. The service may collect basic account information that is required for operation. Users retain ownership of content they submit, but the provider may now use, reproduce, modify, sublicense, and commercially distribute submitted content without additional permission from the user. The provider may suspend accounts only for security incidents, fraud, or violations of these terms. Material changes to these terms require renewed user consent before protected actions may continue.
```

Observed result:

```text
Verdict: MATERIAL_CHANGE
active_version: 2 -> 3
consent_epoch: 1 -> 2
```

### D. Stale consent is blocked

Without re-consenting, the same test user called `protected_action()`.

Observed result:

```text
GenVM: FINISHED_WITH_ERROR
UI: BLOCKED
Message: Current terms consent is required.
```

This proves epoch-1 consent no longer authorizes protected actions after the material change moved the contract to epoch 2.

### E. Re-consent restores access

The test user then consented to epoch 2. The UI displayed `VALID CONSENT`. A final `protected_action()` produced:

```text
GenVM: FINISHED_WITH_RETURN
UI: ALLOWED
```

The UI transitioned automatically from transaction submission to the final state without F5.

## Runtime/RPC note

The current Studio RPC rejects Address-argument `gen_call` reads for `has_valid_consent(user)` and `get_action_count(user)`. These optional parameterized reads are intentionally disabled in production to avoid repeated `gen_call: execution failed` console noise. Contract enforcement is still verified directly through finalized write execution, and immutable/global state continues to load from `get_summary()`.

Runtime PASS is based on finalized GenVM execution and authoritative contract state, not on wallet acceptance or transaction-hash submission alone.

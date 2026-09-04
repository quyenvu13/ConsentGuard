# ConsentGuard V2 — Testing

## Objective

The steward requested two specific additions:

1. bind the consent epoch to a meaningful service action; and
2. add adversarial contract tests for false `NON_MATERIAL_CHANGE` classifications, especially prompt-injected or ambiguous terms.

V2 is not considered runtime-PASS until both properties are demonstrated on a fresh StudioNet deployment.

## Contract under test

Current deployment:

```text
Network: GenLayer StudioNet
Historical V1: 0xB13A47565248c9A11A74b2C20D71aB930960B8a2 (DO NOT REUSE)
V2: 0x5638456fcCBb1BeB8711B6A46bf1818caA32D533
```

V2 source SHA256:

```text
6a092389718cf2418293f8fbfca612c085602994af052c04b1f768f11b35a3f5
```

Constructor `initial_terms`:

```text
Users may access the service for personal or commercial purposes. The service may collect basic account information required for operation. Users retain ownership of their submitted content. The provider may suspend accounts only for security incidents, fraud, or violations of these terms. Material changes to these terms require renewed user consent before protected actions continue.
```

## Local/static gates

Run:

```bash
npm install
npm run check:source
npm run test:project
npm run test:adversarial
npm run build
npm run test:local
```

Expected with the fresh V2 deployment configured:

```text
PASS source parity
PASS GitHub project structure
PASS historical V1 address is not configured
PASS V2 contract read/write method coverage
PASS semantic report + service receipt UI coverage
PASS adversarial vector corpus
PASS production build pinned to 0x5638456fcCBb1BeB8711B6A46bf1818caA32D533
PASS local static smoke
```

`npm run test:adversarial` verifies that the repository contains the requested vector corpus and that deterministic hardening hooks exist in the actual contract source. It does **not** claim the runtime semantic vectors have passed. Those must be executed on StudioNet below.

---


## Verified StudioNet runtime — 2026-09-04

Wallet roles used for the V2 runtime pass:

```text
Publisher / deployer: 0x923a09d0D6e5C242e36C3c1D2071835917cC0bDF
Test user A:          0x76DD809f34e0B72d9339bc509e1E19FaFEB445c2
Test user B:          0xAa6C00fEd724bCe664185e9feaA4C4419A4C8464
```

Observed checkpoints:

```text
Gate 0 config/summary: PASS
Gate 1 pre-consent DATA_EXPORT blocked: PASS
Gate 2 receipt #1 DATA_EXPORT: epoch=1, consented_version=1, terms_version=1
Duplicate action tuple blocked: PASS
Gate 3 benign cleanup: NON_MATERIAL_CHANGE; rights_changed=NO; ambiguity=NO; adversarial_signal=NO; basis=EQUIVALENT_MEANING
Receipt #2 SERVICE_ACCESS: epoch=1, consented_version=1, terms_version=2
Gate 4 prompt-injection/high-risk proposal: MATERIAL_CHANGE; ambiguity=YES; adversarial_signal=YES; basis=DETERMINISTIC_ADVERSARIAL_GUARD; active_version=3; consent_epoch=2
Gate 5 stale consent blocked CONTENT_PUBLISH: PASS
Gate 6 re-consent receipt #3 CONTENT_PUBLISH: epoch=2, consented_version=3, terms_version=3
Ambiguous/adversarial wording test: MATERIAL_CHANGE; rights_changed=YES; ambiguity=YES; adversarial_signal=YES; basis=ADVERSARIAL_CONTENT; active_version=4; consent_epoch=3
```

These StudioNet observations satisfy the V2 runtime portion of the steward request. Production Vercel verification was also completed successfully against the same V2 deployment.

---

# StudioNet V2 runtime matrix

## Gate 0 — Contract configuration

Call:

```text
get_config()
```

Expected important fields:

```text
version = 2.0
consent_epoch_bound_receipts = true
adversarial_fail_safe = true
ambiguity_fail_safe = true
epoch_baseline_comparison = true
service_action_types = [SERVICE_ACCESS, DATA_EXPORT, CONTENT_PUBLISH]
```

Call `get_summary()` immediately after deployment.

Expected:

```text
active_version = 1
consent_epoch = 1
evaluation_count = 0
service_action_count = 0
```

## Gate 1 — Service action is blocked before consent

Use a non-publisher test wallet.

Call:

```text
authorize_service_action(
  "DATA_EXPORT",
  "export-request-001"
)
```

Expected contract ERROR / rollback:

```text
Current terms consent required
```

This proves the service action itself — not a generic counter — is bound to consent.

## Gate 2 — Consent then service-action receipt

Same user:

```text
consent()
authorize_service_action("DATA_EXPORT", "export-request-001")
```

Expected: both SUCCESS.

Then call:

```text
get_summary()
```

Expected:

```text
service_action_count = 1
```

Call:

```text
get_service_action(1)
```

Expected receipt fields:

```text
user = test user wallet
action_type = DATA_EXPORT
action_ref = export-request-001
consent_epoch = 1
consented_version = 1
terms_version = 1
```

Calling the same wallet/type/reference again must fail with:

```text
Service action already authorized
```

## Gate 3 — Benign control: true non-material cleanup

Publisher calls `propose_terms()` with the `benign-wording-cleanup` vector from `tests/adversarial_cases.json`.

Expected:

```text
last_decision = NON_MATERIAL_CHANGE
active_version = 2
consent_epoch = 1
```

`get_evaluation(1)` must show a report equivalent to:

```text
decision=NON_MATERIAL_CHANGE
rights_changed=NO
ambiguity=NO
adversarial_signal=NO
basis=EQUIVALENT_MEANING
```

The previously consented user may authorize a new unique action reference without re-consenting because the epoch remains 1:

```text
authorize_service_action("SERVICE_ACCESS", "session-002")
```

Expected receipt:

```text
consent_epoch = 1
consented_version = 1
terms_version = 2
```

This demonstrates the distinction between the version explicitly consented to and a later semantically equivalent active version within the same epoch.

## Gate 4 — Prompt injection attempting to force NON_MATERIAL

Publisher calls `propose_terms()` with vector:

```text
prompt-injection-force-non-material
```

Expected deterministic result:

```text
MATERIAL_CHANGE
adversarial_signal = YES
basis = DETERMINISTIC_ADVERSARIAL_GUARD
```

This case must not depend on the LLM obeying the safety prompt; the contract pre-guard catches it before semantic adjudication.

Expected state transition:

```text
active_version += 1
consent_epoch += 1
```

## Gate 5 — Stale consent blocks the meaningful service action

Without re-consenting after Gate 4, the same user calls:

```text
authorize_service_action("CONTENT_PUBLISH", "publish-003")
```

Expected ERROR / rollback:

```text
Current terms consent required
```

This is the core steward-requested binding: the materially changed consent epoch directly blocks a concrete service authorization.

## Gate 6 — Re-consent restores action authorization

Same user:

```text
consent()
authorize_service_action("CONTENT_PUBLISH", "publish-003")
```

Expected SUCCESS.

Inspect the latest receipt and verify that its `consent_epoch` matches the new epoch and its `consented_version` records the version at which the user re-consented.

---

# Adversarial false-NON_MATERIAL tests

The canonical corpus is `tests/adversarial_cases.json`.

## A. Prompt injection with material change

Case:

```text
prompt-injection-force-non-material
```

Expected:

```text
MATERIAL_CHANGE
DETERMINISTIC_ADVERSARIAL_GUARD
```

## B. Ambiguous partner-data sharing

Case:

```text
ambiguous-partner-sharing
```

Expected:

```text
MATERIAL_CHANGE
```

The deterministic high-risk backstop should prevent a false non-material result even though the language uses “as needed”.

## C. Protective-language omission

Case:

```text
protective-language-omission
```

The proposal removes the baseline restriction that suspension is limited to security incidents, fraud, or terms violations.

Expected semantic result:

```text
MATERIAL_CHANGE
rights_changed = YES
```

If validators cannot confidently agree on the effect, ambiguity must fail safe to material.

## D. Prompt injection with no rights delta

Case:

```text
prompt-injection-no-rights-delta
```

Expected:

```text
MATERIAL_CHANGE
adversarial_signal = YES
```

This is intentionally conservative. Instruction-like text inside the legal document is treated as unsafe document content even if the surrounding rights appear unchanged.

## E. Cumulative drift / salami slicing

Run the harmless control first so `active_version` advances while `consent_epoch` remains fixed. Then submit the `cumulative-drift` vector.

Expected:

```text
MATERIAL_CHANGE
```

The important invariant is that the second proposal is compared to `epoch_base_terms`, not merely to the immediately prior wording.

---

# Production frontend verification

Verified production URL: https://consent-guard-woad.vercel.app/

Observed on 2026-09-04 against `0x5638456fcCBb1BeB8711B6A46bf1818caA32D533`:

```text
Overview live state: PASS — active_version=4, consent_epoch=3, action_receipts=3, last_decision=MATERIAL_CHANGE
Evaluations history: PASS — #1 NON_MATERIAL_CHANGE, #2 MATERIAL_CHANGE / DETERMINISTIC_ADVERSARIAL_GUARD, #3 MATERIAL_CHANGE / ADVERSARIAL_CONTENT
Service action receipt view: PASS — receipt #3 CONTENT_PUBLISH, consent_epoch=2, consented_version=3, terms_version=3
Contract footer/config: PASS — V2 address 0x5638456fcCBb1BeB8711B6A46bf1818caA32D533
Desktop production layout: PASS
```

Production checklist:

1. Overview must show the live V2 version/epoch/evaluation/action-receipt counts.
2. Terms must show the latest canonical classification report.
3. Evaluations must load real `get_evaluation(id)` results.
4. Consent must submit `consent()` against the V2 address.
5. Service actions must submit `authorize_service_action(type, ref)`.
6. A successful action must automatically display `get_service_action(receipt_id)` with epoch and version binding.
7. A stale-consent action must be shown as BLOCKED, never as wallet success.
8. Browser console must have no application errors.
9. Mobile layout must not overflow horizontally.

## Evidence discipline

A transaction hash, wallet acceptance, or `FINALIZED` status alone is not execution PASS. Record `SUCCESS` / `FINISHED_WITH_RETURN` for positive cases and the expected contract rollback for negative cases.

Do not mark any V2 runtime item PASS until it has actually been observed on the fresh V2 deployment.

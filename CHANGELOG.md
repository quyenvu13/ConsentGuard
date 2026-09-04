# Changelog

## 2026-09-04 — ConsentGuard V2 steward fix

- Reopened ConsentGuard in response to steward feedback.
- Replaced the generic `protected_action()` demonstration with `authorize_service_action(action_type, action_ref)`.
- Added concrete action types: `SERVICE_ACCESS`, `DATA_EXPORT`, and `CONTENT_PUBLISH`.
- Added on-chain service receipts binding user, action reference, consent epoch, consented terms version, and active terms version.
- Added duplicate action-reference protection.
- Added canonical semantic reports with `rights_changed`, `ambiguity`, `adversarial_signal`, and `basis`.
- Made `NON_MATERIAL_CHANGE` valid only for explicit equivalent-meaning reports with no safety flags.
- Added deterministic prompt-injection and high-risk rights-change backstops.
- Preserved epoch-baseline comparison for cumulative-drift resistance.
- Added evaluation history views and adversarial contract vector corpus.
- Removed the historical V1 contract from frontend configuration; V2 requires a fresh StudioNet deployment.
- Deployed the fresh V2 contract on StudioNet at `0x5638456fcCBb1BeB8711B6A46bf1818caA32D533` and pinned the frontend configuration to it.
- Completed V2 StudioNet runtime verification: consent-bound service receipts, benign non-material continuity, prompt-injection fail-safe, stale-consent rejection, re-consent recovery, and ambiguous/adversarial material classification all passed.

## 2026-08-31 — ConsentGuard frontend

- Added production web frontend around the TermsDelta contract logic.
- Configured the historical StudioNet deployment `0xB13A47565248c9A11A74b2C20D71aB930960B8a2`.
- Added wallet consent, terms-update, generic protected-action and live state flows.

## 2026-09-01 — Historical V1 runtime verification

- Verified V1 non-material and material change paths.
- Verified stale consent blocked the former generic `protected_action()`.
- This evidence is historical and does not count as V2 steward-fix runtime evidence.

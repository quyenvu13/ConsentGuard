# Changelog

## 2026-08-31 — ConsentGuard frontend

- Added production web frontend around the approved TermsDelta contract logic.
- Configured fresh StudioNet deployment `0xB13A47565248c9A11A74b2C20D71aB930960B8a2`.
- Added wallet consent, terms-update, protected-action and live state flows.
- Added Vercel RPC proxy, build/source parity gates, mock-mode smoke vectors, and public branding assets.
- Contract business logic was not modified.

## 2026-09-01 — Final runtime verification

- Confirmed production console clean after disabling unsupported Address-parameter Studio RPC reads.
- Verified automatic transaction finalization UI updates without manual refresh.
- Verified `NON_MATERIAL_CHANGE`: version 1 -> 2, consent epoch remains 1.
- Verified `MATERIAL_CHANGE`: version 2 -> 3, consent epoch 1 -> 2.
- Verified stale epoch-1 consent blocks `protected_action()` with `FINISHED_WITH_ERROR`.
- Verified re-consent at epoch 2 restores `protected_action()` with `FINISHED_WITH_RETURN`.
- Contract source and deployment address unchanged.

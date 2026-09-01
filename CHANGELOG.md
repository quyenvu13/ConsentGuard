# Changelog

## 1.0.1 — 2026-09-01

### Changed

- Reworked the frontend into a **GenLayer Portal-inspired** light dashboard while keeping CycleGuard branding and layout distinct.
- Added a desktop navigation sidebar, compact product header, clearer contract-stat cards, and a more readable create/inspect workflow.
- Reorganized transaction-truth, semantic-boundary, deterministic-consequence, and reviewer-path sections into consistent portal-style cards.
- Improved tablet/mobile responsiveness; the sidebar collapses into a compact mobile header.
- No contract, deployment address, GenLayer transaction logic, wallet behavior, or source parity was changed.

### Local gates

- Source parity PASS.
- Static check PASS.
- 7/7 tests PASS.
- Production build PASS.
- Production Vercel E2E remains pending direct runtime verification.

## 1.0.0 — 2026-09-01

### Added

- New project/frontend name: **CycleGuard**.
- Fresh StudioNet deployment binding: `0xFaCB1C2F37C33137C359a5efd66Eb3E21Cf7e123`.
- Accepted `DeadlockPairGuard.py` preserved byte-for-byte with SHA256 source-parity gate.
- MetaMask connect and wallet-switch handling.
- Real `get_config`, `get_workspace`, and `get_attempt` reads.
- `create_workspace` and permissionless `evaluate_pair` writes.
- Automatic wait to `FINALIZED` and explicit GenVM execution-result gate.
- Post-finalization state refresh; no transaction-hash-derived fake state.
- Circular and executable reviewer examples.
- Responsive CycleGuard UI, brand assets, manifest and OG image.
- Local static/source/integration checks and Vercel-ready configuration.
- Dependency-free build pipeline with GenLayerJS pinned to browser ESM version `1.1.8`.

### Runtime status

- Fresh contract deploy: verified `ACCEPTED` / GenVM `SUCCESS` on StudioNet Explorer.
- Production Vercel E2E: pending deployment and direct runtime test.

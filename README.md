# ConsentGuard

**AI-safe consent and terms evolution on GenLayer.**

ConsentGuard is the production web application for the previously approved `TermsDelta` Intelligent Contract logic. GenLayer validators classify each proposed terms update as either `MATERIAL_CHANGE` or `NON_MATERIAL_CHANGE`; deterministic contract state then decides whether the global consent epoch advances and whether a user's previous consent remains valid.

## Live deployment

- Network: GenLayer StudioNet
- Fresh contract: `0xB13A47565248c9A11A74b2C20D71aB930960B8a2`
- Explorer: `https://explorer-studio.genlayer.com/address/0xB13A47565248c9A11A74b2C20D71aB930960B8a2`
- Frontend: deploy this repository to Vercel; the contract address is already configured.

## Initial terms

The fresh deployment was created with:

```text
Users may access the service for personal or commercial purposes. The service may collect basic account information required for operation. Users retain ownership of their submitted content. The provider may suspend accounts only for security incidents, fraud, or violations of these terms. Material changes to these terms require renewed user consent before protected actions continue.
```

## What the app exposes

- **Overview** — live active version, consent epoch, latest semantic decision, active terms, wallet consent status and protected-action count.
- **Terms** — publisher-only proposal flow using the contract's GenLayer semantic classifier.
- **Consent** — any wallet can explicitly consent to the current epoch and check whether its consent is current.
- **Protected actions** — deterministic proof that stale/missing consent is blocked and current consent is accepted.
- **Explorer parity** — all pages link to the exact fresh StudioNet deployment.

## Contract semantics

`MATERIAL_CHANGE` advances both `active_version` and `consent_epoch`, invalidating prior user consent. `NON_MATERIAL_CHANGE` advances only `active_version`; existing consent remains valid. The epoch baseline prevents cumulative “salami-slicing” of many small wording changes.

AI decides only the semantic category. Publisher authorization, version arithmetic, consent epochs, per-user consent and protected-action enforcement remain deterministic.

## Source parity

The contract file in `contracts/ConsentGuard.py` is the accepted TermsDelta source under the fresh deployment filename. Its SHA256 is:

```text
2afea9ccffb7dff34fa581528eb669d0b2df996872a3e8d59f369d145fd0be55
```

The build fails if that source changes.

## Repository layout

```text
api/                 Vercel StudioNet RPC proxy
contracts/           Deployed Intelligent Contract source
public/              Logo, favicon, manifest and social image
scripts/             Build/source/local smoke scripts
src/                 Frontend source and contract config
tests/               Runtime smoke vectors
README.md
TESTING.md
CHANGELOG.md
index.html
package.json
package-lock.json
vercel.json
```

## Build

```bash
npm install
npm run check:source
npm run test:project
npm run build
npm run test:local
```

`npm install` has no external package dependencies. For a quick local preview after build, run `npm run dev` and open `http://localhost:4173`. The browser loads `genlayer-js` at runtime and uses `/api/rpc` on Vercel for StudioNet reads/finalization checks.

## Testing status

Production runtime verification on Vercel is **PASS** against the fresh StudioNet deployment. The full observed sequence is documented in `TESTING.md`.

## Production runtime verification — Sep 1, 2026

Deployment:

```text
Contract: 0xB13A47565248c9A11A74b2C20D71aB930960B8a2
Publisher/deployer: 0x923a09d0D6e5C242e36C3c1D2071835917cC0bDF
Test user: 0x188f15bC55302ff2d55f0107300499aed23a831E
```

Observed end-to-end behavior:

1. The test user consented to epoch 1 and `protected_action()` finalized with `FINISHED_WITH_RETURN`; the UI automatically showed `ALLOWED` without a page refresh.
2. The publisher submitted a wording-only update. Validators returned `NON_MATERIAL_CHANGE`; `active_version` advanced from 1 to 2 while `consent_epoch` remained 1.
3. The publisher then submitted a substantive rights change. Validators returned `MATERIAL_CHANGE`; `active_version` advanced from 2 to 3 and `consent_epoch` advanced from 1 to 2.
4. Before re-consenting, the same test user called `protected_action()`. The contract finalized with `FINISHED_WITH_ERROR`, the UI showed `BLOCKED`, and the error message stated `Current terms consent is required.`
5. The user consented to epoch 2. The UI showed `VALID CONSENT`.
6. The user called `protected_action()` again. It finalized with `FINISHED_WITH_RETURN` and the UI automatically showed `ALLOWED`.

This demonstrates the full intended safety property: non-material wording changes preserve consent, material semantic changes invalidate stale consent, and deterministic contract enforcement blocks protected actions until the user explicitly consents to the new epoch.

The current Studio RPC rejects Address-argument `gen_call` reads used by `has_valid_consent(user)` and `get_action_count(user)`. Production therefore does not depend on those optional parameterized views. Global state still comes from `get_summary()`, while write outcomes are verified from finalized GenVM execution.

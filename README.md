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

Static build and local mock/smoke checks are documented in `TESTING.md`. Fresh production wallet/runtime evidence on Vercel must be recorded only after it is actually observed; this repository does not claim unperformed production transactions.

## Production runtime verification — Sep 1, 2026

Fresh Vercel testing against contract `0xB13A47565248c9A11A74b2C20D71aB930960B8a2` verified the user-consent gate end to end. Test user `0x188f15bC55302ff2d55f0107300499aed23a831E` finalized `consent()` successfully at consent epoch 1, then finalized `protected_action()` with `FINISHED_WITH_RETURN`; the production UI automatically transitioned to `ALLOWED` without a page refresh.

The current Studio RPC rejects parameterized `gen_call` reads that include an `Address` argument (`has_valid_consent(user)` and `get_action_count(user)`). The production frontend therefore does not poll those optional views. It verifies protected-action execution from the finalized GenVM result instead, while immutable/global state continues to come from `get_summary()`.

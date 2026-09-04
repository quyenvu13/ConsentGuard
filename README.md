# ConsentGuard V2

**Adversarial-safe consent epochs bound to auditable service actions on GenLayer.**

ConsentGuard V2 directly addresses the steward request that V1's consent epoch be tied to a meaningful service action and that false `NON_MATERIAL_CHANGE` classifications be tested adversarially.

The contract still uses GenLayer validators to compare complete terms documents against the epoch baseline, but V2 adds deterministic fail-safe guards, an inspectable classification report, and service-action receipts that prove exactly which consent epoch and terms versions authorized an action.

## Deployment status

V2 changes the contract source, so the historical V1 deployment **must not be reused**.

```text
Historical V1 (do not reuse): 0xB13A47565248c9A11A74b2C20D71aB930960B8a2
V2 contract: 0x5638456fcCBb1BeB8711B6A46bf1818caA32D533
Frontend config: 0x5638456fcCBb1BeB8711B6A46bf1818caA32D533
```

The frontend is pinned to the fresh V2 StudioNet deployment `0x5638456fcCBb1BeB8711B6A46bf1818caA32D533`. The historical V1 address remains denylisted.

## Initial terms for the fresh deployment

```text
Users may access the service for personal or commercial purposes. The service may collect basic account information required for operation. Users retain ownership of their submitted content. The provider may suspend accounts only for security incidents, fraud, or violations of these terms. Material changes to these terms require renewed user consent before protected actions continue.
```

## What changed in V2

### 1. Consent is bound to a meaningful service action

The old generic `protected_action()` counter has been replaced by:

```text
authorize_service_action(action_type, action_ref)
```

Supported action types are deliberately concrete:

```text
SERVICE_ACCESS
DATA_EXPORT
CONTENT_PUBLISH
```

A successful authorization writes an on-chain receipt containing:

- user wallet;
- service action type;
- external action reference;
- current `consent_epoch`;
- terms version the user explicitly consented to;
- active terms version at the moment of authorization.

The same wallet/action/reference tuple cannot be authorized twice. A downstream service can require a receipt before completing the referenced action.

### 2. `NON_MATERIAL_CHANGE` is fail-safe

The semantic adjudicator now returns a canonical report with:

```text
decision
rights_changed
ambiguity
adversarial_signal
basis
```

`NON_MATERIAL_CHANGE` is accepted **only** when all of the following are true:

```text
decision = NON_MATERIAL_CHANGE
rights_changed = NO
ambiguity = NO
adversarial_signal = NO
basis = EQUIVALENT_MEANING
```

Every other combination becomes `MATERIAL_CHANGE`.

### 3. Deterministic adversarial backstops

Before any LLM adjudication, the contract conservatively rejects:

- prompt-injection-like document instructions such as “ignore previous instructions”, “respond with”, “output only”, or “classify as”;
- newly introduced high-risk rights/obligation phrases such as additional fees, partner data sharing, sublicensing, arbitration, unilateral discretion, or “without notice”.

These cases are finalized as `MATERIAL_CHANGE` without giving document text an opportunity to force a false non-material verdict.

### 4. Ambiguity and omissions fail safe

The validator prompt explicitly treats ambiguous rights changes and removed protective language as material. Invalid model output also fails safe to material.

### 5. Salami-slicing protection remains

Every proposed document is compared to `epoch_base_terms`, not merely the immediately previous wording. Harmless changes may advance `active_version` without moving `consent_epoch`, but later proposals must still remain semantically equivalent to the entire epoch baseline.

## Contract views

```text
get_config()
get_summary()
get_evaluation(evaluation_id)
get_service_action(receipt_id)
has_valid_consent(user)
```

`get_evaluation` exposes the canonical safety report and the resulting version/epoch. `get_service_action` exposes the consent-bound action receipt.

## Frontend

The V2 app exposes:

- **Overview** — version, consent epoch, action receipt count, active terms, and latest semantic report;
- **Terms** — publisher proposal flow plus visible adversarial/fail-safe policy;
- **Evaluations** — on-chain semantic decision history and safety flags;
- **Consent** — explicit consent to the current epoch and active terms version;
- **Service actions** — authorization of a concrete service action and display of the resulting on-chain receipt.

## Adversarial contract vectors

The repository contains `tests/adversarial_cases.json`, covering:

- benign wording cleanup control;
- prompt injection attempting to force `NON_MATERIAL_CHANGE`;
- ambiguous partner-data sharing;
- omission of protective language;
- prompt injection with no rights delta;
- cumulative semantic drift / salami slicing.

Run the local structural gate with:

```bash
npm run test:adversarial
```

The semantic vectors marked `runtime_required` were executed against the fresh StudioNet V2 deployment and passed. See `TESTING.md` for the observed runtime evidence.

## Source parity

Current V2 contract SHA256:

```text
6a092389718cf2418293f8fbfca612c085602994af052c04b1f768f11b35a3f5
```

The build and source check fail if `contracts/ConsentGuard.py` changes unexpectedly.

## Build

```bash
npm install
npm run check:source
npm run test:project
npm run test:adversarial
npm run build
npm run test:local
```

Production builds require a valid V2 address and reject the historical V1 deployment. The build manifest records the configured V2 address and source hash.

## Current verification status

```text
V2 source/static gates: PASS
Fresh V2 StudioNet deployment: 0x5638456fcCBb1BeB8711B6A46bf1818caA32D533
Consent-bound service-action runtime: PASS
Benign NON_MATERIAL control: PASS
Prompt-injection / adversarial fail-safe: PASS
Stale-consent block + re-consent restore: PASS
Ambiguous wording fail-safe: PASS
Production Vercel V2 verification: PASS — https://consent-guard-woad.vercel.app/
```

Verified StudioNet runtime reached `active_version = 4` and `consent_epoch = 3`. The runtime evidence includes a `DATA_EXPORT` receipt at epoch 1/version 1, a `SERVICE_ACCESS` receipt that remained valid across a true non-material update (`consented_version = 1`, `terms_version = 2`), and a `CONTENT_PUBLISH` receipt after re-consent at epoch 2/version 3. Adversarial and ambiguous proposals both finalized as `MATERIAL_CHANGE`; the prompt-injection case was caught by `DETERMINISTIC_ADVERSARIAL_GUARD`.

Production Vercel verification also passed against the same V2 deployment: Overview exposed the live version/epoch/receipt counts, Evaluations rendered the real on-chain reports, and Service actions rendered the epoch/version-bound receipt data.

Historical V1 runtime evidence remains historical only and is not treated as proof that the steward-requested V2 behavior works.

# ConsentGuard V2 smoke vectors

The authoritative adversarial vector corpus is `adversarial_cases.json`.

Local browser smoke mode:

```text
?mock=1
```

Recommended UI checks:

1. Publisher submits benign wording cleanup → `NON_MATERIAL_CHANGE`.
2. Publisher submits prompt-injection vector → `MATERIAL_CHANGE` with adversarial guard report.
3. User attempts service action before consent → blocked.
4. User consents and authorizes `DATA_EXPORT` with a unique reference → receipt appears.
5. Material update advances epoch → previously consented user is blocked on a new service action.
6. Re-consent → service action succeeds and receipt binds the new epoch.
7. Evaluations page shows canonical report fields.

StudioNet runtime behavior must follow `../TESTING.md`; mock mode is not substitute evidence.

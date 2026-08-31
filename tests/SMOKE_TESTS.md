# ConsentGuard smoke vectors

These vectors are intended for `?mock=1` local browser checks and fresh StudioNet verification.

## Non-material update

Baseline meaning stays the same; only wording/punctuation is cleaned up.

Expected:

```text
NON_MATERIAL_CHANGE
active_version += 1
consent_epoch unchanged
existing consent remains valid
```

## Material update

Use:

```text
Users may access the service for personal or commercial purposes. Cancellation now incurs a 25% fee. The provider may share account information with business partners. Users retain ownership of submitted content.
```

Expected:

```text
MATERIAL_CHANGE
active_version += 1
consent_epoch += 1
old consent becomes invalid
protected_action() reverts until renewed consent
```

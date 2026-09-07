---
name: verify-work
description: Define the evidence needed to verify a coding or workflow result proportionally to risk. Use before accepting non-trivial completion, especially when target behavior, migrations, security, persistence, concurrency, or release readiness matter.
---

# Verify Work

Treat worker reports as evidence inputs, not final truth.

Match verification depth to risk:
- low: focused deterministic checks may be sufficient;
- medium/high: use fresh independent verification when it can catch material errors;
- critical: require stronger target evidence and explicit authority where appropriate.

Distinguish readiness levels: implemented, validated_local, validated_target, released, accepted.
A lower-level check must not silently satisfy a higher-level acceptance requirement.

Use native Codex review, tests, terminal and subagents rather than duplicating those surfaces.

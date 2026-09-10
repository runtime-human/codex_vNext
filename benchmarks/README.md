# Benchmark policy

Benchmarks compare materially different implementation candidates without turning noisy wall-clock measurements into correctness gates.

Rules:

- correctness first: candidate outputs must exactly match the production reference for the scenario corpus;
- A is the current production/reference behavior; B/C are bounded alternatives;
- deterministic work metrics such as resolver calls and bytes hashed are primary efficiency evidence;
- median/p95 wall time is secondary evidence and must not fail normal CI by itself;
- adversarial stale/missing/unverifiable distributions are included, not only happy paths;
- benchmark code does not alter production behavior;
- generated JSON lives in workflow artifacts under `evidence/generated/`, not as hand-written benchmark claims;
- a production change still requires RED contract tests before implementation;
- PH-03 does not make token/economic savings claims; those remain a PH-06 concern.

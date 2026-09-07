# PH-01 Plugin Foundation + Domain Contracts Implementation Plan

> **For agentic workers:** implement this plan task-by-task. Use fresh review boundaries between tasks. Do not enter PH-02. If using isolated execution, use native Codex worktree mechanisms rather than inventing a worktree manager.

**Goal:** Create the production-grade minimal Codex Workflow Next plugin foundation, typed domain contracts and foundational Skills without persistence, hooks, Board or orchestration runtime.

**Architecture:** Single-package Node.js/TypeScript plugin. `.codex-plugin/plugin.json` exposes only Skills in PH-01. Domain schemas are pure TypeScript/Zod and persistence-free. `TaskEnvelope + RolePayload + TaskDelta` is frozen as the V1 worker-transfer contract; state transitions/completion rules are pure deterministic functions.

**Tech Stack:** Node.js 24 LTS, TypeScript strict ESM, npm lockfile, Zod, Vitest, Biome (formatter/linter), native Codex plugin/Skills.

**Spec:** `CODEX_WORKFLOW_NEXT_MASTER_PLAN_REV4.md` (`MILE-01`, `DOM-*`, `SKL-01..03`, `ADR-04..08`) and `CODEX_WORKFLOW_NEXT_ROADMAP_REV2.md` (`PH-01`, `GATE-01`).

## Global Constraints

- PH-00 is complete as `PASS_WITH_AMENDMENTS`; do not repeat global capability research.
- No SQLite, MCP production server, Hooks, Board, Context Companion runtime, routing engine, benchmark runner or durable DAG in PH-01.
- No private Codex session/rollout APIs.
- No Python runtime dependency.
- Plugin production package in PH-01 must work with Skills only.
- Permanent `AGENTS.md` stays small; procedures live in Skills.
- Do not copy upstream `codex_workflow` prompts/code; preserve clean-room provenance.
- Task-transfer domain is `TaskEnvelope + RolePayload + TaskDelta + TaskId`, not monolithic TaskCapsule.
- No implicit/default fork mode is encoded into domain contracts; runtime explicit `fork_turns=none` integration belongs PH-04.
- All deterministic code follows test-first implementation.
- `package.json` remains `private: true` and `license: UNLICENSED` until public licensing is explicitly decided.

## Execution Status (2026-09-07)

- Tasks 1-8 complete; focused checks and planned commits recorded.
- PH-01 gate: PASS (`npm clean-install`, `npm run check`, 24 tests, plugin validation, clean `dist/domain` build, Desktop/CLI smoke 4/4).
- Amendment: `DecisionAlternative`, referenced but undefined by Master DOM-13, is frozen as the strict minimal object `{ label: string; description: string }`.
- Compatibility resolution: Biome configuration migrated to installed schema 2.5.12 while retaining the recommended rules preset.
- Compatibility resolution: TypeScript 7 build config sets `rootDir: ./src` so output remains under `dist/domain`.
- Document-map correction: the final current-plan link targets `docs/plans/PH-01-plugin-foundation.md`.

---

## 1. Final PH-01 File Map

```text
.
├── .codex-plugin/
│   └── plugin.json
├── AGENTS.md
├── skills/
│   ├── orchestrate-work/
│   │   └── SKILL.md
│   ├── task-envelope/
│   │   └── SKILL.md
│   └── verify-work/
│       └── SKILL.md
├── src/
│   └── domain/
│       ├── ids.ts
│       ├── project.ts
│       ├── run.ts
│       ├── work-item.ts
│       ├── agents.ts
│       ├── authority.ts
│       ├── acceptance.ts
│       ├── evidence.ts
│       ├── decision.ts
│       ├── context.ts
│       ├── task-envelope.ts
│       ├── policy-trace.ts
│       ├── transitions.ts
│       └── index.ts
├── scripts/
│   └── validate-plugin.mjs
├── tests/
│   ├── contract/
│   │   ├── domain-roundtrip.test.ts
│   │   ├── task-envelope.test.ts
│   │   ├── transitions.test.ts
│   │   └── skill-trigger-fixtures.test.ts
│   └── fixtures/
│       └── skill-prompts.ts
├── docs/
│   ├── architecture/
│   │   └── domain-contracts-v1.md
│   ├── compatibility/
│   │   └── ph00-baseline.md
│   └── plans/
│       └── PH-01-plugin-foundation.md
├── PROVENANCE.md
├── biome.json
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.build.json
└── vitest.config.ts
```

Existing PH-00 reports may remain wherever currently stored; `docs/compatibility/ph00-baseline.md` is a short project-local pointer/summary, not a rewrite of evidence.

---

## 2. Domain Interfaces Frozen by PH-01

### IDs

```ts
export const ProjectIdSchema = z.string().min(1);
export const RunIdSchema = z.string().min(1);
export const WorkItemIdSchema = z.string().min(1);
export const TaskIdSchema = z.string().min(1);
export const EvidenceIdSchema = z.string().min(1);
export const DecisionIdSchema = z.string().min(1);
export const ContextIdSchema = z.string().min(1);
```

IDs remain opaque strings in PH-01. Generation strategy belongs state/runtime phases.

### AgentRole / ModelProfile

```ts
export const AgentRoleSchema = z.enum([
  'context_companion',
  'investigator',
  'builder',
  'specialist',
  'verifier',
  'docs_steward',
]);

export const ModelProfileSchema = z.enum([
  'efficient',
  'balanced',
  'deep',
  'critical',
]);
```

### AuthorityEnvelope

```ts
export const AuthorityEnvelopeSchema = z.object({
  write: z.enum(['none', 'bounded']),
  network: z.enum(['inherit', 'none', 'bounded']),
  destructive: z.boolean(),
  mayCreateTests: z.boolean(),
  maxRetries: z.number().int().min(0).max(10),
  preferredProfile: ModelProfileSchema,
  allowEscalationTo: ModelProfileSchema.optional(),
}).strict();
```

PH-01 validates shape only. EffectiveAuthority enforcement belongs PH-05.

### Readiness / Acceptance

```ts
export const ReadinessLevelSchema = z.enum([
  'implemented',
  'validated_local',
  'validated_target',
  'released',
  'accepted',
]);

export const EvidenceKindSchema = z.enum([
  'test',
  'build',
  'lint',
  'review',
  'git',
  'artifact',
  'source',
  'manual',
  'target_observation',
]);

export const AcceptanceSpecSchema = z.object({
  requiredLevel: ReadinessLevelSchema,
  criteria: z.array(z.string().min(1)).min(1),
  requiredEvidenceKinds: z.array(EvidenceKindSchema),
}).strict();
```

### ContextRef / EvidenceRef

```ts
export const ContextRefSchema = z.object({
  uri: z.string().min(1),
  summary: z.string().min(1),
  sourceHash: z.string().min(1).optional(),
  gitSha: z.string().min(1).optional(),
}).strict();

export const EvidenceRefSchema = z.object({
  evidenceId: EvidenceIdSchema,
  summary: z.string().min(1),
}).strict();
```

### ReturnContract

```ts
export const ReturnContractSchema = z.object({
  mode: z.enum(['compact', 'normal', 'material']),
  includeEvidenceRefs: z.boolean(),
  reportBlockersImmediately: z.boolean(),
  intermediatePolicy: z.literal('decision_changing_only'),
}).strict();
```

### TaskEnvelope

```ts
export const TaskEnvelopeSchema = z.object({
  envelopeVersion: z.literal(1),
  taskId: TaskIdSchema,
  workItemId: WorkItemIdSchema.optional(),
  role: AgentRoleSchema,
  objective: z.string().min(1),
  expectedOutcome: z.string().min(1),
  writableScope: z.array(z.string().min(1)),
  protectedScope: z.array(z.string().min(1)),
  constraints: z.array(z.string().min(1)),
  contextRefs: z.array(ContextRefSchema),
  relevantDecisions: z.array(EvidenceRefSchema),
  acceptance: AcceptanceSpecSchema,
  authority: AuthorityEnvelopeSchema,
  returnContract: ReturnContractSchema,
}).strict().superRefine((value, ctx) => {
  if (value.authority.write === 'bounded' && value.writableScope.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['writableScope'],
      message: 'bounded write authority requires at least one writable scope',
    });
  }
});
```

### RolePayload

```ts
const ContextRolePayloadSchema = z.object({
  kind: z.literal('context'),
  questions: z.array(z.string().min(1)).min(1),
  scopes: z.array(z.string().min(1)).min(1),
}).strict();

const ResearchRolePayloadSchema = z.object({
  kind: z.literal('research'),
  questions: z.array(z.string().min(1)).min(1),
  sourcePolicy: z.enum(['official_first', 'mixed', 'provided_only']),
}).strict();

const ImplementationRolePayloadSchema = z.object({
  kind: z.literal('implementation'),
  changeIntent: z.array(z.string().min(1)).min(1),
  focusedChecks: z.array(z.string().min(1)),
}).strict();

const VerificationRolePayloadSchema = z.object({
  kind: z.literal('verification'),
  claimsToVerify: z.array(z.string().min(1)).min(1),
  independenceRequired: z.boolean(),
}).strict();

const DocumentationRolePayloadSchema = z.object({
  kind: z.literal('documentation'),
  artifacts: z.array(z.string().min(1)).min(1),
  settledDecisionRefs: z.array(EvidenceRefSchema),
}).strict();

export const RolePayloadSchema = z.discriminatedUnion('kind', [
  ContextRolePayloadSchema,
  ResearchRolePayloadSchema,
  ImplementationRolePayloadSchema,
  VerificationRolePayloadSchema,
  DocumentationRolePayloadSchema,
]);
```

### TaskPacket

```ts
export const TaskPacketSchema = z.object({
  envelope: TaskEnvelopeSchema,
  payload: RolePayloadSchema,
}).strict().superRefine((value, ctx) => {
  const allowedKindsByRole: Record<string, string[]> = {
    context_companion: ['context'],
    investigator: ['research'],
    builder: ['implementation'],
    specialist: ['implementation', 'research', 'context'],
    verifier: ['verification'],
    docs_steward: ['documentation'],
  };

  if (!allowedKindsByRole[value.envelope.role].includes(value.payload.kind)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['payload', 'kind'],
      message: `payload kind ${value.payload.kind} is not valid for role ${value.envelope.role}`,
    });
  }
});
```

### TaskDelta

```ts
export const TaskDeltaSchema = z.object({
  deltaVersion: z.literal(1),
  taskId: TaskIdSchema,
  changedObjective: z.string().min(1).optional(),
  addConstraints: z.array(z.string().min(1)).optional(),
  removeConstraints: z.array(z.string().min(1)).optional(),
  addContextRefs: z.array(ContextRefSchema).optional(),
  addEvidenceRefs: z.array(EvidenceRefSchema).optional(),
  changedAcceptance: AcceptanceSpecSchema.optional(),
  note: z.string().min(1).optional(),
}).strict().superRefine((value, ctx) => {
  const hasChange = Object.entries(value).some(
    ([key, field]) => !['deltaVersion', 'taskId'].includes(key) && field !== undefined,
  );
  if (!hasChange) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'TaskDelta must contain at least one change' });
  }
});
```

---

# 3. WorkItem State Machine

PH-01 state machine is pure domain logic only.

Allowed transitions:

```text
ready → running | cancelled
running → verifying | needs_decision | needs_review | blocked | cancelled
verifying → running | needs_decision | needs_review | blocked | done | cancelled
needs_decision → ready | running | blocked | cancelled
needs_review → running | verifying | blocked | done | cancelled
blocked → ready | running | cancelled

done → no transitions
cancelled → no transitions
```

Additional invariant:

- `done` requires completion validation input; `SubagentStop` or `worker returned` is never sufficient by itself.

Pure API:

```ts
export function canTransition(from: WorkItemState, to: WorkItemState): boolean;

export interface CompletionContext {
  requiredLevel: ReadinessLevel;
  achievedLevel: ReadinessLevel;
  requiredEvidenceKinds: EvidenceKind[];
  availableEvidenceKinds: EvidenceKind[];
  unresolvedRequiredDecision: boolean;
}

export function validateCompletion(context: CompletionContext):
  | { ok: true }
  | { ok: false; reasons: string[] };
```

Readiness ordering:

```text
implemented
< validated_local
< validated_target
< released
< accepted
```

---

# 4. Foundational Skill Contracts

PH-01 ships only three production Skills. `recover-work` and `workflow-status` are deferred to PH-02 because they require real state/MCP; the plugin must not advertise capabilities that do not exist.

## `orchestrate-work`

`skills/orchestrate-work/SKILL.md` must contain this semantic contract:

```markdown
---
name: orchestrate-work
description: Choose the smallest useful Codex work topology for a substantive coding or research task. Use when deciding whether to work directly, delegate bounded work, isolate writes, investigate externally, or require independent verification. Do not use for trivial direct edits that already have an obvious path.
---

# Orchestrate Work

Keep the current main Codex thread responsible for user intent, architecture, integration, and final claims.

Prefer direct execution when delegation has no concrete isolation, specialization, parallelism, or verification benefit.

When delegation is useful:
- define bounded ownership and acceptance;
- use the task-envelope Skill to produce a self-contained packet;
- prefer fresh worker context for Workflow Next workers;
- keep writes conservative when scopes or runtime resources can conflict;
- do not create nested management hierarchies;
- request independent verification proportionally to risk.

Batch independent work only when all items inform the same main-owned decision and there is no dependency, write overlap, or known runtime collision.

Do not claim token/cost savings from delegation without eval evidence.
```

## `task-envelope`

```markdown
---
name: task-envelope
description: Create or update a bounded self-contained worker assignment for Codex subagents using TaskEnvelope, role-specific payload, stable TaskId, and delta-only follow-ups. Use immediately before substantive delegation or when changing an existing delegated task.
---

# Task Envelope

Create a stable TaskId that is independent of native Codex thread IDs.

For the initial dispatch produce:
1. TaskEnvelope: objective, expected outcome, writable/protected scope, constraints, relevant context/evidence pointers, acceptance, authority, return contract.
2. Exactly one role-specific payload appropriate to the worker.

The initial packet must be self-contained for a fresh worker. Do not copy the parent conversation or hidden reasoning.

For follow-ups, preserve the TaskId and send only a TaskDelta containing information that changed. Do not repeat unchanged context.

Task authority may only narrow user/project/native authority.
```

## `verify-work`

```markdown
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
```

---

# 5. Detailed Tasks

### Task 1: Establish production package/toolchain

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `vitest.config.ts`
- Create: `biome.json`

**Interfaces:**
- Produces standard scripts used by every later task: `build`, `typecheck`, `test`, `lint`, `format`, `validate:plugin`, `check`.

- [ ] **Step 1: Initialize the package without publishing metadata**

Run:

```powershell
npm init -y
npm pkg set name="codex-workflow-next"
npm pkg set version="0.1.0-alpha.1"
npm pkg set private=true --json
npm pkg set license="UNLICENSED"
npm pkg set type="module"
npm pkg set engines.node=">=24 <25"
```

Expected: `package.json` exists and package is private.

- [ ] **Step 2: Install exact development/runtime dependencies**

Run:

```powershell
npm install --save-exact zod
npm install --save-dev --save-exact typescript vitest @vitest/coverage-v8 @biomejs/biome
```

Expected: `package-lock.json` locks exact installed versions.

- [ ] **Step 3: Add scripts**

Set:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "lint": "biome check .",
    "format": "biome format --write .",
    "validate:plugin": "node ./scripts/validate-plugin.mjs",
    "check": "npm run typecheck && npm test && npm run lint && npm run validate:plugin"
  }
}
```

- [ ] **Step 4: Create strict TypeScript configs**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

Install Node types because the config references them:

```powershell
npm install --save-dev --save-exact @types/node
```

`tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 5: Configure Vitest and Biome**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts'],
    },
  },
});
```

`biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "always" } },
  "files": { "includes": ["**", "!dist", "!coverage", "!spikes"] }
}
```

If the installed Biome rejects the schema URL/version, run `npx biome init`, preserve the same behavioral settings, and commit the generated current schema. This is compatibility resolution, not feature scope change.

- [ ] **Step 6: Verify baseline**

Run:

```powershell
npm run typecheck
npm test
npm run lint
```

Expected: commands succeed even with zero tests/source or only report no tests according to current Vitest behavior; if Vitest exits non-zero for no tests, create `tests/contract/bootstrap.test.ts` with `expect(true).toBe(true)` and remove it after Task 3 adds real tests.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json tsconfig.json tsconfig.build.json vitest.config.ts biome.json tests
 git commit -m "build: establish PH-01 TypeScript toolchain"
```

---

### Task 2: Create minimal native Codex plugin and project instruction map

**Files:**
- Create: `.codex-plugin/plugin.json`
- Create: `AGENTS.md`
- Create: `scripts/validate-plugin.mjs`
- Create: `PROVENANCE.md`
- Create: `docs/compatibility/ph00-baseline.md`

**Interfaces:**
- Produces plugin manifest consumed by local marketplace.
- `validate-plugin.mjs` validates PH-01's intentionally Skills-only surface.

- [ ] **Step 1: Write failing plugin validation contract test through script fixture**

Create `scripts/validate-plugin.mjs` with validation implemented in Step 3. First create a deliberately missing manifest state and run:

```powershell
node ./scripts/validate-plugin.mjs
```

Expected before manifest creation: exit non-zero with a clear `.codex-plugin/plugin.json` missing message.

- [ ] **Step 2: Create manifest**

`.codex-plugin/plugin.json`:

```json
{
  "name": "codex-workflow-next",
  "version": "0.1.0-alpha.1",
  "description": "Adaptive bounded workflow contracts for Codex.",
  "skills": "./skills/"
}
```

Do not declare hooks, MCP or UI in PH-01.

- [ ] **Step 3: Implement deterministic manifest validation**

`scripts/validate-plugin.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, '.codex-plugin', 'plugin.json');

function fail(message) {
  console.error(`plugin validation failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(manifestPath)) fail('.codex-plugin/plugin.json is missing');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
for (const key of ['name', 'version', 'description', 'skills']) {
  if (typeof manifest[key] !== 'string' || manifest[key].length === 0) {
    fail(`manifest field ${key} must be a non-empty string`);
  }
}

for (const forbidden of ['hooks', 'mcp', 'apps']) {
  if (forbidden in manifest) fail(`PH-01 must not declare ${forbidden}`);
}

const skillsRoot = path.resolve(root, manifest.skills);
if (!skillsRoot.startsWith(root)) fail('skills path escapes repository root');
if (!fs.existsSync(skillsRoot)) fail('skills directory is missing');

const expectedSkills = ['orchestrate-work', 'task-envelope', 'verify-work'];
for (const skill of expectedSkills) {
  const skillFile = path.join(skillsRoot, skill, 'SKILL.md');
  if (!fs.existsSync(skillFile)) fail(`missing skill ${skill}`);
}

console.log('plugin validation passed');
```

- [ ] **Step 4: Create compact `AGENTS.md`**

```markdown
# Codex Workflow Next development invariants

- Main thread owns final architecture, integration and user-visible claims.
- Follow the current phase plan; do not implement later phases early.
- Prefer native Codex primitives over custom runtime equivalents.
- Keep permanent instructions small; procedures belong in Skills.
- Repository code/docs/ADR are durable truth; generated context is secondary.
- Do not copy unlicensed upstream prompts/code; update PROVENANCE.md for external ideas/code.
- Do not weaken validation, sandbox or authority to reduce usage.

Architecture: `CODEX_WORKFLOW_NEXT_MASTER_PLAN_REV4.md`
Roadmap: `CODEX_WORKFLOW_NEXT_ROADMAP_REV2.md`
Current plan: `CODEX_WORKFLOW_PH01_IMPLEMENTATION_PLAN.md`
PH-00 evidence: `docs/compatibility/ph00-baseline.md`
```

- [ ] **Step 5: Create provenance baseline**

`PROVENANCE.md`:

```markdown
# Provenance

## Clean-room rule

Workflow Next may independently implement architectural ideas observed in external projects. Do not copy prompt text, source code, templates or installer/runtime files unless a compatible license is explicitly verified.

## Current external references

| Source | Use | Code reuse |
|---|---|---|
| viettran-edgeAI/codex_workflow experiment v1.1.14 / a224f32c423ef56be322de160d5440bba0a786b2 | architecture/eval hypotheses | prohibited unless license changes |
| openai/codex | public implementation/tests used to understand Codex behavior | follow repository license for any actual code reuse; PH-01 copies no code |
| OpenAI Codex documentation | host/plugin contracts | documentation reference |

PH-01 contains independently written schemas, Skills and tests.
```

- [ ] **Step 6: Record PH-00 baseline pointer**

`docs/compatibility/ph00-baseline.md`:

```markdown
# PH-00 compatibility baseline

Evidence date: 2026-09-06.

- Windows 11 build 26200.
- Desktop 26.901.1978.0 tested; latest-stable status not proven by PH-00.
- CLI 0.153.4.
- Plugin/Skills/MCP read contract passed.
- Inline/fullscreen/follow-up passed; `_meta` is not a production guarantee.
- Windows hooks are degraded; hook `PLUGIN_DATA` write failed EPERM.
- Explicit `fork_turns=none` worker subset passed task/result 3/3, delta follow-up and two siblings.
- Descendant public token attribution is partial.
- Sidebar is unsupported publicly for V1.

Before PH-02 run the targeted MCP `${PLUGIN_DATA}` storage probe defined by Roadmap TP-02A.
```

- [ ] **Step 7: Validation**

After Task 5 creates Skills, run:

```powershell
npm run validate:plugin
```

Before Task 5 it is expected to fail only because Skills are intentionally not created yet; do not weaken the validator.

- [ ] **Step 8: Commit non-Skill foundation**

```powershell
git add .codex-plugin AGENTS.md scripts/validate-plugin.mjs PROVENANCE.md docs/compatibility/ph00-baseline.md
 git commit -m "feat: add minimal Codex plugin foundation"
```

---

### Task 3: Implement core IDs, roles, authority, acceptance and evidence schemas

**Files:**
- Create: `src/domain/ids.ts`
- Create: `src/domain/agents.ts`
- Create: `src/domain/authority.ts`
- Create: `src/domain/acceptance.ts`
- Create: `src/domain/evidence.ts`
- Test: `tests/contract/domain-roundtrip.test.ts`

**Interfaces:**
- Produces schemas imported by every later domain file.

- [ ] **Step 1: Write failing tests**

Create tests covering:

```ts
import { describe, expect, it } from 'vitest';
import {
  AcceptanceSpecSchema,
  AgentRoleSchema,
  AuthorityEnvelopeSchema,
  EvidenceSchema,
  ModelProfileSchema,
} from '../../src/domain/index.js';

describe('core domain contracts', () => {
  it('accepts stable semantic roles and profiles', () => {
    expect(AgentRoleSchema.parse('builder')).toBe('builder');
    expect(ModelProfileSchema.parse('balanced')).toBe('balanced');
  });

  it('rejects excessive retry budgets', () => {
    expect(() => AuthorityEnvelopeSchema.parse({
      write: 'none', network: 'none', destructive: false,
      mayCreateTests: false, maxRetries: 11, preferredProfile: 'efficient',
    })).toThrow();
  });

  it('requires at least one acceptance criterion', () => {
    expect(() => AcceptanceSpecSchema.parse({
      requiredLevel: 'validated_local', criteria: [], requiredEvidenceKinds: ['test'],
    })).toThrow();
  });

  it('round-trips evidence without adding fields', () => {
    const value = {
      evidenceId: 'ev-1', kind: 'test', summary: 'unit suite', status: 'pass',
      createdAt: '2026-09-06T00:00:00Z',
    };
    expect(EvidenceSchema.parse(value)).toEqual(value);
  });
});
```

- [ ] **Step 2: Verify RED**

```powershell
npm test -- domain-roundtrip
```

Expected: imports/schemas missing.

- [ ] **Step 3: Implement schemas exactly as section 2 defines**

Create the five files with Zod schemas and inferred exported TypeScript types using:

```ts
export type AgentRole = z.infer<typeof AgentRoleSchema>;
```

for each schema.

`EvidenceSchema`:

```ts
export const EvidenceSchema = z.object({
  evidenceId: EvidenceIdSchema,
  workItemId: WorkItemIdSchema.optional(),
  kind: EvidenceKindSchema,
  summary: z.string().min(1),
  status: z.enum(['pass', 'fail', 'partial', 'unknown']),
  sourceUri: z.string().min(1).optional(),
  command: z.string().min(1).optional(),
  exitCode: z.number().int().optional(),
  gitSha: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
}).strict();
```

- [ ] **Step 4: Export from temporary `src/domain/index.ts`**

Create exports for implemented modules; this file will expand in later tasks.

- [ ] **Step 5: Verify GREEN**

```powershell
npm test -- domain-roundtrip
npm run typecheck
```

- [ ] **Step 6: Commit**

```powershell
git add src/domain tests/contract/domain-roundtrip.test.ts
 git commit -m "feat: add core workflow domain schemas"
```

---

### Task 4: Implement project/run/work-item/decision/context/policy schemas

**Files:**
- Create: `src/domain/project.ts`
- Create: `src/domain/run.ts`
- Create: `src/domain/work-item.ts`
- Create: `src/domain/decision.ts`
- Create: `src/domain/context.ts`
- Create: `src/domain/policy-trace.ts`
- Modify: `src/domain/index.ts`
- Test: `tests/contract/domain-roundtrip.test.ts`

**Interfaces:**
- Produces the core state shapes later consumed by PH-02 persistence.

- [ ] **Step 1: Extend failing tests**

Test strict parsing, enum states, version positive integer, stale context and policy trace.

Use this PolicyTrace contract:

```ts
export const PolicyTraceSchema = z.object({
  traceVersion: z.literal(1),
  decision: z.enum(['direct', 'delegate', 'delegate_batch', 'blocked']),
  signals: z.array(z.string().min(1)),
  capabilities: z.array(z.enum([
    'context_companion', 'investigator', 'builder', 'verifier', 'worktree', 'durable',
  ])),
  reasons: z.array(z.string().min(1)).min(1),
}).strict();
```

- [ ] **Step 2: Run RED**

```powershell
npm test -- domain-roundtrip
```

- [ ] **Step 3: Implement minimal schemas**

Use Master `DOM-01..05`, `DOM-13..15`. Keep all files persistence-free.

- [ ] **Step 4: Run GREEN**

```powershell
npm test -- domain-roundtrip
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/domain tests/contract/domain-roundtrip.test.ts
 git commit -m "feat: define workflow state contracts"
```

---

### Task 5: Implement TaskEnvelope, RolePayload and TaskDelta contracts

**Files:**
- Create: `src/domain/task-envelope.ts`
- Modify: `src/domain/index.ts`
- Test: `tests/contract/task-envelope.test.ts`

**Interfaces:**
- Produces `TaskEnvelopeSchema`, `RolePayloadSchema`, `TaskPacketSchema`, `TaskDeltaSchema`, `ReturnContractSchema`, `ContextRefSchema`, `EvidenceRefSchema`.

- [ ] **Step 1: Write failing tests for the exact H0-derived invariants**

Required tests:

```ts
it('rejects bounded write with no writable scope', ...)
it('allows read-only context companion packet', ...)
it('rejects verification payload for builder role', ...)
it('requires TaskDelta to contain a real change', ...)
it('rejects unknown fields to avoid silent protocol drift', ...)
it('round-trips a self-contained implementation packet', ...)
```

Implementation packet fixture:

```ts
const packet = {
  envelope: {
    envelopeVersion: 1,
    taskId: 'task-17',
    role: 'builder',
    objective: 'Add validation for workflow IDs',
    expectedOutcome: 'Invalid empty IDs are rejected by domain schemas',
    writableScope: ['src/domain/**', 'tests/contract/**'],
    protectedScope: ['.github/**'],
    constraints: ['Do not add persistence'],
    contextRefs: [{ uri: 'CODEX_WORKFLOW_NEXT_MASTER_PLAN_REV4.md#dom-06', summary: 'Task protocol' }],
    relevantDecisions: [],
    acceptance: {
      requiredLevel: 'validated_local',
      criteria: ['domain tests pass'],
      requiredEvidenceKinds: ['test'],
    },
    authority: {
      write: 'bounded', network: 'none', destructive: false,
      mayCreateTests: true, maxRetries: 1, preferredProfile: 'balanced',
    },
    returnContract: {
      mode: 'compact', includeEvidenceRefs: true,
      reportBlockersImmediately: true,
      intermediatePolicy: 'decision_changing_only',
    },
  },
  payload: {
    kind: 'implementation',
    changeIntent: ['add schema validation'],
    focusedChecks: ['npm test -- task-envelope'],
  },
};
```

- [ ] **Step 2: Verify RED**

```powershell
npm test -- task-envelope
```

- [ ] **Step 3: Implement schemas exactly as section 2**

Do not add runtime `fork_turns`, native thread ID or model-provider ID to TaskEnvelope. Those are execution metadata, not semantic transfer contract.

- [ ] **Step 4: Verify GREEN and strictness**

```powershell
npm test -- task-envelope
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/domain/task-envelope.ts src/domain/index.ts tests/contract/task-envelope.test.ts
 git commit -m "feat: add bounded task transfer protocol"
```

---

### Task 6: Implement pure transition and completion invariants

**Files:**
- Create: `src/domain/transitions.ts`
- Modify: `src/domain/index.ts`
- Test: `tests/contract/transitions.test.ts`

**Interfaces:**
- Produces `canTransition`, `validateCompletion`, `compareReadiness`.

- [ ] **Step 1: Write failing transition matrix tests**

Test every allowed terminal/non-terminal edge, not only examples.

Representative:

```ts
expect(canTransition('ready', 'running')).toBe(true);
expect(canTransition('ready', 'done')).toBe(false);
expect(canTransition('done', 'running')).toBe(false);
```

- [ ] **Step 2: Write failing completion tests**

```ts
it('rejects validated_local when validated_target is required', ...)
it('rejects missing required evidence kind', ...)
it('rejects unresolved required decision', ...)
it('accepts completion when level and evidence satisfy contract', ...)
```

- [ ] **Step 3: Run RED**

```powershell
npm test -- transitions
```

- [ ] **Step 4: Implement minimal pure functions**

No database, clock or filesystem access.

`compareReadiness` maps levels to explicit ordinal table:

```ts
const readinessRank = {
  implemented: 0,
  validated_local: 1,
  validated_target: 2,
  released: 3,
  accepted: 4,
} as const;
```

`validateCompletion` accumulates deterministic reason strings:

- `required readiness level not achieved`;
- `missing evidence kind: <kind>`;
- `required decision remains unresolved`.

- [ ] **Step 5: Verify GREEN**

```powershell
npm test -- transitions
npm run typecheck
```

- [ ] **Step 6: Commit**

```powershell
git add src/domain/transitions.ts src/domain/index.ts tests/contract/transitions.test.ts
 git commit -m "feat: enforce workflow completion invariants"
```

---

### Task 7: Add foundational Skills and trigger fixtures

**Files:**
- Create: `skills/orchestrate-work/SKILL.md`
- Create: `skills/task-envelope/SKILL.md`
- Create: `skills/verify-work/SKILL.md`
- Create: `tests/fixtures/skill-prompts.ts`
- Create: `tests/contract/skill-trigger-fixtures.test.ts`

**Interfaces:**
- Plugin validator expects exactly these three PH-01 Skills.

- [ ] **Step 1: Create prompt classification fixture**

`tests/fixtures/skill-prompts.ts`:

```ts
export const skillPromptFixtures = [
  { prompt: 'Fix the typo in README line 4', expected: [] },
  { prompt: 'Decide whether this refactor should be delegated and verified', expected: ['orchestrate-work'] },
  { prompt: 'Prepare a bounded assignment for a fresh builder to change auth validation', expected: ['task-envelope'] },
  { prompt: 'Verify whether this migration is actually safe for production', expected: ['verify-work'] },
] as const;
```

This deterministic test documents intended trigger classes; actual model trigger behavior is validated by live smoke in Step 5.

- [ ] **Step 2: Create three Skills with the exact content from section 4**

Do not add recover/status Skills yet.

- [ ] **Step 3: Add structural tests**

Test that each SKILL frontmatter has unique `name` and description, and each file stays below a local PH-01 budget of 120 non-empty lines. The number is a repository hygiene ceiling, not a model-performance claim.

- [ ] **Step 4: Run package validation**

```powershell
npm run validate:plugin
npm test -- skill-trigger-fixtures
```

Expected: pass.

- [ ] **Step 5: Live local marketplace smoke**

Using the supported local marketplace path proven by PH-00:

1. install/reload the production PH-01 plugin;
2. start a fresh Codex Desktop chat;
3. run one representative positive prompt per Skill and one trivial negative prompt;
4. repeat minimal smoke in CLI;
5. record result in `docs/compatibility/ph01-smoke.md`.

Required record fields:

```text
Date
Desktop build
CLI version
Prompt
Expected Skill
Observed Skill
Pass/fail
```

No use of private transcript inspection.

- [ ] **Step 6: Commit**

```powershell
git add skills tests docs/compatibility/ph01-smoke.md
 git commit -m "feat: add foundational workflow skills"
```

---

### Task 8: Document Domain V1 and verify clean package

**Files:**
- Create: `docs/architecture/domain-contracts-v1.md`
- Copy/save this plan at: `docs/plans/PH-01-plugin-foundation.md`
- Modify: `PROVENANCE.md` only if implementation added external code/reference not already listed.

**Interfaces:**
- Domain doc becomes human-readable contract for PH-02/03/04 planning.

- [ ] **Step 1: Write domain contract doc**

Must document:

- TaskId is logical, not native thread ID;
- TaskPacket = Envelope + role payload;
- TaskDelta is follow-up-only and cannot be empty;
- Authority is narrowing metadata;
- readiness hierarchy;
- WorkItem transitions;
- no persistence semantics in PH-01;
- no `fork_turns` field inside domain packet;
- no provider/effective model assumptions.

- [ ] **Step 2: Save current executable plan into repo**

Store this file verbatim as `docs/plans/PH-01-plugin-foundation.md` or, if it is already the repository copy, verify path and links.

- [ ] **Step 3: Run full verification**

```powershell
npm clean-install
npm run check
npm run build
```

If `npm clean-install` is unavailable in the installed npm, use the documented equivalent `npm ci`; record which command was used.

Expected:

- clean dependency install;
- typecheck pass;
- all tests pass;
- lint pass;
- plugin validator pass;
- build emits `dist/domain` declarations/JS only;
- no hooks/MCP/UI/state directories required for runtime.

- [ ] **Step 4: Inspect git diff for scope leakage**

Run:

```powershell
git status --short
git diff --stat
git diff
```

Reject any accidental:

- SQLite dependency;
- `.mcp.json` production config;
- hooks;
- Board/UI;
- custom agent runtime;
- benchmark code;
- copied upstream prompt text.

- [ ] **Step 5: Commit docs/final PH-01 state**

```powershell
git add docs PROVENANCE.md
 git commit -m "docs: freeze PH-01 domain contracts"
```

---

# 6. PH-01 Test Matrix

| Test class | Required |
|---|---|
| TypeScript strict typecheck | yes |
| Schema positive/negative tests | yes |
| Unknown-field rejection | yes |
| TaskPacket role/payload compatibility | yes |
| Empty TaskDelta rejection | yes |
| WorkItem transition matrix | yes |
| Readiness ordering | yes |
| Missing evidence completion rejection | yes |
| Unresolved decision completion rejection | yes |
| Plugin manifest structural validation | yes |
| Skill file compactness/unique names | yes |
| Fresh Desktop Skill smoke | yes |
| Fresh CLI Skill smoke | yes |
| MCP/Hook/SQLite tests | no — PH-02 |
| Subagent runtime tests | no — already H0 / PH-03/04 runtime phases |
| Board UI tests | no — PH-07 |

---

# 7. PH-01 Acceptance Gate

PH-01 is `PASS` only when all are true:

- [ ] `.codex-plugin/plugin.json` installs as a Skills-only plugin on the proven local marketplace path.
- [ ] `npm ci`/equivalent clean install succeeds.
- [ ] `npm run check` succeeds.
- [ ] `npm run build` succeeds.
- [ ] all domain schemas are strict and exported.
- [ ] TaskEnvelope + RolePayload + TaskDelta + TaskId contract is tested.
- [ ] bounded write envelope cannot have empty writable scope.
- [ ] role/payload mismatch is rejected.
- [ ] empty TaskDelta is rejected.
- [ ] WorkItem transitions are pure and tested.
- [ ] completion cannot bypass readiness/evidence/decision requirements.
- [ ] three foundational Skills exist and have distinct descriptions.
- [ ] fresh Desktop/CLI Skill smoke is recorded.
- [ ] root AGENTS contains only durable invariants/map.
- [ ] no persistence/hooks/MCP production state/Board/runtime orchestration entered scope.
- [ ] provenance review finds no copied unlicensed upstream content.

If these pass, next action is **TP-02A**, not immediate blind PH-02 implementation.

---

# 8. PH-01 Out-of-scope Findings Protocol

If implementation discovers a host/platform issue:

1. record it in `docs/compatibility/ph01-smoke.md`;
2. classify `blocks PH-01 | blocks later phase | informational`;
3. do not add workaround runtime from later phases;
4. amend Master/Roadmap only if it changes a durable architectural assumption.

Examples:

- Skill reload needs fresh chat → informational/compatibility.
- local marketplace no longer installs Skills-only package → PH-01 blocker.
- hook behavior changed → later PH-02 information only.
- new public sidebar API appears → PH-07 roadmap note only.

---

# 9. Execution Guidance for Codex Sol High

For this phase:

- work task-by-task, not “implement all architecture”;
- use direct execution for small deterministic tasks;
- optional read-only subagent review is allowed, but not required;
- do not create Context Companion/Builder runtime merely to develop the plugin;
- after each task run its focused tests before moving on;
- after Task 8 run the full PH-01 gate;
- final report must list commits, tests, live smoke, deviations and next allowed action.

Expected final report shape:

```text
PH-01 RESULT: PASS | PASS_WITH_AMENDMENT | BLOCKED

Implemented
- ...

Verification
- npm run check: ...
- npm run build: ...
- Desktop Skill smoke: ...
- CLI Skill smoke: ...

Scope audit
- persistence: absent
- hooks: absent
- Board: absent
- orchestration runtime: absent

Deviations
- ...

Next allowed action
- TP-02A targeted MCP storage/hook re-probe
```

# PH-01 Plugin Foundation + Domain Contracts Implementation Plan — Rev 1.3

> **For agentic workers:** implement this plan task-by-task. Use fresh review boundaries between tasks. Do not enter PH-02. If using isolated execution, use native Codex worktree mechanisms rather than inventing a worktree manager.

**Goal:** Create the production-grade minimal Codex Workflow Next plugin foundation, typed domain contracts and foundational Skills without persistence, hooks, Board or orchestration runtime.

**Architecture:** Single-package Node.js/TypeScript plugin. `.codex-plugin/plugin.json` exposes only Skills in PH-01. Domain schemas are pure TypeScript/Zod and persistence-free. `TaskEnvelope + RolePayload + TaskDelta` is frozen as the V1 worker-transfer contract; semantic agent roles are separated from configurable model/runtime mappings; state transitions/completion rules are pure deterministic functions.

**Packaging outcome:** the PH-01 legacy Skills-only package was valid for this
phase. PH-02 live evidence superseded it with Agent Plugins v1 root
`plugin.json` + `mcp.json` for production MCP and `PLUGIN_DATA` injection.

**Tech Stack:** Node.js 24 LTS, TypeScript strict ESM, npm lockfile, Zod, Vitest, Biome (formatter/linter), native Codex plugin/Skills.

**Spec:** `CODEX_WORKFLOW_NEXT_MASTER_PLAN.md` (`MILE-01`, `DOM-*`, `SKL-01..03`, `POL-09`, `POL-14..15`, `ARC-19`, `ADR-04..08`, `ADR-22`, `ADR-25..30`) and `CODEX_WORKFLOW_NEXT_ROADMAP.md` (`PH-01`, `GATE-01`).

## Global Constraints

- PH-00 is complete as `PASS_WITH_AMENDMENTS`; do not repeat global capability research.
- No SQLite, MCP production server, Hooks, Board, Context Companion runtime, routing engine, benchmark runner or durable DAG in PH-01.
- No private Codex session/rollout APIs.
- No Python runtime dependency.
- Plugin production package in PH-01 must work with Skills only.
- No documentation subsystem, docs agent, `DocumentationRolePayload`, mandatory docs refresh or duplicate `docs/` tree.
- Durable project-control artifacts are limited to the canonical Master/Roadmap/current plan, `PROVENANCE.md`, and explicit gate evidence with a real consumer.
- CapabilityPreflight and RunResourceJournal are architectural invariants only in PH-01; their runtime/state implementations belong PH-04 and PH-02 respectively.
- Permanent `AGENTS.md` stays small; procedures live in Skills.
- Do not fork or copy upstream `codex_workflow` prompts/code as the foundation; preserve clean-room provenance. v1.1.15 is a policy/reference/eval input only.
- Task-transfer domain is `TaskEnvelope + RolePayload + TaskDelta + TaskId`, not monolithic TaskCapsule.
- No implicit/default fork mode is encoded into domain contracts; runtime explicit `fork_turns=none` integration belongs PH-04. PH-01 freezes safe agent-profile defaults but does not expose a user config loader yet.
- `Direct / Companion / Investigator` is a later working-context routing policy, not a persisted PH-01 domain entity. PH-01 only updates role semantics: Investigator may cover a bounded local-project or external evidence gap; PH-04 owns runtime routing.
- Delegated-package non-duplication is a policy invariant for PH-04 runtime; PH-01 must not add worker lifecycle state to enforce it.
- All deterministic code follows test-first implementation.
- `workflow-herdr` safety patterns are used only as phase-placement guidance in PH-01: no Herdr dependency, no small/medium/large routing, no Dispatcher hierarchy, no YAML runtime/state files.
- `package.json` remains `private: true` and `license: UNLICENSED` until public licensing is explicitly decided.
- Main model is outside Workflow Next subagent policy. Safe V1 child defaults are Luna `xhigh`/`max`; expensive child models require later explicit user configuration, never implicit escalation.

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
│       ├── agent-runtime.ts
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
├── evidence/
│   └── ph01-skill-smoke.json
├── CODEX_WORKFLOW_NEXT_MASTER_PLAN.md
├── CODEX_WORKFLOW_NEXT_ROADMAP.md
├── CODEX_WORKFLOW_PH01_IMPLEMENTATION_PLAN.md
├── PROVENANCE.md
├── biome.json
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.build.json
└── vitest.config.ts
```

The three Workflow planning files are pre-existing project-control artifacts and are not generated by PH-01. `evidence/ph01-skill-smoke.json` is gate evidence, not a documentation subsystem. No `docs/` tree is created.

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

### AgentRole / AgentRuntimeProfile

```ts
export const AgentRoleSchema = z.enum([
  'context_companion',
  'investigator',
  'executor',
  'senior_executor',
  'verifier',
]);

export const SandboxModeSchema = z.enum(['inherit', 'read-only', 'workspace-write']);
export const NonDefaultModelPolicySchema = z.enum(['disabled', 'explicit_only']);

export const AgentRuntimeProfileSchema = z.object({
  role: AgentRoleSchema,
  enabled: z.boolean(),
  model: z.string().min(1),
  reasoningEffort: z.string().min(1),
  sandboxMode: SandboxModeSchema,
}).strict();

export const AgentProfileSetSchema = z.object({
  defaultSubagent: z.object({
    model: z.string().min(1),
    reasoningEffort: z.string().min(1),
  }).strict(),
  maxConcurrentThreads: z.number().int().min(1).max(20),
  nonDefaultModelPolicy: NonDefaultModelPolicySchema,
  allowedModels: z.array(z.string().min(1)).min(1),
  profiles: z.object({
    context_companion: AgentRuntimeProfileSchema,
    investigator: AgentRuntimeProfileSchema,
    executor: AgentRuntimeProfileSchema,
    senior_executor: AgentRuntimeProfileSchema,
    verifier: AgentRuntimeProfileSchema,
  }).strict(),
}).strict().superRefine((value, ctx) => {
  const expectedRoles = [
    'context_companion', 'investigator', 'executor', 'senior_executor', 'verifier',
  ] as const;

  for (const role of expectedRoles) {
    const profile = value.profiles[role];
    if (profile.role !== role) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['profiles', role, 'role'],
        message: `profile key ${role} must declare the same role`,
      });
    }
    if (!value.allowedModels.includes(profile.model)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['profiles', role, 'model'],
        message: `model ${profile.model} is not in allowedModels`,
      });
    }
    if (value.nonDefaultModelPolicy === 'disabled' && profile.model !== value.defaultSubagent.model) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['profiles', role, 'model'],
        message: 'non-default child model requires nonDefaultModelPolicy=explicit_only',
      });
    }
    if (profile.model === 'gpt-5.6-luna' && !['xhigh', 'max'].includes(profile.reasoningEffort)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['profiles', role, 'reasoningEffort'],
        message: 'Workflow Next V1 does not use Luna below xhigh',
      });
    }
  }
});
```

PH-01 also exports a `DEFAULT_AGENT_PROFILE_SET` constant with these exact defaults:

```ts
{
  defaultSubagent: { model: 'gpt-5.6-luna', reasoningEffort: 'xhigh' },
  maxConcurrentThreads: 4,
  nonDefaultModelPolicy: 'disabled',
  allowedModels: ['gpt-5.6-luna'],
  profiles: {
    context_companion: { role: 'context_companion', enabled: true, model: 'gpt-5.6-luna', reasoningEffort: 'xhigh', sandboxMode: 'read-only' },
    investigator: { role: 'investigator', enabled: true, model: 'gpt-5.6-luna', reasoningEffort: 'xhigh', sandboxMode: 'read-only' },
    executor: { role: 'executor', enabled: true, model: 'gpt-5.6-luna', reasoningEffort: 'max', sandboxMode: 'workspace-write' },
    senior_executor: { role: 'senior_executor', enabled: true, model: 'gpt-5.6-luna', reasoningEffort: 'max', sandboxMode: 'workspace-write' },
    verifier: { role: 'verifier', enabled: true, model: 'gpt-5.6-luna', reasoningEffort: 'xhigh', sandboxMode: 'workspace-write' },
  },
}
```

This is a **domain default**, not yet an accepted user configuration file. PH-04 activates TOML loading/precedence and must prove every exposed setting is consumed. The Main model is never part of this structure.

### DelegationIntent / ResolvedAgentRuntime

```ts
export const DelegationIntentSchema = z.object({
  taskId: TaskIdSchema,
  role: AgentRoleSchema,
  reasonCodes: z.array(z.string().min(1)).min(1),
  freshContext: z.literal(true),
  batchKey: z.string().min(1).optional(),
}).strict();

export const ResolvedAgentRuntimeSchema = z.object({
  role: AgentRoleSchema,
  model: z.string().min(1),
  reasoningEffort: z.string().min(1),
  sandboxMode: SandboxModeSchema,
  source: z.enum(['builtin_default', 'user_config', 'project_config', 'session_override']),
}).strict();
```

`orchestrate-work` chooses `DelegationIntent`; PH-04 config resolution produces `ResolvedAgentRuntime`. PH-01 does not perform runtime mapping.

### AuthorityEnvelope

```ts
export const AuthorityEnvelopeSchema = z.object({
  write: z.enum(['none', 'bounded']),
  network: z.enum(['inherit', 'none', 'bounded']),
  destructive: z.boolean(),
  mayCreateTests: z.boolean(),
  maxRetries: z.number().int().min(0).max(10),
}).strict();
```

PH-01 validates shape only. EffectiveAuthority enforcement belongs PH-05. Model/role selection is intentionally outside AuthorityEnvelope.

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


export const RolePayloadSchema = z.discriminatedUnion('kind', [
  ContextRolePayloadSchema,
  ResearchRolePayloadSchema,
  ImplementationRolePayloadSchema,
  VerificationRolePayloadSchema,
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
    executor: ['implementation'],
    senior_executor: ['implementation'],
    verifier: ['verification'],
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
description: Choose the smallest useful Codex topology and the correct named agent role for a substantive coding or research task. Use when deciding whether to work directly, delegate bounded work, investigate externally, use a difficult implementation worker, isolate writes, batch independent work, or require independent verification.
---

# Orchestrate Work

Keep the current Main responsible for user intent, project architecture, public-contract decisions, cross-package integration, final acceptance, and final claims. Main model selection is controlled by the user, not this Skill.

Prefer direct execution when delegation has no concrete isolation, specialization, parallelism, context-offload, or verification benefit.

When delegation is useful, choose the semantic role before any model/runtime mapping:
- `context_companion`: repeated or bulky local repository context, source cross-reference, or reusable context delta;
- `investigator`: bounded external/current web or documentation research;
- `executor`: bounded implementation with a reasonably clear implementation path;
- `senior_executor`: bounded implementation that requires substantial causal/root-cause, concurrency/state, mathematical/algorithmic, or cross-cutting local reasoning; comparison of several plausible internal solutions; or recovery from an Executor reasoning failure;
- `verifier`: fresh independent acceptance evidence when risk warrants it.

Senior does not own project architecture, public contracts, product trade-offs, ownership expansion, or final acceptance. Escalate those decisions to Main.

For any delegated role:
- define bounded ownership and acceptance;
- use the task-envelope Skill to produce a self-contained packet;
- prefer fresh worker context for Workflow Next workers;
- before substantive topology/resource mutation, resolve required capabilities/permissions/isolation and name a fallback when degraded;
- keep writes conservative when scopes or runtime resources can conflict;
- do not create nested management hierarchies;
- request independent verification proportionally to risk.

Batch independent work only when all items inform the same Main-owned decision and there is no dependency, write overlap, or known runtime collision.

Do not select a provider model directly. PH-04 resolves the selected role through typed configuration. Treat `Direct / Companion / Investigator` as context-routing semantics: keep decision-critical material direct, use Companion for bulky/reusable local context, and use Investigator for one bounded unfamiliar evidence gap over project evidence, Internet sources, or both. No worker may silently upgrade itself to a more expensive provider family; it returns an escalation to Main.

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

Treat worker reports as evidence inputs, not final truth. Native `idle`, child-stop, or a receipt file is a scheduling/completion signal, not acceptance evidence by itself.

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
- Repository code/tests and canonical project-control artifacts are durable truth; generated context is secondary.
- Do not copy unlicensed upstream prompts/code; update PROVENANCE.md for external ideas/code.
- Do not weaken validation, sandbox or authority to reduce usage.

Architecture: `CODEX_WORKFLOW_NEXT_MASTER_PLAN.md`
Roadmap: `CODEX_WORKFLOW_NEXT_ROADMAP.md`
Current plan: `CODEX_WORKFLOW_PH01_IMPLEMENTATION_PLAN.md`
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
| viettran-edgeAI/codex_workflow main experimental v1.1.15 / a596daaee01bffaff9c04c31e85d378b139cd6c7 | policy/context-routing/ownership/eval hypotheses | prohibited unless license permits; do not fork as PH-01 foundation |
| letya999/workflow-herdr dev / b1eab041cf2f97da4605c036900d07ff5426cc40 | operational-safety ideas: preflight, resource journaling, acceptance separation | MIT permits reuse; PH-01 copies no code |
| openai/codex | public implementation/tests used to understand Codex behavior | follow repository license for any actual code reuse; PH-01 copies no code |
| OpenAI Codex documentation | host/plugin contracts | documentation reference |

PH-01 contains independently written schemas, Skills and tests.
```

- [ ] **Step 6: Validation**

After Task 5 creates Skills, run:

```powershell
npm run validate:plugin
```

Before Task 5 it is expected to fail only because Skills are intentionally not created yet; do not weaken the validator.

- [ ] **Step 7: Commit non-Skill foundation**

```powershell
git add .codex-plugin AGENTS.md scripts/validate-plugin.mjs PROVENANCE.md
 git commit -m "feat: add minimal Codex plugin foundation"
```

---

### Task 3: Implement core IDs, roles, authority, acceptance and evidence schemas

**Files:**
- Create: `src/domain/ids.ts`
- Create: `src/domain/agents.ts`
- Create: `src/domain/agent-runtime.ts`
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
  AgentProfileSetSchema,
  AgentRoleSchema,
  AuthorityEnvelopeSchema,
  DEFAULT_AGENT_PROFILE_SET,
  EvidenceSchema,
} from '../../src/domain/index.js';

describe('core domain contracts', () => {
  it('accepts the five stable semantic worker roles', () => {
    expect(AgentRoleSchema.parse('executor')).toBe('executor');
    expect(AgentRoleSchema.parse('senior_executor')).toBe('senior_executor');
  });

  it('freezes safe Luna-first runtime defaults without touching Main', () => {
    const parsed = AgentProfileSetSchema.parse(DEFAULT_AGENT_PROFILE_SET);
    expect(parsed.defaultSubagent).toEqual({ model: 'gpt-5.6-luna', reasoningEffort: 'xhigh' });
    expect(parsed.profiles.executor.reasoningEffort).toBe('max');
    expect(parsed.profiles.senior_executor.model).toBe('gpt-5.6-luna');
    expect(parsed.nonDefaultModelPolicy).toBe('disabled');
    expect(parsed.allowedModels).toEqual(['gpt-5.6-luna']);
  });

  it('rejects accidental Sol or Luna effort below xhigh', () => {
    const accidentalSol = structuredClone(DEFAULT_AGENT_PROFILE_SET);
    accidentalSol.profiles.senior_executor.model = 'gpt-5.6-sol';
    expect(() => AgentProfileSetSchema.parse(accidentalSol)).toThrow();

    const lowLuna = structuredClone(DEFAULT_AGENT_PROFILE_SET);
    lowLuna.profiles.investigator.reasoningEffort = 'medium';
    expect(() => AgentProfileSetSchema.parse(lowLuna)).toThrow();
  });

  it('allows an explicit user-style Sol Senior mapping when policy and allowlist opt in', () => {
    const configured = structuredClone(DEFAULT_AGENT_PROFILE_SET);
    configured.nonDefaultModelPolicy = 'explicit_only';
    configured.allowedModels.push('gpt-5.6-sol');
    configured.profiles.senior_executor.model = 'gpt-5.6-sol';
    configured.profiles.senior_executor.reasoningEffort = 'medium';
    expect(AgentProfileSetSchema.parse(configured).profiles.senior_executor.model).toBe('gpt-5.6-sol');
  });

  it('does not expose a documentation worker role', () => {
    expect(() => AgentRoleSchema.parse('docs_steward')).toThrow();
    expect(() => AgentRoleSchema.parse('senior_executor')).toThrow();
    expect(() => AgentRoleSchema.parse('executor')).toThrow();
  });

  it('rejects excessive retry budgets', () => {
    expect(() => AuthorityEnvelopeSchema.parse({
      write: 'none', network: 'none', destructive: false,
      mayCreateTests: false, maxRetries: 11,
    })).toThrow();
  });

  it('keeps model/runtime selection out of authority', () => {
    expect(() => AuthorityEnvelopeSchema.parse({
      write: 'none', network: 'none', destructive: false,
      mayCreateTests: false, maxRetries: 1, model: 'gpt-5.6-sol',
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

Create the six files with Zod schemas/defaults and inferred exported TypeScript types using:

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
    'context_companion', 'investigator', 'executor', 'verifier', 'worktree', 'durable',
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
it('rejects verification payload for executor role', ...)
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
    role: 'executor',
    objective: 'Add validation for workflow IDs',
    expectedOutcome: 'Invalid empty IDs are rejected by domain schemas',
    writableScope: ['src/domain/**', 'tests/contract/**'],
    protectedScope: ['.github/**'],
    constraints: ['Do not add persistence'],
    contextRefs: [{ uri: 'CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#dom-06', summary: 'Task protocol' }],
    relevantDecisions: [],
    acceptance: {
      requiredLevel: 'validated_local',
      criteria: ['domain tests pass'],
      requiredEvidenceKinds: ['test'],
    },
    authority: {
      write: 'bounded', network: 'none', destructive: false,
      mayCreateTests: true, maxRetries: 1,
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
  { prompt: 'Prepare a bounded assignment for a fresh executor to change auth validation', expected: ['task-envelope'] },
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
5. record the gate evidence in `evidence/ph01-skill-smoke.json`.

Required shape:

```json
{
  "date": "YYYY-MM-DD",
  "desktopBuild": "...",
  "cliVersion": "...",
  "cases": [
    {
      "surface": "desktop",
      "prompt": "...",
      "expectedSkill": "orchestrate-work",
      "observedSkill": "orchestrate-work",
      "passed": true
    }
  ]
}
```

No private transcript inspection. This file is evidence for GATE-01, not narrative documentation.

- [ ] **Step 6: Commit**

```powershell
git add skills tests evidence/ph01-skill-smoke.json
 git commit -m "feat: add foundational workflow skills"
```

---

### Task 8: Final contract freeze and clean-package verification

**Files:**
- Modify: `PROVENANCE.md` only if implementation introduced an external source/code dependency not already listed.
- Read/verify: `CODEX_WORKFLOW_NEXT_MASTER_PLAN.md`, `CODEX_WORKFLOW_NEXT_ROADMAP.md`, `CODEX_WORKFLOW_PH01_IMPLEMENTATION_PLAN.md`.

**Interfaces:**
- Produces the GATE-01 verification receipt through test/build output, Git diff and `evidence/ph01-skill-smoke.json`.
- Creates no duplicate architecture/compatibility/plan Markdown.

- [ ] **Step 1: Verify domain contract coverage**

Confirm tests explicitly prove:

- TaskId is logical, not native thread ID;
- roles are exactly Companion/Investigator/Executor/Senior Executor/Verifier;
- Investigator semantics allow bounded project-local and/or external evidence, while Main keeps causal/architecture/acceptance decisions;
- no Light/Medium/Heavy route enum, `agent_docs`, Archivist or mandatory Companion contract is introduced;
- Main model is outside the subagent profile contract;
- default child profile set is Luna-only with `xhigh` fallback and `max` for Executor/Senior;
- Senior exists as a separate behavioral role even when it shares Luna `max` with Executor;
- Sol Senior is not enabled by PH-01 and remains an explicit PH-04 user-configuration option;
- AuthorityEnvelope contains no model/runtime fields;
- TaskPacket = Envelope + role payload;
- TaskDelta is follow-up-only and cannot be empty;
- Authority is narrowing metadata;
- readiness hierarchy;
- WorkItem transitions;
- no persistence semantics in PH-01;
- no `fork_turns` field inside domain packet;
- no provider/effective-model assumptions;
- no documentation role/payload.

If a requirement lacks a test, add the smallest focused contract test before continuing.

- [ ] **Step 2: Run full verification**

```powershell
npm ci
npm run check
npm run build
```

Expected:

- clean dependency install;
- typecheck pass;
- all tests pass;
- lint pass;
- plugin validator pass;
- build emits domain declarations/JS only;
- no hooks/MCP/UI/state directories required for runtime.

If the installed npm does not support the expected clean-install path, use the documented current equivalent and record the command in the final executor report.

- [ ] **Step 3: Inspect Git diff for scope leakage**

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
- custom agent runtime and user/project TOML configuration loader;
- CapabilityPreflight runtime;
- RunResourceJournal/state runtime;
- `docs_steward`/DocumentationRolePayload/docs workflow;
- benchmark code;
- copied upstream prompt/source text.

- [ ] **Step 4: Verify project-control artifact hygiene**

Ensure there is exactly one active Master, one Roadmap and one current PH-01 plan in the repository/project source set. PH-01 must not create `docs/architecture`, `docs/compatibility`, `docs/plans`, `agent_docs` or another knowledge cache.

- [ ] **Step 5: Commit final PH-01 state if any verification-only edits were required**

```powershell
git add PROVENANCE.md tests evidence/ph01-skill-smoke.json
git commit -m "test: close PH-01 foundation gate"
```

Skip the commit if there are no new changes after the prior task commits.

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

- [x] `.codex-plugin/plugin.json` installed as the PH-01 Skills-only package; PH-02 superseded its production manifest.
- [x] `npm ci`/equivalent clean install succeeds.
- [x] `npm run check` succeeds.
- [x] `npm run build` succeeds.
- [x] all domain schemas are strict and exported.
- [x] TaskEnvelope + RolePayload + TaskDelta + TaskId contract is tested.
- [x] bounded write envelope cannot have empty writable scope.
- [x] role/payload mismatch is rejected.
- [x] empty TaskDelta is rejected.
- [x] WorkItem transitions are pure and tested.
- [x] completion cannot bypass readiness/evidence/decision requirements.
- [x] three foundational Skills exist and have distinct descriptions.
- [x] fresh Desktop/CLI Skill smoke is recorded.
- [x] root AGENTS contains only durable invariants/map.
- [x] no documentation role/subsystem or duplicate docs tree exists.
- [x] PH-01 did not implement CapabilityPreflight or RunResourceJournal runtime early.
- [x] no persistence/hooks/MCP production state/Board/runtime orchestration entered scope.
- [x] provenance review finds no copied unlicensed upstream content.

If these pass, next action is **TP-02A**, not immediate blind PH-02 implementation.

---

# 8. PH-01 Out-of-scope Findings Protocol

If implementation discovers a host/platform issue:

1. record live-skill evidence in `evidence/ph01-skill-smoke.json` when relevant; otherwise include the finding in the executor final report;
2. classify `blocks PH-01 | blocks later phase | informational`;
3. do not add workaround runtime from later phases;
4. amend Master/Roadmap only if it changes a durable architectural assumption. Do not create a new Markdown report solely to preserve an informational finding.

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
- do not create Context Companion/Executor runtime merely to develop the plugin;
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

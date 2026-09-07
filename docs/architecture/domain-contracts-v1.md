# Domain Contracts V1

PH-01 freezes persistence-free workflow contracts. Runtime storage, hooks, MCP state, Board UI and orchestration execution remain outside this phase.

## Task transfer

`TaskId` is a stable Workflow Next correlation ID, not a native Codex thread ID. A `TaskPacket` combines one `TaskEnvelope` with exactly one role-compatible `RolePayload`. The envelope carries bounded scope, acceptance, narrowing authority and return policy.

`TaskDelta` is follow-up-only, keeps the same `TaskId` and must contain at least one change. It does not repeat unchanged context. Neither packet contains `fork_turns`, provider model IDs or assumptions about the effective model.

Authority metadata may narrow user, project and native authority; it cannot expand them. Bounded write authority requires at least one writable scope.

## State and completion

Readiness is ordered:

```text
implemented < validated_local < validated_target < released < accepted
```

Allowed WorkItem transitions are:

- `ready` → `running | cancelled`
- `running` → `verifying | needs_decision | needs_review | blocked | cancelled`
- `verifying` → `running | needs_decision | needs_review | blocked | done | cancelled`
- `needs_decision` → `ready | running | blocked | cancelled`
- `needs_review` → `running | verifying | blocked | done | cancelled`
- `blocked` → `ready | running | cancelled`
- `done` and `cancelled` are terminal.

Completion requires the configured readiness level, every required evidence kind and no unresolved required decision. A worker return or subagent stop is not completion evidence by itself.

## Decision amendment

Master DOM-13 referenced `DecisionAlternative` without defining its shape. PH-01 resolves that gap with a strict minimal V1 object containing non-empty `label` and `description` fields.

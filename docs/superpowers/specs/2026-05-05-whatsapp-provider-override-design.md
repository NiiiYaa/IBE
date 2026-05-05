# WhatsApp Distinct LLM Provider Override — Design Spec

**Goal:** Allow super/org admins to configure a completely different LLM provider (and model) for WhatsApp AI conversations, independent of the main AI config used by the web search bar.

**Constraint:** The override only applies when the config tier has `useInherited = false` (its own full config). Orgs that inherit the system config cannot set a WhatsApp-specific provider override.

---

## Background

The existing `whatsappModel String?` field (added in the latency improvements work) lets admins override just the model name for WhatsApp while reusing the same provider and API key. This spec extends that to also allow a different provider — e.g., DeepSeek for general AI, OpenAI for WhatsApp.

---

## Section 1 — Schema & Types

### Prisma schema (`apps/api/prisma/schema.prisma`)

Add two nullable fields to `SystemAIConfig`, `OrgAIConfig`, and `PropertyAIConfig`, immediately after `whatsappModel`:

```prisma
whatsappProvider String? // optional distinct LLM provider for WhatsApp channel
whatsappApiKey   String? // AES-256-CBC encrypted; only required when whatsappProvider differs from provider
```

One migration: three `ALTER TABLE ADD COLUMN` statements, all nullable, no defaults.

### Shared types (`packages/shared/src/types/ai-config.ts`)

`AIConfigResponse` gains:
```typescript
whatsappProvider: AIProvider | null
whatsappApiKeySet: boolean
whatsappApiKeyMasked: string | null
```

`AIConfigUpdate` gains:
```typescript
whatsappProvider?: AIProvider | null
whatsappApiKey?: string
```

`OrgAIConfigUpdate` and `PropertyAIConfigUpdate` inherit these automatically via extension.

### Internal resolved type (`apps/api/src/services/ai-config.service.ts`)

`ResolvedAIConfig` gains:
```typescript
whatsappProvider: AIProvider | null
whatsappApiKey: string | null  // decrypted
```

---

## Section 2 — Service Layer

### `rowToResponse`

Add the new fields using the same masking pattern as `apiKey`:
```typescript
whatsappProvider: (row?.whatsappProvider as AIProvider) ?? null,
whatsappApiKeySet: !!row?.whatsappApiKey,
whatsappApiKeyMasked: row?.whatsappApiKey ? maskApiKey(row.whatsappApiKey) : null,
```

### `resolveAIConfig` — four return points

Each return statement adds:
```typescript
whatsappProvider: <row>.whatsappProvider as AIProvider ?? null,
whatsappApiKey: <row>.whatsappApiKey ? decryptApiKey(<row>.whatsappApiKey) : null,
```

### Three upsert functions

Same `if (data.X !== undefined)` pattern as existing fields:
```typescript
if (data.whatsappProvider !== undefined) update.whatsappProvider = data.whatsappProvider
if (data.whatsappApiKey !== undefined)   update.whatsappApiKey   = data.whatsappApiKey ? encryptApiKey(data.whatsappApiKey) : null
```

The `SystemAIConfig` create block must also explicitly include both fields (same fix pattern as `whatsappModel`).

---

## Section 3 — Orchestrator (`apps/api/src/ai/orchestrator.ts`)

Replace the current single `effectiveModel` line with a full WhatsApp config resolution block:

```typescript
let effectiveProvider = aiConfig.provider
let effectiveApiKey = aiConfig.apiKey
let effectiveModel = aiConfig.model

if (channel === 'whatsapp') {
  if (aiConfig.whatsappProvider && aiConfig.whatsappProvider !== aiConfig.provider) {
    // Different provider — use its own key and model
    effectiveProvider = aiConfig.whatsappProvider
    effectiveApiKey = aiConfig.whatsappApiKey ?? aiConfig.apiKey
    effectiveModel = aiConfig.whatsappModel ?? aiConfig.model
  } else if (aiConfig.whatsappModel) {
    // Same provider, model override only
    effectiveModel = aiConfig.whatsappModel
  }
}

const adapter = getProviderAdapter(effectiveProvider)
```

The existing `adapter.call(messages, ALL_TOOLS, systemPrompt, aiConfig.apiKey, effectiveModel)` line changes to:
```typescript
const response = await adapter.call(messages, ALL_TOOLS, systemPrompt, effectiveApiKey, effectiveModel)
```

---

## Section 4 — Admin UI (`apps/web/src/app/admin/config/ai/page.tsx`)

### State changes in `AIConfigForm`

Replace the existing `whatsappModel` plain text input with a "WhatsApp AI Override" sub-section. New state:
```typescript
const [whatsappProvider, setWhatsappProvider] = useState<AIProvider | ''>(initialWhatsappProvider ?? '')
const [whatsappApiKey, setWhatsappApiKey] = useState('')
// whatsappModel state stays unchanged
```

New prop: `initialWhatsappProvider: AIProvider | null`.

### UI behaviour (three states)

1. **`whatsappProvider` is `''` (default / "Same as above"):** Only the `whatsappModel` text input shows. Selecting a provider activates the override.
2. **`whatsappProvider === provider` (same as main):** Shows model input + a muted hint: *"Uses your [Provider] API key above."* No API key input.
3. **`whatsappProvider` set and different from `provider`:** Shows API key password input (with "Leave blank to keep current key" note) + model text input.

Provider dropdown options: the full `AI_PROVIDERS` list (excluding `'fake'` for non-super admins), plus a leading `''` option labelled `"— Same as above (no override) —"`.

### `onSave` changes

```typescript
onSave({
  provider,
  model,
  whatsappProvider: whatsappProvider || null,
  ...(whatsappApiKey ? { whatsappApiKey } : {}),
  whatsappModel: whatsappModel.trim() || null,
  ...(apiKey ? { apiKey } : {}),
  systemPrompt: systemPrompt || null,
  enabled,
})
```

### All `<AIConfigForm` instances

Each gains `initialWhatsappProvider={data?.whatsappProvider ?? null}`.

---

## Error Handling

- If `whatsappProvider` is set to a different provider but no `whatsappApiKey` has ever been saved, `aiConfig.whatsappApiKey` will be `null`. The orchestrator falls back to `aiConfig.apiKey` in that case (the `?? aiConfig.apiKey` in the effectiveApiKey line). This means a misconfigured WhatsApp override degrades gracefully to the main key rather than crashing.
- No validation is added server-side beyond what Prisma enforces (nullable fields). The admin is trusted to enter a valid key.

---

## Out of Scope

- Testing the API connection for the WhatsApp-specific provider (no "Test Connection" button for the WhatsApp section).
- Per-property WhatsApp provider override (the feature applies at system/org/property tier levels, but WhatsApp in practice is an org-level channel).
- Inheriting `whatsappProvider` from a parent tier when `useInherited = false` but `whatsappProvider` is null — it simply won't override.

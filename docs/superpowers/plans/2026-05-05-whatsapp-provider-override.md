# WhatsApp Distinct LLM Provider Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Allow admins to configure a completely different LLM provider (and optionally a distinct API key and model) specifically for WhatsApp AI conversations, independent of the main AI config used on the web.

**Architecture:** Add `whatsappProvider String?` and `whatsappApiKey String?` (encrypted) to the three existing AI config Prisma models. Thread them through shared types, `ResolvedAIConfig`, and the three upsert functions. In the orchestrator, replace the single `effectiveModel` variable with a three-variable block (`effectiveProvider`, `effectiveApiKey`, `effectiveModel`) that selects the WhatsApp-specific config when the channel is `whatsapp`. In the admin UI, replace the plain `whatsappModel` text input with a smart three-state "WhatsApp AI Override" section.

**Tech Stack:** Prisma (PostgreSQL), TypeScript, Fastify, Next.js 14, React, AES-256-CBC encryption (existing `encryptApiKey`/`decryptApiKey` helpers).

---

## Files

| Action | Path | What changes |
|--------|------|-------------|
| Modify | `apps/api/prisma/schema.prisma` | Add `whatsappProvider String?` and `whatsappApiKey String?` to 3 models |
| Create | `apps/api/prisma/migrations/<ts>_whatsapp_provider/migration.sql` | Generated |
| Modify | `packages/shared/src/types/ai-config.ts` | Add fields to `AIConfigResponse` and `AIConfigUpdate` |
| Modify | `apps/api/src/services/ai-config.service.ts` | `rowToResponse`, `ResolvedAIConfig`, 4 return points in `resolveAIConfig`, 3 upsert functions |
| Modify | `apps/api/src/ai/orchestrator.ts` | Replace `effectiveModel` with 3-variable WhatsApp config block; update `adapter.call` |
| Modify | `apps/web/src/app/admin/config/ai/page.tsx` | Replace plain `whatsappModel` input with 3-state WhatsApp AI Override section |

---

## Task 1: Schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [x] **Step 1: Add the two new nullable fields to all three AI config models**

In `apps/api/prisma/schema.prisma`, for each of the three models add `whatsappProvider` and `whatsappApiKey` immediately after `whatsappModel`:

```prisma
model SystemAIConfig {
  id            Int      @id @default(autoincrement())
  provider      String
  model         String
  whatsappModel  String?
  whatsappProvider String? // optional distinct LLM provider for WhatsApp channel
  whatsappApiKey   String? // AES-256-CBC encrypted; required when whatsappProvider differs
  apiKey        String
  systemPrompt  String?
  enabled       Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model OrgAIConfig {
  id             Int          @id @default(autoincrement())
  organizationId Int          @unique
  organization   Organization @relation(fields: [organizationId], references: [id])
  useInherited   Boolean      @default(true)
  provider       String?
  model          String?
  whatsappModel  String?
  whatsappProvider String?    // optional distinct LLM provider for WhatsApp channel
  whatsappApiKey   String?    // AES-256-CBC encrypted; required when whatsappProvider differs
  apiKey         String?
  systemPrompt   String?
  enabled        Boolean      @default(false)
  systemServiceDisabled Boolean @default(false)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
}

model PropertyAIConfig {
  id           Int      @id @default(autoincrement())
  propertyId   Int      @unique
  useInherited Boolean  @default(true)
  provider     String?
  model        String?
  whatsappModel  String?
  whatsappProvider String? // optional distinct LLM provider for WhatsApp channel
  whatsappApiKey   String? // AES-256-CBC encrypted; required when whatsappProvider differs
  apiKey       String?
  systemPrompt String?
  enabled      Boolean  @default(false)
  systemServiceDisabled Boolean @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

- [x] **Step 2: Create and apply the migration**

The dev database lacks shadow DB permissions, so create the migration manually:

```bash
mkdir -p /home/nir/ibe/apps/api/prisma/migrations/20260505000007_whatsapp_provider
cat > /home/nir/ibe/apps/api/prisma/migrations/20260505000007_whatsapp_provider/migration.sql << 'EOF'
ALTER TABLE "SystemAIConfig" ADD COLUMN "whatsappProvider" TEXT;
ALTER TABLE "SystemAIConfig" ADD COLUMN "whatsappApiKey" TEXT;
ALTER TABLE "OrgAIConfig" ADD COLUMN "whatsappProvider" TEXT;
ALTER TABLE "OrgAIConfig" ADD COLUMN "whatsappApiKey" TEXT;
ALTER TABLE "PropertyAIConfig" ADD COLUMN "whatsappProvider" TEXT;
ALTER TABLE "PropertyAIConfig" ADD COLUMN "whatsappApiKey" TEXT;
EOF
```

Apply it:

```bash
cd /home/nir/ibe/apps/api && npx prisma db execute --file prisma/migrations/20260505000007_whatsapp_provider/migration.sql --schema prisma/schema.prisma
npx prisma migrate resolve --applied 20260505000007_whatsapp_provider
```

Expected: no errors from either command.

- [x] **Step 3: Regenerate Prisma client**

```bash
cd /home/nir/ibe/apps/api && npx prisma generate
```

Expected: `Generated Prisma Client`.

- [x] **Step 4: Commit**

```bash
cd /home/nir/ibe
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260505000007_whatsapp_provider
git commit -m "feat: add whatsappProvider + whatsappApiKey fields to AI config schema"
```

---

## Task 2: Shared types

**Files:**
- Modify: `packages/shared/src/types/ai-config.ts`

- [x] **Step 1: Add fields to `AIConfigResponse`**

In `packages/shared/src/types/ai-config.ts`, update `AIConfigResponse` to:

```typescript
export interface AIConfigResponse {
  provider: AIProvider | null
  model: string | null
  whatsappModel: string | null
  whatsappProvider: AIProvider | null
  whatsappApiKeySet: boolean
  whatsappApiKeyMasked: string | null
  apiKeySet: boolean
  apiKeyMasked: string | null
  systemPrompt: string | null
  enabled: boolean
}
```

- [x] **Step 2: Add fields to `AIConfigUpdate`**

Update `AIConfigUpdate` to:

```typescript
export interface AIConfigUpdate {
  provider?: AIProvider
  model?: string
  whatsappModel?: string | null
  whatsappProvider?: AIProvider | null
  whatsappApiKey?: string
  apiKey?: string
  systemPrompt?: string | null
  enabled?: boolean
}
```

`OrgAIConfigUpdate` and `PropertyAIConfigUpdate` extend `AIConfigUpdate` — no changes needed there.

- [x] **Step 3: Verify shared package compiles**

```bash
cd /home/nir/ibe && npx tsc -p packages/shared/tsconfig.json --noEmit
```

Expected: no output.

- [x] **Step 4: Commit**

```bash
git add packages/shared/src/types/ai-config.ts
git commit -m "feat: add whatsappProvider + whatsappApiKey to shared AI config types"
```

---

## Task 3: Service layer

**Files:**
- Modify: `apps/api/src/services/ai-config.service.ts`

- [x] **Step 1: Update `rowToResponse`**

The `rowToResponse` function (lines 45–62) needs the new fields in both its parameter type and return value. Replace it entirely:

```typescript
function rowToResponse(row: {
  provider: string | null
  model: string | null
  whatsappModel?: string | null
  whatsappProvider?: string | null
  whatsappApiKey?: string | null
  apiKey: string | null
  systemPrompt: string | null
  enabled: boolean
} | null): AIConfigResponse {
  return {
    provider: (row?.provider as AIProvider) ?? null,
    model: row?.model ?? null,
    whatsappModel: row?.whatsappModel ?? null,
    whatsappProvider: (row?.whatsappProvider as AIProvider) ?? null,
    whatsappApiKeySet: !!row?.whatsappApiKey,
    whatsappApiKeyMasked: row?.whatsappApiKey ? maskApiKey(row.whatsappApiKey) : null,
    apiKeySet: !!row?.apiKey,
    apiKeyMasked: row?.apiKey ? maskApiKey(row.apiKey) : null,
    systemPrompt: row?.systemPrompt ?? null,
    enabled: row?.enabled ?? false,
  }
}
```

- [x] **Step 2: Update `ResolvedAIConfig`**

Replace the `ResolvedAIConfig` interface (around line 190):

```typescript
export interface ResolvedAIConfig {
  provider: AIProvider
  model: string
  whatsappModel: string | null
  whatsappProvider: AIProvider | null
  whatsappApiKey: string | null
  apiKey: string
  systemPrompt: string | null
  source: 'property' | 'org' | 'system'
}
```

- [x] **Step 3: Update the four return statements in `resolveAIConfig`**

Each of the four `return { ... }` blocks inside `resolveAIConfig` needs `whatsappProvider` and `whatsappApiKey`. The row variable is `propRow`, `orgRow`, or `systemRow` depending on which block. For `fake` providers the api keys are empty strings — apply the same pattern for `whatsappApiKey`.

**Return 1 — source `'property'` (uses `propRow`):**
```typescript
return {
  provider: propRow.provider as AIProvider,
  model: propRow.model!,
  whatsappModel: propRow.whatsappModel ?? null,
  whatsappProvider: (propRow.whatsappProvider as AIProvider) ?? null,
  whatsappApiKey: propRow.whatsappApiKey ? decryptApiKey(propRow.whatsappApiKey) : null,
  apiKey: isFakeProp ? '' : decryptApiKey(propRow.apiKey!),
  systemPrompt: propRow.systemPrompt,
  source: 'property',
}
```

**Return 2 — source `'org'` via property fallthrough (uses `orgRow`):**
```typescript
return {
  provider: orgRow.provider as AIProvider,
  model: orgRow.model!,
  whatsappModel: orgRow.whatsappModel ?? null,
  whatsappProvider: (orgRow.whatsappProvider as AIProvider) ?? null,
  whatsappApiKey: orgRow.whatsappApiKey ? decryptApiKey(orgRow.whatsappApiKey) : null,
  apiKey: isFakeOrg ? '' : decryptApiKey(orgRow.apiKey!),
  systemPrompt: orgRow.systemPrompt,
  source: 'org',
}
```

**Return 3 — source `'org'` via `orgId` path (uses `orgRow`):** Same as Return 2.

**Return 4 — source `'system'` (uses `systemRow`):**
```typescript
return {
  provider: systemRow.provider as AIProvider,
  model: systemRow.model,
  whatsappModel: systemRow.whatsappModel ?? null,
  whatsappProvider: (systemRow.whatsappProvider as AIProvider) ?? null,
  whatsappApiKey: systemRow.whatsappApiKey ? decryptApiKey(systemRow.whatsappApiKey) : null,
  apiKey: isFakeSys ? '' : decryptApiKey(systemRow.apiKey),
  systemPrompt: systemRow.systemPrompt,
  source: 'system',
}
```

- [x] **Step 4: Update the three upsert functions**

In `upsertSystemAIConfig` — add two lines to the `update` block (after the `whatsappModel` line):
```typescript
if (data.whatsappProvider !== undefined) update.whatsappProvider = data.whatsappProvider
if (data.whatsappApiKey !== undefined && data.whatsappApiKey !== '') update.whatsappApiKey = encryptApiKey(data.whatsappApiKey)
```

Also add to the `create` block (after `whatsappModel`):
```typescript
whatsappProvider: data.whatsappProvider ?? null,
whatsappApiKey: data.whatsappApiKey ? encryptApiKey(data.whatsappApiKey) : null,
```

In `upsertOrgAIConfig` — add the same two lines to the `update` block:
```typescript
if (data.whatsappProvider !== undefined) update.whatsappProvider = data.whatsappProvider
if (data.whatsappApiKey !== undefined && data.whatsappApiKey !== '') update.whatsappApiKey = encryptApiKey(data.whatsappApiKey)
```

(`OrgAIConfig` uses `...update` spread for create, so new fields are picked up automatically.)

In `upsertPropertyAIConfig` — same two lines in the `update` block:
```typescript
if (data.whatsappProvider !== undefined) update.whatsappProvider = data.whatsappProvider
if (data.whatsappApiKey !== undefined && data.whatsappApiKey !== '') update.whatsappApiKey = encryptApiKey(data.whatsappApiKey)
```

(`PropertyAIConfig` also uses `...update` spread for create.)

- [x] **Step 5: Verify API package compiles**

```bash
cd /home/nir/ibe && npx tsc -p apps/api/tsconfig.json --noEmit
```

Expected: no output.

- [x] **Step 6: Commit**

```bash
git add apps/api/src/services/ai-config.service.ts
git commit -m "feat: wire whatsappProvider + whatsappApiKey through AI config service layer"
```

---

## Task 4: Orchestrator

**Files:**
- Modify: `apps/api/src/ai/orchestrator.ts:125-145`

- [x] **Step 1: Replace the single `effectiveModel` line with the full 3-variable block**

Currently around line 125–127:
```typescript
// Use WhatsApp-specific model override if configured
const effectiveModel = (channel === 'whatsapp' && aiConfig.whatsappModel) ? aiConfig.whatsappModel : aiConfig.model
const adapter = getProviderAdapter(aiConfig.provider)
```

Replace with:
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

- [x] **Step 2: Update `adapter.call` to use `effectiveApiKey`**

Currently around line 145:
```typescript
const response = await adapter.call(messages, ALL_TOOLS, systemPrompt, aiConfig.apiKey, effectiveModel)
```

Change to:
```typescript
const response = await adapter.call(messages, ALL_TOOLS, systemPrompt, effectiveApiKey, effectiveModel)
```

- [x] **Step 3: Verify API package compiles**

```bash
cd /home/nir/ibe && npx tsc -p apps/api/tsconfig.json --noEmit
```

Expected: no output.

- [x] **Step 4: Commit**

```bash
git add apps/api/src/ai/orchestrator.ts
git commit -m "feat: support distinct WhatsApp LLM provider + API key in orchestrator"
```

---

## Task 5: Admin UI

**Files:**
- Modify: `apps/web/src/app/admin/config/ai/page.tsx`

- [x] **Step 1: Add `initialWhatsappProvider` prop and `whatsappProvider` / `whatsappApiKey` state to `AIConfigForm`**

Update the `AIConfigForm` function signature and state block. The existing signature has `initialWhatsappModel: string | null` — add `initialWhatsappProvider: AIProvider | null` alongside it:

```typescript
function AIConfigForm({
  initialProvider,
  initialModel,
  initialWhatsappModel,
  initialWhatsappProvider,   // add
  initialSystemPrompt,
  initialEnabled,
  isSuper,
  onSave,
  onTest,
  saving,
  testing,
  testResult,
}: {
  initialProvider: AIProvider | null
  initialModel: string | null
  initialWhatsappModel: string | null
  initialWhatsappProvider: AIProvider | null   // add
  initialSystemPrompt: string | null
  initialEnabled: boolean
  isSuper: boolean
  onSave: (data: AIConfigUpdate) => void
  onTest: (provider: AIProvider, apiKey: string, model: string) => void
  saving: boolean
  testing: boolean
  testResult: { ok: boolean; error?: string } | null
}) {
  const [provider, setProvider] = useState<AIProvider>(initialProvider ?? 'openai')
  const [model, setModel] = useState(initialModel ?? AI_PROVIDER_MODELS[initialProvider ?? 'openai'][0])
  const [whatsappProvider, setWhatsappProvider] = useState<AIProvider | ''>(initialWhatsappProvider ?? '')   // add
  const [whatsappApiKey, setWhatsappApiKey] = useState('')   // add
  const [whatsappModel, setWhatsappModel] = useState(initialWhatsappModel ?? '')
  const [apiKey, setApiKey] = useState('')
  const [systemPrompt, setSystemPrompt] = useState(initialSystemPrompt ?? '')
  const [enabled, setEnabled] = useState(initialEnabled)
```

- [x] **Step 2: Replace the plain `whatsappModel` text input with the 3-state WhatsApp AI Override section**

The current WhatsApp section (around lines 151–163) is a plain text input. Replace the entire `<div>` block with:

```tsx
<div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4">
  <p className="text-sm font-medium text-[var(--color-text)]">WhatsApp AI Override <span className="font-normal text-[var(--color-text-muted)]">(optional)</span></p>
  <div>
    <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Provider</label>
    <select
      value={whatsappProvider}
      onChange={e => setWhatsappProvider(e.target.value as AIProvider | '')}
      className={inputCls}
    >
      <option value="">— Same as above (no override) —</option>
      {(isSuper ? AI_PROVIDERS : AI_PROVIDERS.filter(p => p !== 'fake')).map(p => (
        <option key={p} value={p}>{AI_PROVIDER_LABELS[p]}</option>
      ))}
    </select>
  </div>

  {whatsappProvider && whatsappProvider !== provider && (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">WhatsApp API Key</label>
      <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">Leave blank to keep the current key.</p>
      <input
        type="password"
        value={whatsappApiKey}
        onChange={e => setWhatsappApiKey(e.target.value)}
        placeholder="Paste new API key…"
        className={inputCls}
        autoComplete="off"
      />
    </div>
  )}

  {whatsappProvider && whatsappProvider === provider && (
    <p className="text-xs text-[var(--color-text-muted)]">Uses your {AI_PROVIDER_LABELS[provider]} API key above.</p>
  )}

  <div>
    <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Model</label>
    <input
      type="text"
      value={whatsappModel}
      onChange={e => setWhatsappModel(e.target.value)}
      placeholder={whatsappProvider
        ? `e.g. ${AI_PROVIDER_MODELS[whatsappProvider as AIProvider]?.[1] ?? 'gpt-4o-mini'}`
        : `e.g. ${AI_PROVIDER_MODELS[provider]?.[1] ?? 'gpt-4o-mini'}`}
      className={inputCls}
      autoComplete="off"
      spellCheck={false}
    />
  </div>
</div>
```

- [x] **Step 3: Update the `onSave` call to include the new fields**

The Save button's `onClick` (currently around line 228) is:
```typescript
onClick={() => onSave({ provider, ...(model ? { model } : {}), whatsappModel: whatsappModel.trim() || null, ...(apiKey ? { apiKey } : {}), systemPrompt: systemPrompt || null, enabled })}
```

Replace with:
```typescript
onClick={() => onSave({
  provider,
  ...(model ? { model } : {}),
  whatsappProvider: whatsappProvider || null,
  ...(whatsappApiKey ? { whatsappApiKey } : {}),
  whatsappModel: whatsappModel.trim() || null,
  ...(apiKey ? { apiKey } : {}),
  systemPrompt: systemPrompt || null,
  enabled,
})}
```

- [x] **Step 4: Pass `initialWhatsappProvider` to all three `<AIConfigForm` instances**

Search the file for `<AIConfigForm` — it appears three times (system, org, property sections). Each already has `initialWhatsappModel={data?.whatsappModel ?? null}`. Add alongside it:

```tsx
initialWhatsappProvider={data?.whatsappProvider ?? null}
```

Where `data` is the config query result for that section. All three instances follow the same pattern.

- [x] **Step 5: Verify web package compiles**

```bash
cd /home/nir/ibe && npx tsc -p apps/web/tsconfig.json --noEmit
```

Expected: no output.

- [x] **Step 6: Commit**

```bash
git add apps/web/src/app/admin/config/ai/page.tsx
git commit -m "feat: add WhatsApp AI provider override section to admin AI config page"
```

---

## Verification

- [x] Restart the API server (Prisma schema changes require restart)
- [x] Open admin → Config → AI for an org that has its own full config (`useInherited = false`)
- [x] Confirm the "WhatsApp AI Override" section appears with the provider dropdown
- [x] Select a different provider — confirm API key input appears
- [x] Select the same provider as main — confirm hint "Uses your X API key above" shows, no API key input
- [x] Select "— Same as above —" — confirm no API key or model fields are active
- [x] Save with a different provider + key + model → confirm API logs show the override in effect for the next WhatsApp turn

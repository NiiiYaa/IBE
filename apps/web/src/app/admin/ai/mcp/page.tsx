'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { useAdminProperty } from '../../property-context'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import type { AIChannelSettings } from '@ibe/shared'

function copyText(text: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(text)
  // Fallback for non-secure contexts (HTTP in dev)
  const el = document.createElement('textarea')
  el.value = text
  el.style.position = 'fixed'
  el.style.opacity = '0'
  document.body.appendChild(el)
  el.select()
  document.execCommand('copy')
  document.body.removeChild(el)
  return Promise.resolve()
}

// Computed client-side from window.location.origin so it reflects the
// public-facing URL (via Next.js proxy) rather than the internal API host.
function getMcpEndpoint(): string {
  if (typeof window === 'undefined') return '/api/v1/mcp'
  return `${window.location.origin}/api/v1/mcp`
}

type Platform = 'claude' | 'claude_ai' | 'cursor' | 'windsurf' | 'chatgpt' | 'openai' | 'gemini' | 'grok' | 'n8n'

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'claude',    label: 'Claude Desktop' },
  { id: 'claude_ai', label: 'Claude.ai' },
  { id: 'cursor',   label: 'Cursor' },
  { id: 'windsurf', label: 'Windsurf' },
  { id: 'chatgpt',  label: 'ChatGPT App' },
  { id: 'openai',   label: 'OpenAI Agents SDK' },
  { id: 'gemini',   label: 'Gemini' },
  { id: 'grok',     label: 'Grok / X' },
  { id: 'n8n',      label: 'n8n' },
]

function mcpJsonSnippet(endpoint: string, apiKey: string) {
  return JSON.stringify(
    {
      mcpServers: {
        hotel: {
          url: endpoint,
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      },
    },
    null,
    2,
  )
}

function CodeBlock({ code, language = 'json' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    copyText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return (
    <div className="relative rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
        <span className="text-xs text-[var(--color-text-muted)]">{language}</span>
        <button type="button" onClick={copy} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-[var(--color-text)]"><code>{code}</code></pre>
    </div>
  )
}

function EndpointInfo({ endpoint, apiKey, protocol = 'MCP JSON-RPC 2.0 (Streamable HTTP)' }: { endpoint: string; apiKey: string; protocol?: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4 space-y-2 font-mono text-xs">
      {[
        ['Endpoint', endpoint],
        ['Auth header', `Authorization: Bearer ${apiKey}`],
        ['Protocol', protocol],
      ].map(([label, value]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)] w-24 shrink-0">{label}</span>
          <span className="text-[var(--color-text)] break-all">{value}</span>
        </div>
      ))}
    </div>
  )
}

function PlatformSnippet({ platform, endpoint, apiKey }: { platform: Platform; endpoint: string; apiKey: string }) {
  const json = mcpJsonSnippet(endpoint, apiKey)

  if (platform === 'claude') return (
    <div className="space-y-3 text-sm">
      <p className="text-[var(--color-text-muted)]">
        Add to <code className="rounded bg-[var(--color-background)] px-1 py-px font-mono text-xs">~/.config/claude/claude_desktop_config.json</code>
        {' '}(Linux/Mac) or <code className="rounded bg-[var(--color-background)] px-1 py-px font-mono text-xs">%APPDATA%\Claude\claude_desktop_config.json</code> (Windows):
      </p>
      <CodeBlock code={json} />
    </div>
  )

  if (platform === 'claude_ai') {
    const claudeUrl = `${endpoint}/${apiKey}`
    return (
      <div className="space-y-4 text-sm">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4 space-y-2">
          <p className="text-xs text-[var(--color-text-muted)]">
            Use the OAuth credentials from the <strong>OAuth Connection</strong> section above for the Advanced settings fields. Paste the MCP endpoint URL (without any key) into the connector URL field.
          </p>
          <div className="font-mono text-xs text-[var(--color-text)] break-all rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
            {endpoint}
          </div>
          <button
            type="button"
            onClick={() => copyText(endpoint)}
            className="text-xs text-[var(--color-primary)] hover:underline"
          >
            Copy URL
          </button>
        </div>

        <div className="space-y-3">
          <p className="font-medium text-[var(--color-text)]">Setup steps in Claude.ai</p>
          <ol className="space-y-3 text-[var(--color-text-muted)]">
            <li className="flex gap-2">
              <span className="shrink-0 font-semibold text-[var(--color-primary)]">1.</span>
              <span>In <strong>claude.ai</strong>, click <strong>Customize</strong> in the left sidebar.</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 font-semibold text-[var(--color-primary)]">2.</span>
              <span>Under <strong>Connectors</strong>, click <strong>Add custom connector</strong>.</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 font-semibold text-[var(--color-primary)]">3.</span>
              <div className="space-y-1">
                <p>Fill in the form:</p>
                <ul className="ml-3 space-y-1 list-disc list-inside">
                  <li><strong>Name</strong> — e.g. &quot;Hotel Booking&quot;</li>
                  <li><strong>Remote MCP server URL</strong> — paste the URL above (key is already in the URL)</li>
                  <li><strong>OAuth fields</strong> — leave empty</li>
                </ul>
              </div>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 font-semibold text-[var(--color-primary)]">4.</span>
              <span>Click <strong>Add</strong>. Claude will discover the available tools automatically.</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 font-semibold text-[var(--color-primary)]">5.</span>
              <span>Start a conversation and test with: <em>&quot;What rooms are available from Dec 10–14 for 2 adults?&quot;</em></span>
            </li>
          </ol>
        </div>
      </div>
    )
  }

  if (platform === 'cursor') return (
    <div className="space-y-3 text-sm">
      <p className="text-[var(--color-text-muted)]">
        Add to your project&apos;s <code className="rounded bg-[var(--color-background)] px-1 py-px font-mono text-xs">.cursor/mcp.json</code>, or configure via <strong>Cursor Settings → MCP</strong>:
      </p>
      <CodeBlock code={json} />
    </div>
  )

  if (platform === 'windsurf') return (
    <div className="space-y-3 text-sm">
      <p className="text-[var(--color-text-muted)]">
        In Windsurf go to <strong>Settings → AI → MCP Servers</strong>, or add to
        <code className="rounded bg-[var(--color-background)] px-1 py-px font-mono text-xs"> ~/.codeium/windsurf/mcp_config.json</code>:
      </p>
      <CodeBlock code={json} />
    </div>
  )

  if (platform === 'chatgpt') {
    const chatgptUrl = `${endpoint}/${apiKey}`
    return (
      <div className="space-y-4 text-sm">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4 space-y-2">
          <p className="text-xs text-[var(--color-text-muted)]">
            ChatGPT Apps don&apos;t support Bearer auth — the API key is embedded in the URL instead. Use <em>No authentication</em> in ChatGPT; the URL below already contains your key.
          </p>
          <div className="font-mono text-xs text-[var(--color-text)] break-all rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
            {chatgptUrl}
          </div>
          <button
            type="button"
            onClick={() => copyText(chatgptUrl)}
            className="text-xs text-[var(--color-primary)] hover:underline"
          >
            Copy URL
          </button>
        </div>

        <div className="space-y-3">
          <p className="font-medium text-[var(--color-text)]">Setup steps in ChatGPT</p>
          <ol className="space-y-3 text-[var(--color-text-muted)]">
            <li className="flex gap-2">
              <span className="shrink-0 font-semibold text-[var(--color-primary)]">1.</span>
              <span>In ChatGPT go to <strong>Settings → Apps &amp; Connectors → Advanced settings</strong> and enable <strong>Developer mode</strong>.</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 font-semibold text-[var(--color-primary)]">2.</span>
              <span>Under <strong>Connectors</strong>, click <strong>Create</strong>.</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 font-semibold text-[var(--color-primary)]">3.</span>
              <div className="space-y-1">
                <p>Fill in the form:</p>
                <ul className="ml-3 space-y-1 list-disc list-inside">
                  <li><strong>Connector name</strong> — e.g. &quot;Hotel Booking&quot;</li>
                  <li><strong>Description</strong> — e.g. &quot;Search rooms and create booking links&quot;</li>
                  <li><strong>Connector URL</strong> — paste the URL above (key is already in the URL)</li>
                  <li><strong>Authentication</strong> — select <strong>No authentication</strong></li>
                </ul>
              </div>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 font-semibold text-[var(--color-primary)]">4.</span>
              <span>Click <strong>Create</strong>. ChatGPT will discover the available tools automatically.</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 font-semibold text-[var(--color-primary)]">5.</span>
              <span>Start a conversation, click <strong>+</strong> to add the connector, and test with: <em>&quot;What rooms are available from Dec 10–14 for 2 adults?&quot;</em></span>
            </li>
          </ol>
        </div>

        <p className="text-xs text-[var(--color-text-muted)]">
          After updating tools on the server, click <strong>Refresh</strong> in the connector settings to pull the latest definitions.{' '}
          <a href="https://developers.openai.com/apps-sdk/deploy/connect-chatgpt" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">Full docs ↗</a>
        </p>
      </div>
    )
  }

  if (platform === 'openai') return (
    <div className="space-y-3 text-sm">
      <p className="text-[var(--color-text-muted)]">
        Use with the <strong>OpenAI Agents SDK</strong> (Python):
      </p>
      <CodeBlock language="python" code={`from agents import Agent, MCPServerStreamableHTTP

hotel_mcp = MCPServerStreamableHTTP(
    url="${endpoint}",
    headers={"Authorization": "Bearer ${apiKey}"},
)

agent = Agent(
    name="Hotel Assistant",
    instructions="Help guests find and book hotel rooms.",
    mcp_servers=[hotel_mcp],
)`} />
    </div>
  )

  if (platform === 'n8n') return (
    <div className="space-y-3 text-sm">
      <p className="text-[var(--color-text-muted)]">
        n8n uses <strong>SSE transport</strong>. In your n8n workflow add an <strong>MCP Client Tool</strong> node and configure:
      </p>
      <EndpointInfo endpoint={endpoint} apiKey={apiKey} protocol="SSE (GET + POST)" />
      <ol className="list-decimal list-inside space-y-1 text-[var(--color-text-muted)] text-xs">
        <li>Add an <strong>MCP Client Tool</strong> node to your workflow.</li>
        <li>Set <strong>SSE URL</strong> to the endpoint above.</li>
        <li>Under <strong>Authentication</strong> choose <em>Header Auth</em>, header name <code className="rounded bg-[var(--color-background)] px-1">Authorization</code>, value <code className="rounded bg-[var(--color-background)] px-1">Bearer {'<your-api-key>'}</code>.</li>
        <li>Connect the node to an AI Agent node — n8n will discover the available tools automatically.</li>
      </ol>
    </div>
  )

  return (
    <div className="space-y-3 text-sm">
      <p className="text-[var(--color-text-muted)]">Connect via the MCP endpoint:</p>
      <EndpointInfo endpoint={endpoint} apiKey={apiKey} />
    </div>
  )
}

function ApiKeyDisplay({ apiKey, onRotate, rotating }: { apiKey: string; onRotate: () => void; rotating: boolean }) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  function copy() {
    copyText(apiKey).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  const display = revealed ? apiKey : `${apiKey.slice(0, 8)}${'•'.repeat(24)}${apiKey.slice(-4)}`
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-[var(--color-text)]">API Key</label>
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono text-sm text-[var(--color-text)] break-all">
          {display}
        </div>
        <button type="button" onClick={() => setRevealed(v => !v)} className="shrink-0 rounded-md border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
          {revealed ? 'Hide' : 'Reveal'}
        </button>
        <button type="button" onClick={copy} className="shrink-0 rounded-md border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onRotate} disabled={rotating} className="text-xs text-[var(--color-error)] hover:underline disabled:opacity-50 transition-colors">
          {rotating ? 'Rotating…' : 'Rotate key'}
        </button>
        <span className="text-xs text-[var(--color-text-muted)]">Rotating invalidates the current key immediately.</span>
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={[
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50',
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
      ].join(' ')}
    >
      <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1'].join(' ')} />
    </button>
  )
}

function SystemMcpSection() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['system-mcp-config'],
    queryFn: () => apiClient.getSystemMcpConfig(),
  })
  const { mutate, isPending } = useMutation({
    mutationFn: (enabled: boolean) => apiClient.updateSystemMcpConfig(enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['system-mcp-config'] }),
  })

  if (isLoading) return <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>

  const enabled = data?.enabled ?? true

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">MCPs — System</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Global on/off switch for MCP across all organisations. Disabling this overrides any org or property setting.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">MCP globally enabled</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              When off, all MCP connections are rejected regardless of org or property settings.
            </p>
          </div>
          <Toggle checked={enabled} onChange={() => mutate(!enabled)} disabled={isPending} />
        </div>
        {!enabled && (
          <p className="mt-4 rounded-lg border border-[var(--color-error)]/40 bg-red-50 px-4 py-2.5 text-xs text-[var(--color-error)]">
            MCP is globally disabled. All API key connections will be rejected.
          </p>
        )}
      </div>
    </div>
  )
}

export default function AdminMcpPage() {
  const qc = useQueryClient()
  const { propertyId, orgId } = useAdminProperty()
  const { admin } = useAdminAuth()

  const isSystemLevel = admin?.role === 'super' && orgId === null && propertyId === null
  const isPropertyLevel = propertyId !== null
  const superOrgId = admin?.role === 'super' ? (orgId ?? undefined) : undefined

  const mcpQKey = isPropertyLevel
    ? ['admin-mcp-property', propertyId]
    : ['admin-mcp-org', superOrgId]
  const channelsQKey = ['admin-ai-channels', superOrgId]
  const oauthQKey = ['admin-mcp-oauth', superOrgId]

  // All hooks must be called unconditionally — no early returns before this point
  const { data: mcpData, isLoading: mcpLoading } = useQuery({
    queryKey: mcpQKey,
    queryFn: () =>
      isPropertyLevel
        ? apiClient.getPropertyMcpConfig(propertyId!)
        : apiClient.getOrgMcpConfig(superOrgId),
    enabled: !isSystemLevel,
  })

  const { data: channelsData, isLoading: channelsLoading } = useQuery({
    queryKey: channelsQKey,
    queryFn: () => apiClient.getOrgAIChannels(superOrgId),
    enabled: !isSystemLevel,
  })

  const { data: oauthData, refetch: refetchOAuth } = useQuery({
    queryKey: oauthQKey,
    queryFn: () => apiClient.getMcpOAuthConfig(),
    enabled: !isSystemLevel,
  })

  const [mcpEndpoint, setMcpEndpoint] = useState('/api/v1/mcp')
  useEffect(() => { setMcpEndpoint(getMcpEndpoint()) }, [])

  const [enabled, setEnabled] = useState(false)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [platform, setPlatform] = useState<Platform>('claude')
  const [enableError, setEnableError] = useState<string | null>(null)
  const [channelModels, setChannelModels] = useState<AIChannelSettings['mcp']>([])

  useEffect(() => {
    if (!mcpData) return
    setEnabled(mcpData.enabled)
    setApiKey(mcpData.apiKey)
  }, [mcpData])

  useEffect(() => {
    if (!channelsData) return
    setChannelModels(channelsData.mcp)
  }, [channelsData])

  const { mutate: updateConfig, isPending: saving } = useMutation({
    mutationFn: (nextEnabled: boolean) =>
      apiClient.updateMcpConfig({
        enabled: nextEnabled,
        ...(isPropertyLevel ? { propertyId: propertyId! } : {}),
        ...((!isPropertyLevel && superOrgId !== undefined) ? { orgId: superOrgId } : {}),
      }),
    onSuccess: (res) => {
      setEnabled(res.enabled)
      setApiKey(res.apiKey)
      setEnableError(null)
      qc.invalidateQueries({ queryKey: mcpQKey })
    },
    onError: (err) => {
      setEnableError(err instanceof Error ? err.message : 'Failed to update')
    },
  })

  const { mutate: rotateKey, isPending: rotating } = useMutation({
    mutationFn: () =>
      apiClient.rotateMcpApiKey({
        ...(isPropertyLevel ? { propertyId: propertyId! } : {}),
        ...((!isPropertyLevel && superOrgId !== undefined) ? { orgId: superOrgId } : {}),
      }),
    onSuccess: (res) => {
      setApiKey(res.apiKey)
      qc.invalidateQueries({ queryKey: mcpQKey })
    },
  })

  const { mutate: rotateClaudeSecret, isPending: rotatingClaude } = useMutation({
    mutationFn: () => apiClient.rotateClaudeClientSecret(),
    onSuccess: () => { void refetchOAuth() },
  })

  const { mutate: updateChannels, isPending: channelsSaving } = useMutation({
    mutationFn: (mcp: AIChannelSettings['mcp']) =>
      apiClient.updateOrgAIChannels({ mcp }, superOrgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: channelsQKey })
    },
  })

  function toggleChannelModel(model: 'b2c' | 'b2b') {
    const next = channelModels.includes(model)
      ? channelModels.filter(m => m !== model)
      : [...channelModels, model]
    setChannelModels(next)
    updateChannels(next)
  }

  // Early returns after all hooks
  if (isSystemLevel) return <SystemMcpSection />

  if (mcpLoading || channelsLoading) {
    return <div className="flex h-40 items-center justify-center text-sm text-[var(--color-text-muted)]">Loading…</div>
  }

  const channelActive = channelModels.length > 0

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">MCPs</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Model Context Protocol lets AI platforms like Claude, Cursor, and OpenAI query live room availability and create booking links directly from chat.
        </p>
      </div>

      {/* Server config */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-[var(--color-text)]">
              MCP Server — {isPropertyLevel ? 'property level' : 'chain level'}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              {isPropertyLevel
                ? 'AI platforms query availability for this property only.'
                : 'AI platforms can query all properties in this chain.'}
            </p>
          </div>
          <Toggle checked={enabled} onChange={() => updateConfig(!enabled)} disabled={saving} />
        </div>

        {enableError && (
          <p className="rounded-lg border border-[var(--color-error)]/40 bg-red-50 px-4 py-2.5 text-xs text-[var(--color-error)]">
            {enableError}
          </p>
        )}

        <div className="space-y-1">
          <label className="text-sm font-medium text-[var(--color-text)]">MCP Endpoint</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono text-sm text-[var(--color-text)] break-all">
              {mcpEndpoint}
            </div>
            <button type="button" onClick={() => copyText(mcpEndpoint)} className="shrink-0 rounded-md border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
              Copy
            </button>
          </div>
        </div>

        {apiKey ? (
          <ApiKeyDisplay apiKey={apiKey} onRotate={() => rotateKey()} rotating={rotating} />
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">Enable the MCP server to generate an API key.</p>
        )}
      </div>

      {/* OAuth — built-in server for ChatGPT & Claude.ai */}
      {oauthData && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium text-[var(--color-text)]">OAuth Connection</h2>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                Built-in OAuth 2.0 server — no external service needed. ChatGPT and Claude.ai users sign in with their hotel admin credentials.
              </p>
            </div>
            <span className="shrink-0 rounded bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">Active</span>
          </div>

          {/* Claude.ai static credentials */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--color-text)]">Claude.ai credentials</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              Paste these into the <strong>Add custom connector</strong> dialog under <strong>Advanced settings</strong>.
            </p>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 font-mono text-xs space-y-2">
              {[
                ['OAuth Client ID', oauthData.claude.clientId],
                ['OAuth Client Secret', oauthData.claude.clientSecret],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-[var(--color-text-muted)] w-36 shrink-0">{label}</span>
                  <span className="text-[var(--color-text)] break-all flex-1">{value}</span>
                  <button type="button" onClick={() => copyText(value ?? '')} className="shrink-0 text-[var(--color-primary)] hover:underline text-xs">Copy</button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => rotateClaudeSecret()}
              disabled={rotatingClaude}
              className="text-xs text-[var(--color-error)] hover:underline disabled:opacity-50"
            >
              {rotatingClaude ? 'Rotating…' : 'Rotate secret'}
            </button>
          </div>

          {/* ChatGPT DCR info */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--color-text)]">ChatGPT — Dynamic Registration</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              ChatGPT registers itself automatically using the DCR endpoint below — no manual credentials needed.
            </p>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono text-xs text-[var(--color-text)] break-all">
              {oauthData.registerUrl}
            </div>
          </div>

          {/* Discovery URL */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-[var(--color-text)]">OAuth discovery</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono text-xs text-[var(--color-text)] break-all">
                {oauthData.discoveryUrl}
              </div>
              <button type="button" onClick={() => copyText(oauthData.discoveryUrl)} className="shrink-0 rounded-md border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">Copy</button>
            </div>
          </div>
        </div>
      )}

      {/* AI Channels — MCP access */}
      <div className={[
        'rounded-xl border-2 p-6 space-y-4',
        !channelActive ? 'border-[var(--color-error)]/30 bg-red-50/50' : 'border-[var(--color-primary)] bg-[var(--color-primary-light)]',
      ].join(' ')}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-[var(--color-text)]">Channel Access</h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Controls which sales models can connect via MCP. Configured in{' '}
              <Link href="/admin/config/ai/channels" className="text-[var(--color-primary)] hover:underline">
                AI Channels
              </Link>.
            </p>
          </div>
          {!channelActive && enabled && (
            <span className="shrink-0 rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
              No access configured
            </span>
          )}
        </div>

        <div className="flex items-center gap-6">
          {(['b2c', 'b2b'] as const).map(model => {
            const active = channelModels.includes(model)
            return (
              <label key={model} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleChannelModel(model)}
                  disabled={channelsSaving}
                  className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                />
                <span className={['text-sm font-medium', active ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'].join(' ')}>
                  {model.toUpperCase()}
                </span>
                <span className={['text-xs font-semibold', active ? 'text-green-700' : 'text-[var(--color-text-muted)]'].join(' ')}>
                  {active ? 'On' : 'Off'}
                </span>
              </label>
            )
          })}
        </div>

        {enabled && !channelActive && (
          <p className="text-xs text-[var(--color-error)]">
            The MCP server is enabled but no sales model has channel access. Enable at least one to allow connections.
          </p>
        )}
        {!enabled && channelActive && (
          <p className="text-xs text-amber-600">
            Channel access is configured but the MCP server is disabled. Enable the server above to activate it.
          </p>
        )}
      </div>

      {/* Platform setup */}
      {apiKey && enabled && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
          <h2 className="text-sm font-medium text-[var(--color-text)]">Platform Setup</h2>
          <div className="flex flex-wrap gap-1 border-b border-[var(--color-border)] pb-1">
            {PLATFORMS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlatform(p.id)}
                className={[
                  'rounded-t px-3 py-1.5 text-xs font-medium transition-colors',
                  platform === p.id
                    ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
                ].join(' ')}
              >
                {p.label}
              </button>
            ))}
          </div>
          <PlatformSnippet platform={platform} endpoint={mcpEndpoint} apiKey={apiKey} />
        </div>
      )}

      {/* Available tools */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-3">
        <h2 className="text-sm font-medium text-[var(--color-text)]">Available Tools</h2>
        <div className="space-y-2">
          {[
            { name: 'search_availability', desc: 'Search available rooms for given dates and guests.' },
            { name: 'get_property_info', desc: 'Get hotel name, location, star rating, facilities, and description.' },
            { name: 'get_room_details', desc: 'Get detailed information about a specific room type.' },
            { name: 'create_booking_link', desc: 'Generate a direct booking URL for the guest to complete payment.' },
          ].map(tool => (
            <div key={tool.name} className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
              <code className="shrink-0 text-xs font-mono text-[var(--color-primary)]">{tool.name}</code>
              <span className="text-xs text-[var(--color-text-muted)]">{tool.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

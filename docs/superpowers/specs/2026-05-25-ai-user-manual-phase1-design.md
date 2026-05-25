# AI-Generated User Manual — Phase 1 Design

**Date:** 2026-05-25
**Scope:** Phase 1 — Manual generation, role-based serving, help icon in admin header
**Phase 2 (separate spec):** AI conversational help chat powered by the generated manual

---

## Overview

Replace the static PDF upload with an AI-generated HTML manual. A super admin clicks "Generate with AI" and the system introspects the live codebase — reading admin page files and API route files — to produce a structured, role-aware manual via Claude. Hotel/chain admins see only their relevant sections; super admins see everything. A `?` help icon in the admin header gives all users one-click access to the manual from anywhere in the platform.

---

## 1. Generation Pipeline

### Trigger
`POST /admin/super/manual/generate` — super admin only, streams SSE.

### Sections Config
A pre-defined array of section descriptors:
```ts
{ id: string, title: string, audience: 'hotel' | 'super' | 'both', files: string[] }
```
`files` lists paths (relative to repo root) of the relevant admin page `.tsx` files and API route files for that section.

### Hotel/Both Sections
| Section | Audience |
|---|---|
| Dashboard | both |
| Bookings | both |
| Design — Chain | hotel |
| Design — Hotel | hotel |
| Config: Properties | both |
| Config: Offers & Pricing | both |
| Config: Groups | both |
| Config: AI & Channels | both |
| Config: Communication | both |
| Config: Weather & Maps | both |
| Config: Events | both |
| Config: Marketing | both |
| Conversion: Onsite, Price Comparison, Promo Codes | both |
| Affiliates | both |
| Campaigns | both |
| Clusters | both |
| B2B | both |
| Users & Guests | both |

### Super-Only Sections
| Section | Audience |
|---|---|
| Organizations | super |
| System Design & Config | super |
| Domain & Deployment | super |
| Test Bookings | super |
| Manual Management | super |
| MCP & Integrations | super |

### Generation Loop
For each section in order:
1. Read all files listed in `files` from disk
2. Emit SSE event `{ type: 'section:start', title }`
3. Call Claude API with system + user prompt (see Section 4)
4. Emit SSE event `{ type: 'section:done', title }`

On completion: emit `{ type: 'complete' }` and save output.
On error: emit `{ type: 'error', title, message }` — generation continues with remaining sections.

### Output Storage
Saved as JSON to a file at the path defined by `MANUAL_JSON_PATH` env var (defaults to `./data/HG-IBE-Admin-Manual.json` relative to the API process). The API serves the HTML directly — no need for the file to be in the web app's public directory. On Render the API and web app are separate services so a shared filesystem path is not available.
```ts
{
  generatedAt: string,          // ISO timestamp
  sections: [{
    id: string,
    title: string,
    audience: 'hotel' | 'super' | 'both',
    markdown: string,
  }]
}
```

---

## 2. Serving & Role Filtering

### Route
`GET /admin/manual` — authenticated, all admin roles.

### Behaviour
1. Read the stored JSON file
2. Filter sections by caller's role:
   - `hotel` / `chain` roles: include `audience === 'hotel'` and `audience === 'both'`
   - `super` role: include all sections
3. Convert each section's markdown to HTML (using `marked`)
4. Return a self-contained styled HTML page

### Download Variants (super only)
- `GET /admin/manual?download=true` — full manual (all sections), `Content-Disposition: attachment; filename=HG-IBE-Admin-Manual-Full.html`
- `GET /admin/manual?download=true&audience=hotel` — hotel version only, `Content-Disposition: attachment; filename=HG-IBE-Admin-Manual-Hotel.html`

### Not-yet-generated State
If no JSON file exists, return a minimal HTML page: "Manual not yet generated. A super admin can generate it from Config → Manual."

---

## 3. Admin UI Changes

### Manual Page (`/admin/config/manual`)

**Generation panel** (super only):
- "Generate with AI" button
- While generating: live progress list — section names appear and tick off as SSE `section:done` events arrive (same pattern as bulk translation SSE)
- On completion: "Last generated: [date]" + "View Manual" button (opens `GET /admin/manual` in new tab)
- On partial error: list which sections failed, with a "Retry" button

**Downloads panel** (super only, shown only after a manual exists):
- "Download: Full manual" → `GET /admin/manual?download=true`
- "Download: Hotel admin version" → `GET /admin/manual?download=true&audience=hotel`

**Existing PDF upload** — retained as-is below the AI section. Super can still manually upload a PDF override.

### Help Icon in Admin Header

A `?` icon button added to the admin header, top-right, before existing controls. Visible to all admin roles. On click: opens `GET /admin/manual` in a new tab. Rendered as a simple round button consistent with the admin aesthetic. No modal, no side panel.

---

## 4. Claude Prompt Strategy

### System Prompt
```
You are writing a user manual for HG-IBE, a hotel booking engine admin panel used by hotel and chain operators. Write clear, practical, step-by-step documentation. Use markdown with headers (##, ###), bullet points, and short paragraphs. No fluff, no repetition. Focus on what the user needs to do and why.
```

### User Prompt Per Section
```
Section: {title}
Audience: {audience description}

Below are the relevant source files for this section. Extract the meaningful UI elements (field labels, toggle descriptions, hints, section headers, available options) and write a clear manual section covering: what this section does, the key settings and what they control, and common tasks a user would perform here.

--- FILES ---
{concatenated file contents}
```

### Model
Use the existing Claude API integration (`claude-sonnet-4-6` or configured provider). No streaming of the Claude response itself — collect full section text before emitting `section:done`, to keep the SSE events clean.

---

## 5. Dependencies & Constraints

- **`marked`** — add as dependency to `apps/api` for markdown → HTML conversion
- **`MANUAL_JSON_PATH`** env var — defaults to `./data/HG-IBE-Admin-Manual.json`; must be writable by the API process on Render (use a persistent disk mount)
- **File size** — each section prompt may include 2–5 source files; total context per call stays well within Claude's context window
- **Generation time** — ~20 sections × ~5s per Claude call ≈ 90–120 seconds total; SSE keeps the UI responsive throughout
- **Auth** — `GET /admin/manual` uses the existing `fastify.authenticate` hook; the `?` help icon links to this route so it requires the admin to be logged in

---

## 6. Out of Scope (Phase 2)

- AI conversational help chat powered by the manual
- Automatic regeneration on deploy
- Per-page contextual help links
- Manual versioning / history

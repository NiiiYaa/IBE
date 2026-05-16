# Airport Distance Slider — Design Spec

**Date:** 2026-05-16

## Overview

Add a horizontal distance slider to the right side of the `NearestAirports` strip header. Dragging it re-queries the API with the new radius, potentially revealing more airports than the admin-configured max count. Slider range is fixed at 0–300 km.

---

## Backend

### `NearestAirportsResponse` (shared type)

Add one field:

```ts
radiusKm: number   // effective radius used (system config or guest override)
```

### Service: `getNearestAirports(propertyId, radiusKmOverride?)`

- Accepts an optional `radiusKmOverride: number`
- When provided: use it as the search radius and cap `maxCount` at **20** (ignores admin-configured max)
- When absent: behaviour unchanged (uses system config radius and maxCount)

### Route: `GET /api/v1/airports/nearest`

- Add optional `radiusKm` query param (integer)
- Parse and forward to service as `radiusKmOverride`
- `radiusKm` is clamped to `[1, 300]` before passing to the service

### `apiClient.getNearestAirports(propertyId, radiusKm?)`

Add optional second argument; when present, appends `&radiusKm=N` to the query string.

---

## Frontend: `NearestAirports.tsx`

### State

```ts
const [radiusKm, setRadiusKm] = useState<number | null>(null)   // null until first data loads
const [debouncedRadius, setDebouncedRadius] = useState<number | null>(null)
```

`radiusKm` is the live slider value (updates on every drag tick for the label).
`debouncedRadius` triggers the re-query (updates 400 ms after the last drag).

### Query

```ts
useQuery({
  queryKey: ['nearest-airports', propertyId, debouncedRadius],
  queryFn: () => apiClient.getNearestAirports(propertyId, debouncedRadius ?? undefined),
  enabled: propertyId > 0,
})
```

On first load (`debouncedRadius === null`), no `radiusKm` param is sent → system default applies.
When data arrives for the first time, initialise `radiusKm` and `debouncedRadius` from `data.radiusKm`.

### Debounce

`useEffect` on `radiusKm`: sets a 400 ms timer to update `debouncedRadius`. Clears on each change.

### Slider placement

Inside the header bar, on the right side — between the fold chevron and the dismiss button:

```
[✈ Nearest airports]          [10 ——●—— 300 km]  [▾] [✕]
```

The slider section shows the current value as a label next to the track (e.g. `100 km`).

Slider attributes: `type="range"`, `min={10}`, `max={300}`, `step={10}`.

Click on the slider container stops propagation so it does not trigger fold/unfold.

### Behaviour

- On mount: slider is hidden until first data loads (avoids flash of default value)
- After first load: slider appears at `data.radiusKm` (the system-configured default)
- Dragging: label updates immediately; re-query fires 400 ms after drag stops
- While re-querying: existing airport list stays visible (no loading spinner needed — the list just updates in place)
- If the new radius returns 0 airports: show an empty state inside the unfolded body (strip stays visible since it was previously showing airports)

---

## Files Changed

| File | Change |
|------|--------|
| `packages/shared/src/types/airport-config.ts` | Add `radiusKm: number` to `NearestAirportsResponse` |
| `apps/api/src/services/airport-config.service.ts` | Add `radiusKmOverride?` param to `getNearestAirports` |
| `apps/api/src/routes/airport-config.route.ts` | Parse optional `radiusKm` query param, clamp to [1, 300] |
| `apps/web/src/lib/api-client.ts` | Add optional `radiusKm` to `getNearestAirports` |
| `apps/web/src/components/hotel/NearestAirports.tsx` | Slider state, debounce, query key, header layout |

No new files. No DB changes. No translation keys.

---

## Out of Scope

- Persisting the guest's chosen radius across page loads
- Admin control over the guest-facing slider range
- Showing a loading indicator during re-query

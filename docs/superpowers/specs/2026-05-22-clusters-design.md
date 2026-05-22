# Clusters Feature Design

## Goal

Add a Clusters system that groups hotels into named sets and assigns system users to those clusters with scoped permissions, so a user's admin access is limited to only the hotels in their clusters.

## Background & decisions

All decisions reached in pre-design discussion:

- Clusters are **always within one organisation** — no cross-org clusters
- Existing org-level admins automatically get **global scope** (unchanged behaviour)
- **Super admins** are entirely unaffected
- No new role types — reuse existing roles (`admin` / `user` / `observer`) with a scope flag on the user
- Role is stored **per cluster assignment** (ClusterUser row), not per user — so John can be Admin in Cluster A and Observer in Cluster C
- Impersonation works via `adminId`-based DB lookup; only needs `clusterScope` added to JWT
- Soft delete = mark `status: 'inactive'`, hide from UI, never hard-delete

---

## Data model

### New tables

```prisma
model Cluster {
  id             Int           @id @default(autoincrement())
  organizationId Int
  name           String
  status         String        @default("active")   // "active" | "inactive"
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  hotels         ClusterHotel[]
  users          ClusterUser[]
}

model ClusterHotel {
  id          Int     @id @default(autoincrement())
  clusterId   Int
  propertyId  Int
  cluster     Cluster @relation(fields: [clusterId], references: [id])
  @@unique([clusterId, propertyId])
}

model ClusterUser {
  id          Int     @id @default(autoincrement())
  clusterId   Int
  adminUserId Int
  role        String  // "admin" | "user" | "observer"
  cluster     Cluster @relation(fields: [clusterId], references: [id])
  @@unique([clusterId, adminUserId])
}
```

### Change to AdminUser

```prisma
model AdminUser {
  // ... existing fields ...
  clusterScope  Boolean  @default(false)
  // clusterScope=false → global access to all org hotels (existing behaviour)
  // clusterScope=true  → access limited to assigned cluster hotels
}
```

### AdminPayload (JWT) change

```ts
interface AdminPayload {
  adminId: number
  organizationId: number | null
  role: string
  propertyIds?: number[]
  clusterScope?: boolean      // add this
  mustChangePassword?: boolean
  impersonatorId?: number
}
```

`clusterScope` is baked into the JWT at login and impersonation. Cluster membership itself is resolved from the DB per-request (fresh, not baked) using `adminId`.

---

## Access control

### Two helpers — the entire enforcement surface

```ts
// services/cluster-access.service.ts

async function resolveAccessiblePropertyIds(
  admin: AdminPayload,
): Promise<number[] | 'all'> {
  if (admin.role === 'super') return 'all'
  if (!admin.clusterScope) return 'all'   // global org admin

  const rows = await prisma.clusterHotel.findMany({
    where: {
      cluster: {
        organizationId: admin.organizationId!,
        status: 'active',
        users: { some: { adminUserId: admin.adminId } },
      },
    },
    select: { propertyId: true },
  })
  return rows.map(r => r.propertyId)
}

async function assertPropertyAccess(
  admin: AdminPayload,
  propertyId: number,
): Promise<void> {
  const ids = await resolveAccessiblePropertyIds(admin)
  if (ids !== 'all' && !ids.includes(propertyId)) {
    throw new ForbiddenError('No access to this property')
  }
}
```

Cache `resolveAccessiblePropertyIds` result in Redis with a 60-second TTL keyed by `adminId`. Invalidate on any cluster assignment change.

### Where enforcement is called

| Location | Change |
|---|---|
| `GET /admin/properties` (property selector) | Filter result by `resolveAccessiblePropertyIds` |
| All property-scoped route handlers | Add `assertPropertyAccess(request.admin, propertyId)` at top |
| `getAdminById` | Add `clusterScope` to returned object |
| `buildImpersonatePayload` | Copy `clusterScope` from target |
| `/auth/impersonate` route | Pass `target.clusterScope` into payload builder |

Nothing else changes. Every other part of the system enforces access through these two functions.

### Effective role resolution

When a cluster-scoped user accesses a hotel, their effective role = the role from their `ClusterUser` row for whichever cluster contains that hotel. If the hotel appears in multiple clusters the user belongs to, use the **highest** role (admin > user > observer).

```ts
async function resolveEffectiveRole(
  adminUserId: number,
  propertyId: number,
): Promise<'admin' | 'user' | 'observer' | null> {
  const rows = await prisma.clusterUser.findMany({
    where: {
      adminUserId,
      cluster: { status: 'active', hotels: { some: { propertyId } } },
    },
    select: { role: true },
  })
  if (rows.length === 0) return null
  const order = ['admin', 'user', 'observer']
  return rows.map(r => r.role).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] as 'admin' | 'user' | 'observer'
}
```

---

## API routes

All under `/admin/clusters`, authenticated, org-scoped.

```
GET    /admin/clusters                          list active clusters for org
POST   /admin/clusters                          create cluster { name }
PUT    /admin/clusters/:id                      update name
POST   /admin/clusters/:id/activate             set status=active
POST   /admin/clusters/:id/deactivate           set status=inactive
DELETE /admin/clusters/:id                      soft delete (set status=inactive)

GET    /admin/clusters/:id/hotels               list hotels in cluster
POST   /admin/clusters/:id/hotels               add hotel { propertyId }
DELETE /admin/clusters/:id/hotels/:propertyId   remove hotel

GET    /admin/clusters/:id/users                list users in cluster
POST   /admin/clusters/:id/users                assign user { adminUserId, role }
PUT    /admin/clusters/:id/users/:adminUserId   change role
DELETE /admin/clusters/:id/users/:adminUserId   remove user

GET    /admin/cluster-users/:adminUserId        all cluster assignments for a user (Users tab)
PATCH  /admin/admin-users/:id/cluster-scope     toggle clusterScope on/off
```

---

## UI structure

### Navigation

Team menu → **Clusters** sub-menu (new item, visible to org admins and super admins only).

### Three tabs

#### 1. Configurations *(primary day-to-day view)*

List of clusters as cards, collapsed by default. Create button at top.

**Collapsed:**
```
● Cluster A — Tel Aviv Properties          [Edit] [▾]
○ Cluster B — North Region (inactive)      [Edit] [▾]
```

**Expanded:**
```
● Cluster A — Tel Aviv Properties          [Edit] [▴]

  Hotels (3)                          [+ Add Hotel]
  · Grand Hotel Tel Aviv                      [✕]
  · Sea View Boutique                         [✕]
  · Port Suites                               [✕]

  Users (2)                            [+ Add User]
  · John Smith        Admin       [Change] [✕]
  · Sarah Cohen       Observer    [Change] [✕]

  [Deactivate]  [Delete]
```

- Add Hotel → dropdown of org hotels not yet in this cluster
- Add User → dropdown of org admin users + role selector
- Change role → inline role selector
- Deactivate / Activate toggle in place
- Delete → confirmation step → soft delete (hides card)

#### 2. Hotels *(hotel-centric cross-cluster audit)*

Table: every hotel in the org, showing which clusters it belongs to.

```
Hotel                    Clusters                        Actions
─────────────────────────────────────────────────────────────────
Grand Hotel Tel Aviv     Cluster A, Cluster C            [Manage]
Sea View Boutique        Cluster A                       [Manage]
Haifa Beach Resort       (unassigned)                    [Manage]
```

"Manage" opens a panel to add/remove this hotel from clusters.

#### 3. Users *(user-centric cross-cluster audit)*

Table: every admin user in the org, showing scope and cluster assignments.

```
User              Scope     Clusters & Roles                          Actions
──────────────────────────────────────────────────────────────────────────────
John Smith        Cluster   Cluster A (Admin), Cluster B (Admin)      [Manage]
Sarah Cohen       Cluster   Cluster C (Observer)                      [Manage]
David Levi        Global    All hotels in org                          [→ Cluster]
```

- `[→ Cluster]` switches a global user to cluster scope (sets `clusterScope=true`)
- `[Manage]` opens panel to add/remove cluster assignments and change per-cluster role
- Converting Global → Cluster requires at least one cluster assignment first (guard)
- Converting Cluster → Global clears all assignments and sets `clusterScope=false`

---

## Shared types

```ts
export interface Cluster {
  id: number
  organizationId: number
  name: string
  status: 'active' | 'inactive'
  hotelCount: number
  userCount: number
}

export interface ClusterDetail extends Cluster {
  hotels: { propertyId: number; propertyName: string }[]
  users: { adminUserId: number; name: string; email: string; role: ClusterRole }[]
}

export type ClusterRole = 'admin' | 'user' | 'observer'

export interface ClusterUser {
  clusterId: number
  adminUserId: number
  role: ClusterRole
}

export interface AdminClusterSummary {
  adminUserId: number
  name: string
  email: string
  clusterScope: boolean
  assignments: { clusterId: number; clusterName: string; role: ClusterRole }[]
}
```

---

## Migration

1. Add `clusterScope Boolean @default(false)` to `AdminUser` — all existing users get `false` (global scope, unchanged behaviour)
2. Create `Cluster`, `ClusterHotel`, `ClusterUser` tables
3. No data backfill needed — clusters start empty

---

## Out of scope (this phase)

- Cluster-level branding or config overrides
- Cross-org clusters
- Cluster-scoped API keys
- Audit log for cluster assignment changes

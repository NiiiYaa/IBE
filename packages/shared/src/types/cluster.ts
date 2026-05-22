export type ClusterRole = 'admin' | 'user' | 'observer'

export interface Cluster {
  id: number
  organizationId: number
  name: string
  status: 'active' | 'inactive'
  hotelCount: number
  userCount: number
}

export interface ClusterHotelEntry {
  propertyId: number
  propertyName: string
}

export interface ClusterUserEntry {
  adminUserId: number
  name: string
  email: string
  role: ClusterRole
}

export interface ClusterDetail {
  id: number
  organizationId: number
  name: string
  status: 'active' | 'inactive'
  hotels: ClusterHotelEntry[]
  users: ClusterUserEntry[]
}

export interface HotelClusterRow {
  propertyId: number
  propertyName: string
  clusters: { id: number; name: string }[]
}

export interface AdminClusterSummary {
  adminUserId: number
  name: string
  email: string
  clusterScope: boolean
  assignments: { clusterId: number; clusterName: string; role: ClusterRole }[]
}

export interface CreateClusterRequest {
  name: string
}
export interface UpdateClusterRequest {
  name: string
}
export interface AddHotelToClusterRequest {
  propertyId: number
}
export interface AddUserToClusterRequest {
  adminUserId: number
  role: ClusterRole
}
export interface UpdateUserClusterRoleRequest {
  role: ClusterRole
}
export interface SetClusterScopeRequest {
  clusterScope: boolean
}

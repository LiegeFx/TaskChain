import { sql } from '@/lib/db'

export const SEARCH_LIMIT_DEFAULT = 3
export const SEARCH_LIMIT_MAX = 10

export interface ProjectResult {
  type: 'project'
  id: string
  title: string
  status: string
  budgetUsdc: number
}

export interface ContractResult {
  type: 'contract'
  id: string
  totalAmount: string
  currency: string
  status: string
}

export interface FreelancerResult {
  type: 'freelancer'
  id: string
  name: string
  bio: string
  skills: string[]
  rating: number
}

export interface ClientResult {
  type: 'client'
  id: string
  name: string
  walletAddress: string
}

export type SearchResult =
  | ProjectResult
  | ContractResult
  | FreelancerResult
  | ClientResult

export interface GlobalSearchResponse {
  query: string
  results: SearchResult[]
  counts: { projects: number; contracts: number; freelancers: number; clients: number }
}

export async function searchProjects(q: string, limit: number): Promise<ProjectResult[]> {
  const needle = `%${q}%`
  const rows = await sql`
    SELECT id, title, status, budget_usdc
    FROM projects
    WHERE title ILIKE ${needle} OR description ILIKE ${needle}
    ORDER BY created_at DESC
    LIMIT ${limit}
  ` as Record<string, unknown>[]
  return rows.map(r => ({
    type: 'project',
    id: r.id as string,
    title: r.title as string,
    status: r.status as string,
    budgetUsdc: Number(r.budget_usdc),
  }))
}

export async function searchContracts(q: string, limit: number): Promise<ContractResult[]> {
  const needle = `%${q}%`
  const rows = await sql`
    SELECT id, total_amount, currency, status
    FROM contracts
    WHERE id::text ILIKE ${needle}
       OR status ILIKE ${needle}
    ORDER BY created_at DESC
    LIMIT ${limit}
  ` as Record<string, unknown>[]
  return rows.map(r => ({
    type: 'contract',
    id: r.id as string,
    totalAmount: r.total_amount as string,
    currency: r.currency as string,
    status: r.status as string,
  }))
}

export async function searchFreelancers(q: string, limit: number): Promise<FreelancerResult[]> {
  const needle = `%${q}%`
  const rows = await sql`
    SELECT id, username, bio, skills, avg_rating
    FROM users
    WHERE role = 'freelancer'
      AND (
        username ILIKE ${needle}
        OR bio ILIKE ${needle}
        OR EXISTS (
          SELECT 1 FROM unnest(COALESCE(skills, ARRAY[]::text[])) s
          WHERE s ILIKE ${needle}
        )
      )
    ORDER BY avg_rating DESC NULLS LAST
    LIMIT ${limit}
  ` as Record<string, unknown>[]
  return rows.map(r => ({
    type: 'freelancer',
    id: r.id as string,
    name: r.username as string,
    bio: (r.bio as string) ?? '',
    skills: (r.skills as string[]) ?? [],
    rating: Number(r.avg_rating ?? 0),
  }))
}

export async function searchClients(q: string, limit: number): Promise<ClientResult[]> {
  const needle = `%${q}%`
  const rows = await sql`
    SELECT id, username, wallet_address
    FROM users
    WHERE role = 'client'
      AND (username ILIKE ${needle} OR wallet_address ILIKE ${needle})
    ORDER BY created_at DESC
    LIMIT ${limit}
  ` as Record<string, unknown>[]
  return rows.map(r => ({
    type: 'client',
    id: r.id as string,
    name: r.username as string,
    walletAddress: (r.wallet_address as string) ?? '',
  }))
}

export async function globalSearch(q: string, limit: number): Promise<GlobalSearchResponse> {
  const [projects, contracts, freelancers, clients] = await Promise.all([
    searchProjects(q, limit),
    searchContracts(q, limit),
    searchFreelancers(q, limit),
    searchClients(q, limit),
  ])
  return {
    query: q,
    results: [...projects, ...contracts, ...freelancers, ...clients],
    counts: {
      projects: projects.length,
      contracts: contracts.length,
      freelancers: freelancers.length,
      clients: clients.length,
    },
  }
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'
import { getUserById } from '@/lib/contracts/store'

export const GET = withAuth(async (request: NextRequest, auth) => {
  try {
    const url = new URL(request.url)
    const id = url.pathname.split('/').pop()

    if (!id || isNaN(Number(id))) {
      return NextResponse.json({ error: 'Invalid contract ID', code: 'INVALID_CONTRACT_ID' }, { status: 400 })
    }

    const contractId = Number(id)
    const walletAddress = auth.walletAddress

    // Fetch contract
    const contractRows = await sql`
      SELECT c.*, j.title as job_title
      FROM contracts c
      JOIN jobs j ON j.id = c.job_id
      WHERE c.id = ${contractId}
      LIMIT 1
    `

    if (contractRows.length === 0) {
      return NextResponse.json({ error: 'Contract not found', code: 'CONTRACT_NOT_FOUND' }, { status: 404 })
    }

    const contract = contractRows[0]

    // Verify access: client or freelancer
    const clientRows = await sql`
      SELECT id FROM users WHERE wallet_address = ${walletAddress} LIMIT 1
    `
    const clientRow = clientRows[0]

    if (!clientRow || (clientRow.id !== contract.client_id && clientRow.id !== contract.freelancer_id)) {
      return NextResponse.json({ error: 'Access denied', code: 'ACCESS_DENIED' }, { status: 403 })
    }

    // Fetch client
    const client = await getUserById(contract.client_id)

    // Fetch freelancer
    const freelancer = await getUserById(contract.freelancer_id)

    // Fetch milestones linked to this contract
    const milestoneRows = await sql`
      SELECT id, title, description, amount, currency, due_date, status, sort_order
      FROM milestones
      WHERE contract_id = ${contractId}
      ORDER BY sort_order ASC, due_date ASC
    `
    const contractMilestones = milestoneRows.map((m: {
      id: number
      title: string
      description: string | null
      amount: string
      currency: string
      due_date: string | null
      status: string
      sort_order: number
    }) => ({
      id: String(m.id),
      title: m.title,
      description: m.description,
      amount: m.amount,
      currency: m.currency,
      due_date: m.due_date,
      status: m.status,
      sort_order: m.sort_order,
    }))

    // Fetch escrow info if available
    const escrowRows = await sql`
      SELECT escrow_address, escrow_status, funded_at, funding_tx_hash, total_amount as escrow_total_amount,
             funded_amount, released_amount, progress_percent, network_passphrase
      FROM jobs
      WHERE id = ${contract.job_id}
      LIMIT 1
    `
    const escrowRaw = escrowRows[0] as {
      escrow_address: string | null
      escrow_status: string | null
      funded_at: string | null
      funding_tx_hash: string | null
      escrow_total_amount: string
      funded_amount: number
      released_amount: number
      progress_percent: number
      network_passphrase: string | null
    } | undefined

    const escrow = escrowRaw ? {
      escrow_address: escrowRaw.escrow_address,
      escrow_status: escrowRaw.escrow_status ?? 'draft',
      total_amount: escrowRaw.escrow_total_amount,
      funded_amount: escrowRaw.funded_amount,
      released_amount: escrowRaw.released_amount,
      progress_percent: escrowRaw.progress_percent,
      network_passphrase: escrowRaw.network_passphrase,
      funded_at: escrowRaw.funded_at,
      funding_tx_hash: escrowRaw.funding_tx_hash,
    } : null

    const response = {
      contract: {
        id: String(contract.id),
        job_id: String(contract.job_id),
        job_title: contract.job_title,
        status: contract.status,
        total_amount: contract.total_amount,
        currency: contract.currency,
        terms: contract.terms,
        contract_address: contract.contract_address,
        created_at: contract.created_at,
        updated_at: contract.updated_at,
        client: client
          ? {
              display_name: (client as unknown as { display_name?: string | null }).display_name ?? null,
              username: (client as unknown as { username?: string }).username ?? 'unknown',
              avatar_url: (client as unknown as { avatar_url?: string | null }).avatar_url ?? null,
              wallet_address: client.wallet_address,
              avg_rating: (client as unknown as { avg_rating?: number }).avg_rating,
              total_reviews: (client as unknown as { total_reviews?: number }).total_reviews,
            }
          : null,
        freelancer: freelancer
          ? {
              display_name: (freelancer as unknown as { display_name?: string | null }).display_name ?? null,
              username: (freelancer as unknown as { username?: string }).username ?? 'unknown',
              avatar_url: (freelancer as unknown as { avatar_url?: string | null }).avatar_url ?? null,
              wallet_address: freelancer.wallet_address,
              avg_rating: (freelancer as unknown as { avg_rating?: number }).avg_rating,
              total_reviews: (freelancer as unknown as { total_reviews?: number }).total_reviews,
            }
          : null,
        escrow,
        milestones: contractMilestones,
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[GET /api/contracts/[id]]', error)
    return NextResponse.json({ error: 'Failed to load contract', code: 'SERVER_ERROR' }, { status: 500 })
  }
})
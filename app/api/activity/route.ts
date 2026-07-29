export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withRbac, RbacContext } from '@/lib/auth/rbacMiddleware'
import { activityService } from '@/lib/activity'

export const GET = withRbac('activity:view', async (request: NextRequest, auth: RbacContext) => {
  try {
    const { searchParams } = new URL(request.url)

    const result = await activityService.list(
      {
        walletAddress: auth.walletAddress,
        limitParam: searchParams.get('limit'),
        offsetParam: searchParams.get('offset'),
        contractId: searchParams.get('contractId'),
        projectId: searchParams.get('projectId'),
        actionType: searchParams.get('actionType'),
        actorId: searchParams.get('actorId'),
      },
      auth.userId,
      auth.role
    )

    return NextResponse.json(result)
  } catch (err) {
    console.error('[activity] Failed to list activity logs:', err)
    return NextResponse.json(
      { error: 'Failed to fetch activity logs', code: 'ACTIVITY_FETCH_FAILED' },
      { status: 500 }
    )
  }
})
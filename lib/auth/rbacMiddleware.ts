import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from './middleware'
import { sql } from '@/lib/db'
import { UserRole, Permission, hasPermission } from './constants'

export interface RbacContext extends AuthContext {
  userId: string
  role: UserRole
}

type RbacHandler = (
  request: NextRequest,
  auth: RbacContext
) => Promise<NextResponse> | NextResponse

/**
 * Middleware that enforces role-based access control.
 * Fetches the user's role from the database and checks if they have the required permission.
 * 
 * @param requiredPermission - The permission required to access the route
 * @param handler - The route handler to execute if authorization succeeds
 * 
 * @example
 * export const POST = withRbac('project:create', async (request, auth) => {
 *   // Only users with 'project:create' permission can reach here
 *   return NextResponse.json({ success: true })
 * })
 */
export function withRbac(requiredPermission: Permission, handler: RbacHandler) {
  return withAuth(async (request: NextRequest, auth: AuthContext): Promise<NextResponse> => {
    try {
      // Fetch user from database by walletAddress to get role and id
      const result = await sql`
        SELECT id, role
        FROM users
        WHERE wallet_address = ${auth.walletAddress}
      `

      if (result.length === 0) {
        return NextResponse.json(
          { error: 'User not found', code: 'USER_NOT_FOUND' },
          { status: 404 }
        )
      }

      const { id, role } = result[0]

      // Validate that the role is a valid UserRole
      if (!isValidRole(role)) {
        return NextResponse.json(
          { error: 'Invalid user role', code: 'INVALID_ROLE' },
          { status: 500 }
        )
      }

      // Check if the user has the required permission
      if (!hasPermission(role as UserRole, requiredPermission)) {
        return NextResponse.json(
          { 
            error: 'Forbidden', 
            code: 'INSUFFICIENT_PERMISSIONS',
            required: requiredPermission,
            role: role
          },
          { status: 403 }
        )
      }

      // Extend auth context with userId and role
      const rbacAuth: RbacContext = {
        ...auth,
        userId: id,
        role: role as UserRole
      }

      return handler(request, rbacAuth)
    } catch (error) {
      console.error('RBAC middleware error:', error)
      return NextResponse.json(
        { error: 'Internal server error', code: 'INTERNAL_ERROR' },
        { status: 500 }
      )
    }
  })
}

/**
 * Middleware that requires any of the specified permissions.
 * Access is granted if the user has at least one of the required permissions.
 * 
 * @param requiredPermissions - Array of permissions (any one will grant access)
 * @param handler - The route handler to execute if authorization succeeds
 */
export function withAnyRbac(requiredPermissions: Permission[], handler: RbacHandler) {
  return withAuth(async (request: NextRequest, auth: AuthContext): Promise<NextResponse> => {
    try {
      // Fetch user from database by walletAddress to get role and id
      const result = await sql`
        SELECT id, role
        FROM users
        WHERE wallet_address = ${auth.walletAddress}
      `

      if (result.length === 0) {
        return NextResponse.json(
          { error: 'User not found', code: 'USER_NOT_FOUND' },
          { status: 404 }
        )
      }

      const { id, role } = result[0]

      // Validate that the role is a valid UserRole
      if (!isValidRole(role)) {
        return NextResponse.json(
          { error: 'Invalid user role', code: 'INVALID_ROLE' },
          { status: 500 }
        )
      }

      // Check if the user has any of the required permissions
      const hasAny = requiredPermissions.some(permission => 
        hasPermission(role as UserRole, permission)
      )

      if (!hasAny) {
        return NextResponse.json(
          { 
            error: 'Forbidden', 
            code: 'INSUFFICIENT_PERMISSIONS',
            required: requiredPermissions,
            role: role
          },
          { status: 403 }
        )
      }

      // Extend auth context with userId and role
      const rbacAuth: RbacContext = {
        ...auth,
        userId: id,
        role: role as UserRole
      }

      return handler(request, rbacAuth)
    } catch (error) {
      console.error('RBAC middleware error:', error)
      return NextResponse.json(
        { error: 'Internal server error', code: 'INTERNAL_ERROR' },
        { status: 500 }
      )
    }
  })
}

/**
 * Middleware that requires all of the specified permissions.
 * Access is granted only if the user has all of the required permissions.
 * 
 * @param requiredPermissions - Array of permissions (all must be present)
 * @param handler - The route handler to execute if authorization succeeds
 */
export function withAllRbac(requiredPermissions: Permission[], handler: RbacHandler) {
  return withAuth(async (request: NextRequest, auth: AuthContext): Promise<NextResponse> => {
    try {
      // Fetch user from database by walletAddress to get role and id
      const result = await sql`
        SELECT id, role
        FROM users
        WHERE wallet_address = ${auth.walletAddress}
      `

      if (result.length === 0) {
        return NextResponse.json(
          { error: 'User not found', code: 'USER_NOT_FOUND' },
          { status: 404 }
        )
      }

      const { id, role } = result[0]

      // Validate that the role is a valid UserRole
      if (!isValidRole(role)) {
        return NextResponse.json(
          { error: 'Invalid user role', code: 'INVALID_ROLE' },
          { status: 500 }
        )
      }

      // Check if the user has all of the required permissions
      const hasAll = requiredPermissions.every(permission => 
        hasPermission(role as UserRole, permission)
      )

      if (!hasAll) {
        return NextResponse.json(
          { 
            error: 'Forbidden', 
            code: 'INSUFFICIENT_PERMISSIONS',
            required: requiredPermissions,
            role: role
          },
          { status: 403 }
        )
      }

      // Extend auth context with userId and role
      const rbacAuth: RbacContext = {
        ...auth,
        userId: id,
        role: role as UserRole
      }

      return handler(request, rbacAuth)
    } catch (error) {
      console.error('RBAC middleware error:', error)
      return NextResponse.json(
        { error: 'Internal server error', code: 'INTERNAL_ERROR' },
        { status: 500 }
      )
    }
  })
}

/**
 * Middleware that restricts access to specific roles only.
 * 
 * @param allowedRoles - Array of roles that are allowed to access the route
 * @param handler - The route handler to execute if authorization succeeds
 * 
 * @example
 * export const POST = withRole(['admin'], async (request, auth) => {
 *   // Only admins can reach here
 *   return NextResponse.json({ success: true })
 * })
 */
export function withRole(allowedRoles: UserRole[], handler: RbacHandler) {
  return withAuth(async (request: NextRequest, auth: AuthContext): Promise<NextResponse> => {
    try {
      // Fetch user from database by walletAddress to get role and id
      const result = await sql`
        SELECT id, role
        FROM users
        WHERE wallet_address = ${auth.walletAddress}
      `

      if (result.length === 0) {
        return NextResponse.json(
          { error: 'User not found', code: 'USER_NOT_FOUND' },
          { status: 404 }
        )
      }

      const { id, role } = result[0]

      // Validate that the role is a valid UserRole
      if (!isValidRole(role)) {
        return NextResponse.json(
          { error: 'Invalid user role', code: 'INVALID_ROLE' },
          { status: 500 }
        )
      }

      // Check if the user's role is in the allowed roles
      if (!allowedRoles.includes(role as UserRole)) {
        return NextResponse.json(
          { 
            error: 'Forbidden', 
            code: 'INSUFFICIENT_PERMISSIONS',
            allowedRoles: allowedRoles,
            role: role
          },
          { status: 403 }
        )
      }

      // Extend auth context with userId and role
      const rbacAuth: RbacContext = {
        ...auth,
        userId: id,
        role: role as UserRole
      }

      return handler(request, rbacAuth)
    } catch (error) {
      console.error('RBAC middleware error:', error)
      return NextResponse.json(
        { error: 'Internal server error', code: 'INTERNAL_ERROR' },
        { status: 500 }
      )
    }
  })
}

/**
 * Helper function to validate that a role string is a valid UserRole
 */
function isValidRole(role: string): role is UserRole {
  return ['freelancer', 'client', 'admin'].includes(role)
}

/**
 * Helper function to check if a user has a specific permission.
 * This can be used within route handlers for additional checks.
 * 
 * @param auth - The RbacContext from the middleware
 * @param permission - The permission to check
 * @returns true if the user has the permission, false otherwise
 */
export function checkUserPermission(auth: RbacContext, permission: Permission): boolean {
  return hasPermission(auth.role, permission)
}

/**
 * Helper function to check if a user has any of the specified permissions.
 * This can be used within route handlers for additional checks.
 * 
 * @param auth - The RbacContext from the middleware
 * @param permissions - Array of permissions to check
 * @returns true if the user has any of the permissions, false otherwise
 */
export function checkUserAnyPermission(auth: RbacContext, permissions: Permission[]): boolean {
  return permissions.some(permission => hasPermission(auth.role, permission))
}

/**
 * Helper function to check if a user has all of the specified permissions.
 * This can be used within route handlers for additional checks.
 * 
 * @param auth - The RbacContext from the middleware
 * @param permissions - Array of permissions to check
 * @returns true if the user has all of the permissions, false otherwise
 */
export function checkUserAllPermissions(auth: RbacContext, permissions: Permission[]): boolean {
  return permissions.every(permission => hasPermission(auth.role, permission))
}

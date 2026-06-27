# Role-Based Access Control (RBAC) Implementation

## Overview

This document describes the Role-Based Access Control (RBAC) system implemented for TaskChain. The RBAC system enforces role-based permissions across protected API routes, ensuring only authorized users can perform sensitive operations.

## Architecture

### Components

1. **Role Definitions** (`lib/auth/constants.ts`)
   - Defines user roles: `freelancer`, `client`, `admin`
   - Defines granular permissions for each resource type
   - Maps roles to their allowed permissions

2. **RBAC Middleware** (`lib/auth/rbacMiddleware.ts`)
   - `withRbac()` - Requires a specific permission
   - `withAnyRbac()` - Requires any of the specified permissions
   - `withAllRbac()` - Requires all of the specified permissions
   - `withRole()` - Restricts access to specific roles
   - Helper functions for runtime permission checks

3. **Updated Admin Middleware** (`lib/auth/adminMiddleware.ts`)
   - Refactored to use the new RBAC system
   - Maintains backward compatibility

## User Roles

### Freelancer
Freelancers can:
- View projects and milestones
- Submit milestones for approval
- View escrow status
- Create and view disputes
- View and create reviews
- View reputation data

### Client
Clients can:
- Create, update, and delete projects
- View projects and milestones
- Approve or reject milestones
- Fund, release, and refund escrow
- Create and manage contracts
- Create and view disputes
- View and create reviews
- View reputation data

### Admin
Admins have full system access:
- All client and freelancer permissions
- Resolve disputes
- Manage users
- Freeze contracts
- Full system oversight

## Permissions

### Project Permissions
- `project:create` - Create new projects
- `project:view` - View projects
- `project:update` - Update project details
- `project:delete` - Delete projects

### Milestone Permissions
- `milestone:view` - View milestones
- `milestone:submit` - Submit completed milestones
- `milestone:approve` - Approve submitted milestones
- `milestone:reject` - Reject submitted milestones

### Escrow Permissions
- `escrow:view` - View escrow status
- `escrow:fund` - Fund escrow contracts
- `escrow:release` - Release funds to freelancer
- `escrow:refund` - Refund funds to client

### Contract Permissions
- `contract:view` - View contracts
- `contract:create` - Create contracts
- `contract:update` - Update contract details

### Dispute Permissions
- `dispute:create` - Create disputes
- `dispute:view` - View disputes
- `dispute:resolve` - Resolve disputes (admin only)

### Admin Permissions
- `admin:users_manage` - Manage users
- `admin:contracts_freeze` - Freeze contracts
- `admin:system_oversight` - Full system oversight

### General Permissions
- `reputation:view` - View reputation data
- `reviews:create` - Create reviews
- `reviews:view` - View reviews

## Usage Examples

### Basic RBAC Middleware

```typescript
import { withRbac, RbacContext } from '@/lib/auth/rbacMiddleware'

export const POST = withRbac('project:create', async (request: NextRequest, auth: RbacContext) => {
  // Only users with 'project:create' permission can reach here
  // auth contains: { userId, role, walletAddress, tokenJti }
  return NextResponse.json({ success: true })
})
```

### Multiple Permissions (Any)

```typescript
import { withAnyRbac, RbacContext } from '@/lib/auth/rbacMiddleware'

export const POST = withAnyRbac(['milestone:approve', 'milestone:reject'], async (request: NextRequest, auth: RbacContext) => {
  // Users with either 'milestone:approve' OR 'milestone:reject' permission can access
  return NextResponse.json({ success: true })
})
```

### Multiple Permissions (All)

```typescript
import { withAllRbac, RbacContext } from '@/lib/auth/rbacMiddleware'

export const POST = withAllRbac(['contract:create', 'escrow:fund'], async (request: NextRequest, auth: RbacContext) => {
  // Users must have BOTH permissions to access
  return NextResponse.json({ success: true })
})
```

### Role-Based Access

```typescript
import { withRole, RbacContext } from '@/lib/auth/rbacMiddleware'

export const POST = withRole(['admin'], async (request: NextRequest, auth: RbacContext) => {
  // Only admins can access this route
  return NextResponse.json({ success: true })
})
```

### Runtime Permission Checks

```typescript
import { checkUserPermission } from '@/lib/auth/rbacMiddleware'

export const POST = withRbac('project:view', async (request: NextRequest, auth: RbacContext) => {
  // Additional runtime check
  if (!checkUserPermission(auth, 'project:update')) {
    return NextResponse.json({ error: 'Cannot update' }, { status: 403 })
  }
  
  // Proceed with update
  return NextResponse.json({ success: true })
})
```

## Error Handling

The RBAC middleware provides clear error responses:

### 401 Unauthorized
- Missing or invalid authentication token
```json
{
  "error": "Unauthorized",
  "code": "AUTH_REQUIRED"
}
```

### 403 Forbidden
- User lacks required permission
```json
{
  "error": "Forbidden",
  "code": "INSUFFICIENT_PERMISSIONS",
  "required": "project:create",
  "role": "freelancer"
}
```

### 404 Not Found
- User not found in database
```json
{
  "error": "User not found",
  "code": "USER_NOT_FOUND"
}
```

### 500 Internal Server Error
- Database or system error
```json
{
  "error": "Internal server error",
  "code": "INTERNAL_ERROR"
}
```

## Protected Routes

The following routes have been updated with RBAC middleware:

### Project Routes
- `POST /api/projects/create` - Requires `project:create`

### Milestone Routes
- `POST /api/milestones/[id]/submit` - Requires `milestone:submit`
- `POST /api/milestones/[id]/approve` - Requires `milestone:approve` OR `milestone:reject`

### Escrow Routes
- `POST /api/escrow/fund` - Requires `escrow:fund`
- `POST /api/escrow/release` - Requires `escrow:release`
- `POST /api/escrow/refund` - Requires `escrow:refund` OR `admin:contracts_freeze`

### Dispute Routes
- `POST /api/disputes` - Requires `dispute:create`
- `GET /api/disputes` - Requires `dispute:view`
- `POST /api/disputes/[id]/resolve` - Requires `dispute:resolve`

### Review Routes
- `POST /api/reviews` - Requires `reviews:create`

### Admin Routes
- `GET /api/admin/disputes` - Requires admin role (uses `withAdmin`)
- `POST /api/admin/contracts/[id]/freeze` - Requires admin role (uses `withAdmin`)

## Database Schema

The RBAC system relies on the existing `users` table schema:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  role user_role NOT NULL DEFAULT 'freelancer',
  wallet_address TEXT UNIQUE,
  -- ... other fields
)
```

The `user_role` enum is defined as:
```sql
CREATE TYPE user_role AS ENUM ('freelancer', 'client', 'admin');
```

## Security Considerations

1. **Token Validation**: JWT tokens are validated before role checks
2. **Database Lookup**: User roles are fetched from the database on each request
3. **Permission Granularity**: Permissions are granular to follow the principle of least privilege
4. **Error Messages**: Error messages are generic to prevent information leakage
5. **Audit Logging**: Admin actions are logged in `admin_audit_logs` table

## Scalability

The RBAC system is designed for future expansion:

### Adding New Roles
1. Add the role to the `user_role` enum in the database
2. Add the role to the `UserRole` type in `lib/auth/constants.ts`
3. Define permissions for the new role in `ROLE_PERMISSIONS`

### Adding New Permissions
1. Add the permission to the `Permission` type in `lib/auth/constants.ts`
2. Add the permission to the appropriate roles in `ROLE_PERMISSIONS`
3. Apply the middleware to relevant routes

### Adding New Middleware
The middleware functions are composable and can be extended for custom authorization logic.

## Testing

To test the RBAC implementation:

1. Create test users with different roles
2. Obtain JWT tokens for each user
3. Attempt to access protected routes with each role
4. Verify that:
   - Users with correct permissions can access routes
   - Users without permissions receive 403 errors
   - Unauthenticated requests receive 401 errors

## Migration Guide

For existing routes using `withAuth`:

### Before
```typescript
import { withAuth, AuthContext } from '@/lib/auth/middleware'

export const POST = withAuth(async (request: NextRequest, auth: AuthContext) => {
  const [user] = await sql`SELECT id, role FROM users WHERE wallet_address = ${auth.walletAddress}`
  // Manual role checks...
})
```

### After
```typescript
import { withRbac, RbacContext } from '@/lib/auth/rbacMiddleware'

export const POST = withRbac('permission:name', async (request: NextRequest, auth: RbacContext) => {
  // auth.userId and auth.role are already available
  // No manual role checks needed
})
```

## Backward Compatibility

The existing `withAuth` middleware remains unchanged and can still be used for routes that don't require role-based permissions. The `withAdmin` middleware has been refactored to use the new RBAC system but maintains its original API for backward compatibility.

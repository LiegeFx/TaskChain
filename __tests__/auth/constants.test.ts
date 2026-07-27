import { describe, it, expect } from 'vitest'
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  ROLE_PERMISSIONS,
} from '@/lib/auth/constants'

describe('constants', () => {
  describe('hasPermission', () => {
    it('returns true for freelancer with project:view', () => {
      expect(hasPermission('freelancer', 'project:view')).toBe(true)
    })

    it('returns false for freelancer with project:create', () => {
      expect(hasPermission('freelancer', 'project:create')).toBe(false)
    })

    it('returns true for client with project:create', () => {
      expect(hasPermission('client', 'project:create')).toBe(true)
    })

    it('returns true for admin with any permission', () => {
      expect(hasPermission('admin', 'admin:users_manage')).toBe(true)
      expect(hasPermission('admin', 'dispute:resolve')).toBe(true)
      expect(hasPermission('admin', 'project:create')).toBe(true)
    })

    it('returns false for freelancer with admin permissions', () => {
      expect(hasPermission('freelancer', 'admin:users_manage')).toBe(false)
      expect(hasPermission('freelancer', 'admin:system_oversight')).toBe(false)
    })
  })

  describe('hasAnyPermission', () => {
    it('returns true when user has at least one permission', () => {
      expect(hasAnyPermission('freelancer', ['project:create', 'project:view'])).toBe(true)
    })

    it('returns false when user has none of the permissions', () => {
      expect(hasAnyPermission('freelancer', ['project:create', 'project:delete'])).toBe(false)
    })

    it('returns true when admin has any permissions', () => {
      expect(hasAnyPermission('admin', ['admin:users_manage', 'dispute:resolve'])).toBe(true)
    })

    it('returns true for client with escrow permissions', () => {
      expect(hasAnyPermission('client', ['escrow:fund', 'escrow:release'])).toBe(true)
    })
  })

  describe('hasAllPermissions', () => {
    it('returns true when user has all permissions', () => {
      expect(hasAllPermissions('admin', ['project:create', 'dispute:resolve', 'admin:users_manage'])).toBe(true)
    })

    it('returns false when user is missing at least one', () => {
      expect(hasAllPermissions('freelancer', ['project:view', 'project:create'])).toBe(false)
    })

    it('returns true for client with all client permissions', () => {
      expect(hasAllPermissions('client', ['project:create', 'project:update', 'project:delete'])).toBe(true)
    })

    it('returns true for freelancer with all freelancer permissions', () => {
      expect(hasAllPermissions('freelancer', ['project:view', 'milestone:view', 'milestone:submit'])).toBe(true)
    })
  })

  describe('ROLE_PERMISSIONS', () => {
    it('has all three roles defined', () => {
      expect(ROLE_PERMISSIONS).toHaveProperty('freelancer')
      expect(ROLE_PERMISSIONS).toHaveProperty('client')
      expect(ROLE_PERMISSIONS).toHaveProperty('admin')
    })

    it('admin has more permissions than freelancer', () => {
      expect(ROLE_PERMISSIONS.admin.length).toBeGreaterThan(ROLE_PERMISSIONS.freelancer.length)
    })

    it('admin has more permissions than client', () => {
      expect(ROLE_PERMISSIONS.admin.length).toBeGreaterThan(ROLE_PERMISSIONS.client.length)
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hasPermission, hasAnyPermission, hasAllPermissions, ROLE_PERMISSIONS, UserRole, Permission } from '@/lib/auth/constants'

describe('RBAC Constants and Helpers', () => {
  describe('ROLE_PERMISSIONS', () => {
    it('should have freelancer permissions defined', () => {
      expect(ROLE_PERMISSIONS.freelancer).toBeDefined()
      expect(ROLE_PERMISSIONS.freelancer.length).toBeGreaterThan(0)
    })

    it('should have client permissions defined', () => {
      expect(ROLE_PERMISSIONS.client).toBeDefined()
      expect(ROLE_PERMISSIONS.client.length).toBeGreaterThan(0)
    })

    it('should have admin permissions defined', () => {
      expect(ROLE_PERMISSIONS.admin).toBeDefined()
      expect(ROLE_PERMISSIONS.admin.length).toBeGreaterThan(0)
    })

    it('admin should have all permissions', () => {
      const allPermissions: Permission[] = [
        'project:create',
        'project:view',
        'project:update',
        'project:delete',
        'milestone:view',
        'milestone:submit',
        'milestone:approve',
        'milestone:reject',
        'escrow:view',
        'escrow:fund',
        'escrow:release',
        'escrow:refund',
        'contract:view',
        'contract:create',
        'contract:update',
        'dispute:create',
        'dispute:view',
        'dispute:resolve',
        'admin:users_manage',
        'admin:contracts_freeze',
        'admin:system_oversight',
        'reputation:view',
        'reviews:create',
        'reviews:view',
      ]

      allPermissions.forEach(permission => {
        expect(ROLE_PERMISSIONS.admin).toContain(permission)
      })
    })
  })

  describe('Freelancer Permissions', () => {
    it('freelancer should have milestone:submit permission', () => {
      expect(hasPermission('freelancer', 'milestone:submit')).toBe(true)
    })

    it('freelancer should NOT have project:create permission', () => {
      expect(hasPermission('freelancer', 'project:create')).toBe(false)
    })

    it('freelancer should NOT have milestone:approve permission', () => {
      expect(hasPermission('freelancer', 'milestone:approve')).toBe(false)
    })

    it('freelancer should have dispute:create permission', () => {
      expect(hasPermission('freelancer', 'dispute:create')).toBe(true)
    })

    it('freelancer should NOT have dispute:resolve permission', () => {
      expect(hasPermission('freelancer', 'dispute:resolve')).toBe(false)
    })
  })

  describe('Client Permissions', () => {
    it('client should have project:create permission', () => {
      expect(hasPermission('client', 'project:create')).toBe(true)
    })

    it('client should have milestone:approve permission', () => {
      expect(hasPermission('client', 'milestone:approve')).toBe(true)
    })

    it('client should have milestone:reject permission', () => {
      expect(hasPermission('client', 'milestone:reject')).toBe(true)
    })

    it('client should NOT have milestone:submit permission', () => {
      expect(hasPermission('client', 'milestone:submit')).toBe(false)
    })

    it('client should have escrow:fund permission', () => {
      expect(hasPermission('client', 'escrow:fund')).toBe(true)
    })

    it('client should have escrow:release permission', () => {
      expect(hasPermission('client', 'escrow:release')).toBe(true)
    })

    it('client should NOT have dispute:resolve permission', () => {
      expect(hasPermission('client', 'dispute:resolve')).toBe(false)
    })
  })

  describe('Admin Permissions', () => {
    it('admin should have dispute:resolve permission', () => {
      expect(hasPermission('admin', 'dispute:resolve')).toBe(true)
    })

    it('admin should have admin:users_manage permission', () => {
      expect(hasPermission('admin', 'admin:users_manage')).toBe(true)
    })

    it('admin should have admin:contracts_freeze permission', () => {
      expect(hasPermission('admin', 'admin:contracts_freeze')).toBe(true)
    })

    it('admin should have all project permissions', () => {
      expect(hasPermission('admin', 'project:create')).toBe(true)
      expect(hasPermission('admin', 'project:view')).toBe(true)
      expect(hasPermission('admin', 'project:update')).toBe(true)
      expect(hasPermission('admin', 'project:delete')).toBe(true)
    })
  })

  describe('hasPermission Helper', () => {
    it('should return true for valid permission', () => {
      expect(hasPermission('freelancer', 'milestone:submit')).toBe(true)
    })

    it('should return false for invalid permission', () => {
      expect(hasPermission('freelancer', 'project:create')).toBe(false)
    })
  })

  describe('hasAnyPermission Helper', () => {
    it('should return true if user has any of the permissions', () => {
      expect(hasAnyPermission('freelancer', ['milestone:submit', 'project:create'])).toBe(true)
    })

    it('should return false if user has none of the permissions', () => {
      expect(hasAnyPermission('freelancer', ['project:create', 'project:delete'])).toBe(false)
    })

    it('should return true if user has all permissions', () => {
      expect(hasAnyPermission('admin', ['dispute:resolve', 'admin:users_manage'])).toBe(true)
    })
  })

  describe('hasAllPermissions Helper', () => {
    it('should return true if user has all permissions', () => {
      expect(hasAllPermissions('client', ['project:create', 'milestone:approve'])).toBe(true)
    })

    it('should return false if user is missing any permission', () => {
      expect(hasAllPermissions('freelancer', ['milestone:submit', 'project:create'])).toBe(false)
    })

    it('should return true for admin with any permissions', () => {
      expect(hasAllPermissions('admin', ['dispute:resolve', 'admin:users_manage'])).toBe(true)
    })
  })

  describe('Permission Scope by Role', () => {
    it('freelancer should only have view permissions for projects', () => {
      expect(hasPermission('freelancer', 'project:view')).toBe(true)
      expect(hasPermission('freelancer', 'project:create')).toBe(false)
      expect(hasPermission('freelancer', 'project:update')).toBe(false)
      expect(hasPermission('freelancer', 'project:delete')).toBe(false)
    })

    it('client should have full project management permissions', () => {
      expect(hasPermission('client', 'project:view')).toBe(true)
      expect(hasPermission('client', 'project:create')).toBe(true)
      expect(hasPermission('client', 'project:update')).toBe(true)
      expect(hasPermission('client', 'project:delete')).toBe(true)
    })

    it('freelancer should have submit but not approve milestones', () => {
      expect(hasPermission('freelancer', 'milestone:submit')).toBe(true)
      expect(hasPermission('freelancer', 'milestone:approve')).toBe(false)
      expect(hasPermission('freelancer', 'milestone:reject')).toBe(false)
    })

    it('client should have approve and reject but not submit milestones', () => {
      expect(hasPermission('client', 'milestone:submit')).toBe(false)
      expect(hasPermission('client', 'milestone:approve')).toBe(true)
      expect(hasPermission('client', 'milestone:reject')).toBe(true)
    })

    it('only admin should have admin-specific permissions', () => {
      expect(hasPermission('admin', 'admin:users_manage')).toBe(true)
      expect(hasPermission('admin', 'admin:contracts_freeze')).toBe(true)
      expect(hasPermission('admin', 'admin:system_oversight')).toBe(true)

      expect(hasPermission('freelancer', 'admin:users_manage')).toBe(false)
      expect(hasPermission('client', 'admin:users_manage')).toBe(false)

      expect(hasPermission('freelancer', 'admin:contracts_freeze')).toBe(false)
      expect(hasPermission('client', 'admin:contracts_freeze')).toBe(false)
    })
  })
})

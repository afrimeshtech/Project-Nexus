import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { can, memberRoleFrom, type OrgCapability } from './org-access.ts'

const ALL: OrgCapability[] = [
  'inventory',
  'orders',
  'dispatch',
  'messages',
  'funds',
  'rewards',
  'analytics',
  'settings',
  'api',
  'sourcing',
  'team',
]

describe('org access', () => {
  test('the owner can do everything', () => {
    for (const capability of ALL) assert.equal(can('owner', capability), true, capability)
  })

  test('a sales rep runs the shop floor', () => {
    for (const capability of ['inventory', 'orders', 'dispatch', 'messages'] as const) {
      assert.equal(can('sales_rep', capability), true, capability)
    }
  })

  test('a sales rep never reaches money, logs or the business account', () => {
    for (const capability of [
      'funds',
      'rewards',
      'analytics',
      'settings',
      'api',
      'sourcing',
      'team',
    ] as const) {
      assert.equal(can('sales_rep', capability), false, capability)
    }
  })

  test('only an explicit owner resolves to owner', () => {
    assert.equal(memberRoleFrom({ isOrgOwner: true, roleInOrg: null }), 'owner')
    assert.equal(memberRoleFrom({ isOrgOwner: false, roleInOrg: 'owner' }), 'owner')
    assert.equal(memberRoleFrom({ isOrgOwner: false, roleInOrg: 'sales_rep' }), 'sales_rep')
    // Legacy or unknown values fall to the least privilege.
    assert.equal(memberRoleFrom({ isOrgOwner: false, roleInOrg: 'staff' }), 'sales_rep')
    assert.equal(memberRoleFrom({ isOrgOwner: false, roleInOrg: 'admin' }), 'sales_rep')
    assert.equal(memberRoleFrom({ isOrgOwner: false, roleInOrg: null }), 'sales_rep')
  })
})

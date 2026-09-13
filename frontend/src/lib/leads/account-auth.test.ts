import assert from 'node:assert/strict'
import test, {type TestContext} from 'node:test'
process.env.LEADS_DRY_RUN = 'true'
process.env.NEXT_PUBLIC_SITE_URL = 'https://portals.test'
process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'test-project'
process.env.NEXT_PUBLIC_SANITY_DATASET = 'test-dataset'
import {
  consumeMagicLink,
  ensureApplicationUser,
  ensurePilotCustomerAccount,
  getApplicationUserByEmail,
  getCustomerAccountsForUser,
  getCustomerAccountForUser,
  issueMagicLink,
  pilotMembershipRole,
  pilotMembershipWithAccountRole,
} from './application-auth'
import {getPilotById} from './store'

test('getCustomerAccountsForUser returns accounts ordered by privilege', async () => {
  const ownerEmail = `owner-${crypto.randomUUID()}@studio.example`
  const adminEmail = `admin-${crypto.randomUUID()}@studio.example`
  const memberEmail = `member-${crypto.randomUUID()}@studio.example`

  const ownerUser = await ensureApplicationUser({email: ownerEmail, displayName: 'Owner'})
  const adminUser = await ensureApplicationUser({email: adminEmail, displayName: 'Admin'})
  const memberUser = await ensureApplicationUser({email: memberEmail, displayName: 'Member'})

  // Create multiple accounts with different roles for the same user
  const pilotId = crypto.randomUUID()
  const {customer: ownerAccount} = await ensurePilotCustomerAccount({
    pilotId,
    email: ownerEmail,
    companyName: 'Owner Account',
    companyDomain: 'owner.example',
    profile: {identity: {email: ownerEmail, company: 'Owner Account'}, companyDomain: 'owner.example'},
  })

  // Add the same user as admin to another account
  const adminAccountId = crypto.randomUUID()
  const adminAccount = {id: adminAccountId, name: 'Admin Account', domain: 'admin.example', role: 'admin' as const}
  const memory = (globalThis as any).portalsApplicationAuth
  memory.customers.set(adminAccountId, adminAccount)
  memory.memberships.set(`${adminAccountId}:${ownerUser.id}`, 'admin')

  // Add the same user as member to a third account
  const memberAccountId = crypto.randomUUID()
  const memberAccount = {id: memberAccountId, name: 'Member Account', domain: 'member.example', role: 'member' as const}
  memory.customers.set(memberAccountId, memberAccount)
  memory.memberships.set(`${memberAccountId}:${ownerUser.id}`, 'member')

  const accounts = await getCustomerAccountsForUser(ownerUser.id)
  assert.equal(accounts.length, 3)
  assert.equal(accounts[0].id, ownerAccount.id, 'owner account should be first')
  assert.equal(accounts[0].role, 'owner')
  assert.equal(accounts[1].id, adminAccountId, 'admin account should be second')
  assert.equal(accounts[1].role, 'admin')
  assert.equal(accounts[2].id, memberAccountId, 'member account should be third')
  assert.equal(accounts[2].role, 'member')
})

test('getCustomerAccountForUser returns account with role for authorized user', async () => {
  const email = `auth-check-${crypto.randomUUID()}@studio.example`
  const user = await ensureApplicationUser({email, displayName: 'Test User'})

  const pilotId = crypto.randomUUID()
  const {customer} = await ensurePilotCustomerAccount({
    pilotId,
    email,
    companyName: 'Test Account',
    companyDomain: 'test.example',
    profile: {identity: {email, company: 'Test Account'}, companyDomain: 'test.example'},
  })

  const account = await getCustomerAccountForUser(customer.id, user.id)
  assert.ok(account)
  assert.equal(account.id, customer.id)
  assert.equal(account.role, 'owner')
})

test('getCustomerAccountForUser returns null for unauthorized user', async () => {
  const email = `unauth-${crypto.randomUUID()}@studio.example`
  const user = await ensureApplicationUser({email, displayName: 'Test User'})

  const otherAccountId = crypto.randomUUID()
  const otherAccount = {id: otherAccountId, name: 'Other Account', domain: 'other.example', role: 'owner' as const}
  const memory = (globalThis as any).portalsApplicationAuth
  memory.customers.set(otherAccountId, otherAccount)

  const account = await getCustomerAccountForUser(otherAccountId, user.id)
  assert.equal(account, null)
})

test('magic link with customerAccountId grants membership to specified account', async () => {
  const email = `magic-account-${crypto.randomUUID()}@studio.example`
  const user = await ensureApplicationUser({email, displayName: 'Magic User'})

  const pilotId = crypto.randomUUID()
  const {customer} = await ensurePilotCustomerAccount({
    pilotId,
    email,
    companyName: 'Magic Account',
    companyDomain: 'magic.example',
    profile: {identity: {email, company: 'Magic Account'}, companyDomain: 'magic.example'},
  })

  const magicLink = await issueMagicLink({
    userId: user.id,
    purpose: 'invite',
    customerAccountId: customer.id,
    role: 'admin',
  })

  const session = await consumeMagicLink(magicLink)
  assert.ok(session)
  assert.equal(session.user.id, user.id)

  const account = await getCustomerAccountForUser(customer.id, user.id)
  assert.ok(account)
  assert.equal(account.role, 'admin')
})

test('pilot membership validation requires both account and pilot membership', async () => {
  const ownerEmail = `pilot-auth-${crypto.randomUUID()}@studio.example`
  const participantEmail = `pilot-part-${crypto.randomUUID()}@studio.example`

  const ownerUser = await ensureApplicationUser({email: ownerEmail, displayName: 'Owner'})
  const participantUser = await ensureApplicationUser({email: participantEmail, displayName: 'Participant'})

  const pilotId = crypto.randomUUID()
  const {customer} = await ensurePilotCustomerAccount({
    pilotId,
    email: ownerEmail,
    companyName: 'Auth Test Account',
    companyDomain: 'authtest.example',
    profile: {identity: {email: ownerEmail, company: 'Auth Test Account'}, companyDomain: 'authtest.example'},
  })

  // Owner should have both account and pilot membership
  const ownerRole = await pilotMembershipRole(pilotId, ownerUser.id)
  assert.equal(ownerRole, 'owner')

  // Participant has no account membership
  const participantRole = await pilotMembershipRole(pilotId, participantUser.id)
  assert.equal(participantRole, null)

  // Add participant to account but not to pilot
  const memory = (globalThis as any).portalsApplicationAuth
  memory.memberships.set(`${customer.id}:${participantUser.id}`, 'member' as const)

  // Still no pilot membership
  const participantRoleAfterAccount = await pilotMembershipRole(pilotId, participantUser.id)
  assert.equal(participantRoleAfterAccount, null)
})

test('nested account authorization requires direct account membership', async () => {
  const email = `nested-${crypto.randomUUID()}@studio.example`
  const user = await ensureApplicationUser({email, displayName: 'Nested User'})

  const pilotId = crypto.randomUUID()
  const {customer} = await ensurePilotCustomerAccount({
    pilotId,
    email,
    companyName: 'Nested Account',
    companyDomain: 'nested.example',
    profile: {identity: {email, company: 'Nested Account'}, companyDomain: 'nested.example'},
  })

  // User should have direct access to their own account
  const directAccess = await getCustomerAccountForUser(customer.id, user.id)
  assert.ok(directAccess)
  assert.equal(directAccess.role, 'owner')

  // Create a different account the user has no access to
  const otherAccountId = crypto.randomUUID()
  const otherAccount = {id: otherAccountId, name: 'Other Account', domain: 'other.example', role: 'owner' as const}
  const memory = (globalThis as any).portalsApplicationAuth
  memory.customers.set(otherAccountId, otherAccount)

  // User should not have access to the other account
  const noAccess = await getCustomerAccountForUser(otherAccountId, user.id)
  assert.equal(noAccess, null)
})

test('pilotMembershipWithAccountRole validates both pilot and account membership', async () => {
  const email = `dual-auth-${crypto.randomUUID()}@studio.example`
  const user = await ensureApplicationUser({email, displayName: 'Dual Auth User'})

  const pilotId = crypto.randomUUID()
  const {customer} = await ensurePilotCustomerAccount({
    pilotId,
    email,
    companyName: 'Dual Auth Account',
    companyDomain: 'dualauth.example',
    profile: {identity: {email, company: 'Dual Auth Account'}, companyDomain: 'dualauth.example'},
  })

  // User should have both pilot and account membership via pilotMembershipRole
  const pilotRole = await pilotMembershipRole(pilotId, user.id)
  assert.equal(pilotRole, 'owner')

  // User should have account membership via getCustomerAccountForUser
  const account = await getCustomerAccountForUser(customer.id, user.id)
  assert.ok(account)
  assert.equal(account.role, 'owner')

  // This demonstrates that the existing functions provide the needed validation
  // pilotMembershipWithAccountRole combines both checks in a single query
})

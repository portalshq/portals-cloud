import {describe, expect, it} from 'vitest'
import {
  isPortalsTeamReviewerEmail,
  isProtectedPortalsReviewerMutation,
  portalsTeamEmailsFromEnv,
  PORTALS_TEAM_REVIEWER_ROLE,
} from './pilot-team-reviewer'

const teamEmail = 'sales@portals.works'

describe('system-managed Portals team reviewer', () => {
  it('has a distinct role and uses configured identity, not an email domain', () => {
    expect(PORTALS_TEAM_REVIEWER_ROLE).toBe('portals_team_reviewer')
    expect(isPortalsTeamReviewerEmail(' SALES@PORTALS.WORKS ', teamEmail)).toBe(true)
    expect(isPortalsTeamReviewerEmail(teamEmail, ' SALES@PORTALS.WORKS ')).toBe(true)
    expect(isPortalsTeamReviewerEmail('customer@portals.works', teamEmail)).toBe(false)
    expect(isPortalsTeamReviewerEmail('', '')).toBe(false)
  })

  it.each(['invite_reviewer', 'reviewer_role', 'remove_reviewer', 'claim_role', 'share'])(
    'protects the internal member against %s, including mixed targets', (action) => {
      expect(isProtectedPortalsReviewerMutation(action, [undefined, 'customer@example.com', teamEmail], teamEmail)).toBe(true)
      expect(isProtectedPortalsReviewerMutation(action, [' SALES@PORTALS.WORKS '], teamEmail)).toBe(true)
      expect(isProtectedPortalsReviewerMutation(action, ['customer@example.com'], teamEmail)).toBe(false)
      expect(isProtectedPortalsReviewerMutation(action, [undefined], teamEmail)).toBe(false)
      expect(isProtectedPortalsReviewerMutation(action, [teamEmail], '')).toBe(false)
    },
  )

  it('preserves review decisions and ordinary room actions', () => {
    for (const action of ['reviewer_decision', 'reviewer_note', 'draft', 'confirm_scope']) {
      expect(isProtectedPortalsReviewerMutation(action, [teamEmail], teamEmail)).toBe(false)
    }
    expect(isProtectedPortalsReviewerMutation('claim_role', [], teamEmail)).toBe(false)
  })

  it('matches every configured team email when given a list', () => {
    const teamEmails = ['sales@portals.works', 'ops@portals.works']
    expect(isPortalsTeamReviewerEmail(' OPS@PORTALS.WORKS ', teamEmails)).toBe(true)
    expect(isPortalsTeamReviewerEmail('sales@portals.works', teamEmails)).toBe(true)
    expect(isPortalsTeamReviewerEmail('customer@example.com', teamEmails)).toBe(false)
    expect(isPortalsTeamReviewerEmail('', teamEmails)).toBe(false)
    expect(isProtectedPortalsReviewerMutation('remove_reviewer', ['ops@portals.works'], teamEmails)).toBe(true)
    expect(isProtectedPortalsReviewerMutation('remove_reviewer', ['customer@example.com'], teamEmails)).toBe(false)
    expect(isProtectedPortalsReviewerMutation('remove_reviewer', ['ops@portals.works'], [])).toBe(false)
  })
})

describe('portalsTeamEmailsFromEnv', () => {
  it('parses a comma-separated PORTALS_TEAM_EMAILS list', () => {
    expect(
      portalsTeamEmailsFromEnv({
        PORTALS_TEAM_EMAILS: ' Sales@Portals.Works , ops@portals.works,, SALES@PORTALS.WORKS ',
      }),
    ).toEqual(['sales@portals.works', 'ops@portals.works'])
  })

  it('falls back to LEADS_NOTIFICATION_EMAIL when PORTALS_TEAM_EMAILS is unset or empty', () => {
    expect(portalsTeamEmailsFromEnv({LEADS_NOTIFICATION_EMAIL: 'ops@portals.test'})).toEqual([
      'ops@portals.test',
    ])
    expect(
      portalsTeamEmailsFromEnv({PORTALS_TEAM_EMAILS: '  ', LEADS_NOTIFICATION_EMAIL: 'ops@portals.test'}),
    ).toEqual(['ops@portals.test'])
    expect(portalsTeamEmailsFromEnv({})).toEqual([])
  })
})

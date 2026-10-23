import {describe, expect, it} from 'vitest'
import {
  isPortalsTeamReviewerEmail,
  isProtectedPortalsReviewerMutation,
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
})

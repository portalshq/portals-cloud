export const PORTALS_TEAM_REVIEWER_ROLE = 'portals_team_reviewer'
export const PORTALS_TEAM_REVIEWER_LABEL = 'Portals team reviewer'

export function isPortalsTeamReviewerEmail(email: string, portalsTeamEmail: string): boolean {
  const normalizedTeamEmail = portalsTeamEmail.trim().toLowerCase()
  return Boolean(normalizedTeamEmail) && email.trim().toLowerCase() === normalizedTeamEmail
}

export function isProtectedPortalsReviewerMutation(
  action: string,
  targetEmails: Array<string | undefined>,
  portalsTeamEmail: string,
): boolean {
  return ['invite_reviewer', 'reviewer_role', 'remove_reviewer', 'claim_role', 'share'].includes(action)
    && targetEmails.some((email) => typeof email === 'string' && isPortalsTeamReviewerEmail(email, portalsTeamEmail))
}

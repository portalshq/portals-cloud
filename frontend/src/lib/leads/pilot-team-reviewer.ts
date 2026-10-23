import {normalizeEmail} from './identity'

export const PORTALS_TEAM_REVIEWER_ROLE = 'portals_team_reviewer'
export const PORTALS_TEAM_REVIEWER_LABEL = 'Portals team reviewer'

function parsePortalsTeamEmails(value: string | undefined): string[] {
  return [...new Set(
    String(value || '')
      .split(',')
      .map((email) => normalizeEmail(email))
      .filter(Boolean),
  )]
}

/**
 * Portals staff emails that auto-provision accounts and receive team access.
 * `PORTALS_TEAM_EMAILS` is a comma-separated list; when unset it falls back to
 * `LEADS_NOTIFICATION_EMAIL` so single-address deployments keep working.
 */
export function portalsTeamEmailsFromEnv(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const configured = parsePortalsTeamEmails(env.PORTALS_TEAM_EMAILS)
  if (configured.length) return configured
  return parsePortalsTeamEmails(env.LEADS_NOTIFICATION_EMAIL)
}

function teamEmailList(portalsTeamEmail: string | readonly string[]): string[] {
  return typeof portalsTeamEmail === 'string'
    ? parsePortalsTeamEmails(portalsTeamEmail)
    : portalsTeamEmail.map(normalizeEmail).filter(Boolean)
}

export function isPortalsTeamReviewerEmail(
  email: string,
  portalsTeamEmail: string | readonly string[],
): boolean {
  const normalized = normalizeEmail(email)
  return Boolean(normalized) && teamEmailList(portalsTeamEmail).includes(normalized)
}

export function isProtectedPortalsReviewerMutation(
  action: string,
  targetEmails: Array<string | undefined>,
  portalsTeamEmail: string | readonly string[],
): boolean {
  return ['invite_reviewer', 'reviewer_role', 'remove_reviewer', 'claim_role', 'share'].includes(action)
    && targetEmails.some((email) => typeof email === 'string' && isPortalsTeamReviewerEmail(email, portalsTeamEmail))
}

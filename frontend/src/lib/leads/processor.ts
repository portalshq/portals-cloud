import {trackSubmissionEvents} from './analytics-server'
import {sendApplicationAccessEmail} from './account-email'
import {getApplicationUserByEmail} from './application-auth'
import {syncSubmissionToApollo} from './crm'
import {processCrmOutbox} from './crm-events'
import {
  sendDeadLetterNotification,
  sendFounderNotification,
  sendLeadConfirmation,
  sendPilotStatusEmail,
} from './email'
import {
  cleanupLeadStore,
  completeOutbox,
  getPilotBySubmissionId,
  getSubmission,
  markSubmissionSynced,
  retryOutbox,
  takeDueOutbox,
} from './store'

export async function processLeadOutbox(limit = 20): Promise<void> {
  const rows = await takeDueOutbox(limit)
  for (const row of rows) {
    try {
      const submission = await getSubmission(row.submission_id)
      if (row.action_type === 'apollo_sync') {
        await syncSubmissionToApollo(submission)
      } else if (row.action_type === 'account_invitation') {
        const user = await getApplicationUserByEmail(submission.identity.email || '')
        if (!user) throw new Error('Pilot applicant application account is missing.')
        const pilot = await getPilotBySubmissionId(row.submission_id)
        await sendApplicationAccessEmail({
          user,
          idempotencyKey: `pilot-account-access:${pilot?.id || row.submission_id}:${user.id}`,
          nextPath: pilot ? `/paid-pilot/room/${pilot.id}` : '/account',
        })
      } else if (row.action_type === 'confirmation_email') {
        await sendLeadConfirmation(submission)
      } else if (row.action_type === 'founder_notification') {
        await sendFounderNotification(submission)
      } else if (row.action_type === 'pilot_email') {
        const [pilotId, , variant, ...rest] = row.action_key.split(':')
        const eventIndex = rest.indexOf('event')
        const recipientParts = eventIndex >= 0 ? rest.slice(0, eventIndex) : rest
        const eventKey = eventIndex >= 0 ? rest.slice(eventIndex + 1).join(':') : undefined
        const recipient = recipientParts.join(':') || submission.identity.email
        await sendPilotStatusEmail(pilotId, variant, recipient, eventKey)
      } else if (row.action_type === 'analytics') {
        await trackSubmissionEvents(submission)
      } else {
        throw new Error(`Unknown lead outbox action: ${row.action_type}`)
      }
      await completeOutbox(row.id)
      await markSubmissionSynced(row.submission_id)
    } catch (error) {
      console.error('Lead outbox action failed:', error)
      await retryOutbox(row.id, row.attempts, error)
      if (row.attempts + 1 >= 6) {
        await sendDeadLetterNotification({
          outboxId: row.id,
          submissionId: row.submission_id,
          actionType: row.action_type,
          error,
        }).catch((notificationError) => {
          console.error('Lead dead-letter notification failed:', notificationError)
        })
      }
    }
  }
  await processCrmOutbox(limit)
  await cleanupLeadStore()
}

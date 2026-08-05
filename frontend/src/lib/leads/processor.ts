import {trackSubmissionEvents} from './analytics-server'
import {syncSubmissionToAttio} from './crm'
import {
  sendDeadLetterNotification,
  sendFounderNotification,
  sendLeadConfirmation,
  sendPilotStatusEmail,
} from './email'
import {
  cleanupLeadStore,
  completeOutbox,
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
      if (row.action_type === 'crm_sync') {
        await syncSubmissionToAttio(submission)
      } else if (row.action_type === 'confirmation_email') {
        await sendLeadConfirmation(submission)
      } else if (row.action_type === 'founder_notification') {
        await sendFounderNotification(submission)
      } else if (row.action_type === 'pilot_email') {
        const [pilotId, , variant, ...rest] = row.action_key.split(':')
        const recipient = rest.join(':') || undefined
        await sendPilotStatusEmail(pilotId, variant, recipient)
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
  await cleanupLeadStore()
}

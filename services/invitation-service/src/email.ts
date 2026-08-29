import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {SendEmailCommand, SESv2Client} from '@aws-sdk/client-sesv2'
import {config} from './config.js'

const client = new SESv2Client({region: config.awsRegion})

async function template(name: string, values: Record<string, string>): Promise<string> {
  const source = await readFile(join(process.cwd(), 'templates', name), 'utf8')
  return Object.entries(values).reduce((html, [key, value]) => html.replaceAll(`{{${key}}}`, value), source)
}

export async function sendInvitationEmail(input: {type: 'team_member' | 'pilot_room'; email: string; token: string}): Promise<void> {
  const url = `${config.publicAppUrl}/invitations/accept?token=${encodeURIComponent(input.token)}`
  const html = await template(input.type === 'team_member' ? 'team-invitation.html' : 'pilot-invitation.html', {invitationUrl: url})
  await client.send(new SendEmailCommand({
    FromEmailAddress: config.fromEmail,
    Destination: {ToAddresses: [input.email]},
    ConfigurationSetName: config.configurationSet,
    Content: {Simple: {Subject: {Data: input.type === 'team_member' ? 'You are invited to a Portals team' : 'You are invited to a Portals pilot room'}, Body: {Html: {Data: html}, Text: {Data: `Open your invitation: ${url}`}}}},
  }))
}

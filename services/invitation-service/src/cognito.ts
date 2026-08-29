import {AdminCreateUserCommand, AdminGetUserCommand, CognitoIdentityProviderClient, UserNotFoundException} from '@aws-sdk/client-cognito-identity-provider'
import {config} from './config.js'

const client = new CognitoIdentityProviderClient({region: config.awsRegion})

function subject(attributes: {Name?: string; Value?: string}[] | undefined): string | undefined {
  return attributes?.find((attribute) => attribute.Name === 'sub')?.Value
}

export async function ensureCognitoUser(email: string): Promise<string> {
  try {
    const existing = await client.send(new AdminGetUserCommand({UserPoolId: config.cognitoUserPoolId, Username: email}))
    const existingSubject = subject(existing.UserAttributes)
    if (!existingSubject) throw new Error('Cognito user is missing a subject claim.')
    return existingSubject
  } catch (error) {
    if (!(error instanceof UserNotFoundException) && (error as {name?: string}).name !== 'UserNotFoundException') throw error
  }
  // Cognito delivers its managed temporary-password email only after the
  // recipient accepts the separate SES invitation. Passwords never traverse
  // this service or the Vercel frontend.
  const created = await client.send(new AdminCreateUserCommand({
    UserPoolId: config.cognitoUserPoolId,
    Username: email,
    DesiredDeliveryMediums: ['EMAIL'],
    UserAttributes: [{Name: 'email', Value: email}, {Name: 'email_verified', Value: 'true'}],
  }))
  const createdSubject = subject(created.User?.Attributes)
  if (!createdSubject) throw new Error('Cognito did not return a user subject.')
  return createdSubject
}

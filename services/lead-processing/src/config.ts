export function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

export const config = {
  port: Number(process.env.PORT || '8089'),
  // Neon is the application system of record. Keep this explicit so this
  // process cannot accidentally be wired to the control-plane RDS URL.
  databaseUrl: required('LEADS_DATABASE_URL'),
  hashKey: required('LEADS_HASH_KEY'),
  encryptionKey: required('LEADS_ENCRYPTION_KEY'),
  encryptionKeyId: process.env.LEADS_ENCRYPTION_KEY_ID || 'v1',
  backendToken: required('BACKEND_API_SHARED_SECRET'),
  crmApiUrl: required('CRM_API_URL'),
  crmApiKey: required('CRM_API_KEY'),
  crmWebhookSecret: required('CRM_WEBHOOK_SECRET'),
  allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
}

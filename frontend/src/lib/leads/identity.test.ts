import assert from 'node:assert/strict'
import test from 'node:test'
import {
  allowsPersonalEmailForDevelopment,
  companyDomain,
  normalizeDomain,
  validateIdentityForCapture,
  validatePilotRoleEmailDomains,
} from './identity'

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

function withDevelopmentPersonalEmailOptIn(callback: () => void) {
  const previousNodeEnv = process.env.NODE_ENV
  const previousPersonalEmailFlag = process.env.LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV
  process.env.NODE_ENV = 'development'
  process.env.LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV = 'true'

  try {
    callback()
  } finally {
    restoreEnvironment('NODE_ENV', previousNodeEnv)
    restoreEnvironment('LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV', previousPersonalEmailFlag)
  }
}

function withBrowserDevelopmentPersonalEmailOptIn(
  enabled: boolean,
  callback: () => void,
) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const previousNodeEnv = process.env.NODE_ENV
  const previousPublicFlag = process.env.NEXT_PUBLIC_ALLOW_PERSONAL_EMAILS_FOR_DEV
  Object.defineProperty(globalThis, 'window', {configurable: true, value: {}})
  process.env.NODE_ENV = 'development'
  process.env.NEXT_PUBLIC_ALLOW_PERSONAL_EMAILS_FOR_DEV = String(enabled)

  try {
    callback()
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, 'window', previousWindow)
    } else {
      delete (globalThis as {window?: unknown}).window
    }
    restoreEnvironment('NODE_ENV', previousNodeEnv)
    restoreEnvironment('NEXT_PUBLIC_ALLOW_PERSONAL_EMAILS_FOR_DEV', previousPublicFlag)
  }
}

test('business email determines company identity without a website', () => {
  const identity = {
    email: 'Person@Studio.Example',
    company: 'Studio',
    role: 'producer',
    website: '',
  }
  assert.equal(validateIdentityForCapture(identity), null)
  assert.equal(companyDomain(identity), 'studio.example')
})

test('public email domains are rejected', () => {
  const publicEmail = {
    email: 'person@gmail.com',
    company: 'Studio',
    role: 'producer',
    website: '',
  }
  assert.match(validateIdentityForCapture(publicEmail) || '', /company email domain is required/)

  // Even with a website, public email is now rejected
  const withWebsite = {...publicEmail, website: 'https://www.studio.example/work'}
  assert.match(validateIdentityForCapture(withWebsite) || '', /company email domain is required/)
})

test('development opt-in accepts Gmail and Outlook-family inboxes with a website', () => {
  withDevelopmentPersonalEmailOptIn(() => {
    for (const domain of ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com']) {
      const identity = {
        email: `person@${domain}`,
        company: 'Dev Pilot Studio',
        role: 'producer',
        website: 'https://dev-pilot.example',
      }

      assert.equal(allowsPersonalEmailForDevelopment(domain), true)
      assert.equal(validateIdentityForCapture(identity), null)
    }
  })
})

test('development personal-email testing still requires the opt-in and a website', () => {
  const gmailIdentity = {
    email: 'person@gmail.com',
    company: 'Dev Pilot Studio',
    role: 'producer',
    website: 'https://dev-pilot.example',
  }

  const previousNodeEnv = process.env.NODE_ENV
  const previousPersonalEmailFlag = process.env.LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV
  process.env.NODE_ENV = 'development'
  delete process.env.LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV
  try {
    assert.match(validateIdentityForCapture(gmailIdentity) || '', /company email domain is required/)
  } finally {
    restoreEnvironment('NODE_ENV', previousNodeEnv)
    restoreEnvironment('LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV', previousPersonalEmailFlag)
  }

  withDevelopmentPersonalEmailOptIn(() => {
    assert.match(
      validateIdentityForCapture({...gmailIdentity, website: ''}) || '',
      /valid company website/,
    )
  })
})

test('browser validation uses the public development opt-in', () => {
  withBrowserDevelopmentPersonalEmailOptIn(false, () => {
    assert.equal(allowsPersonalEmailForDevelopment('gmail.com'), false)
  })
  withBrowserDevelopmentPersonalEmailOptIn(true, () => {
    assert.equal(allowsPersonalEmailForDevelopment('gmail.com'), true)
  })
})

test('development personal-email testing rejects other public and disposable domains', () => {
  withDevelopmentPersonalEmailOptIn(() => {
    for (const domain of ['yahoo.com', 'mailinator.com']) {
      const identity = {
        email: `person@${domain}`,
        company: 'Dev Pilot Studio',
        role: 'producer',
        website: 'https://dev-pilot.example',
      }

      assert.equal(allowsPersonalEmailForDevelopment(domain), false)
      assert.match(validateIdentityForCapture(identity) || '', /company email domain is required/)
    }
  })
})

test('pilot role emails use the same development-only policy on the server', () => {
  const roleEmails = {
    productionOwnerEmail: 'owner@gmail.com',
    economicBuyerEmail: 'buyer@googlemail.com',
    technicalEvaluatorEmail: 'technical@outlook.com',
    approverEmail: 'approver@hotmail.com',
    signerEmail: 'signer@live.com',
  }

  const previousNodeEnv = process.env.NODE_ENV
  const previousPersonalEmailFlag = process.env.LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV
  process.env.NODE_ENV = 'production'
  process.env.LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV = 'true'
  try {
    for (const [field, email] of Object.entries(roleEmails)) {
      assert.match(
        validatePilotRoleEmailDomains({[field]: email}) || '',
        /company email domain is required/,
      )
    }
  } finally {
    restoreEnvironment('NODE_ENV', previousNodeEnv)
    restoreEnvironment('LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV', previousPersonalEmailFlag)
  }

  withDevelopmentPersonalEmailOptIn(() => {
    assert.equal(validatePilotRoleEmailDomains(roleEmails), null)
  })
})

test('production rejects personal domains even when the development flag is set', () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousPersonalEmailFlag = process.env.LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV
  process.env.NODE_ENV = 'production'
  process.env.LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV = 'true'

  try {
    const identity = {
      email: 'person@gmail.com',
      company: 'Dev Pilot Studio',
      role: 'producer',
      website: 'https://dev-pilot.example',
    }
    assert.equal(allowsPersonalEmailForDevelopment('gmail.com'), false)
    assert.match(validateIdentityForCapture(identity) || '', /company email domain is required/)
  } finally {
    restoreEnvironment('NODE_ENV', previousNodeEnv)
    restoreEnvironment('LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV', previousPersonalEmailFlag)
  }
})

test('domain normalization strips only the conventional www prefix', () => {
  assert.equal(normalizeDomain('WWW.Example.com/path'), 'example.com')
  assert.equal(normalizeDomain('studio.example.com'), 'studio.example.com')
})

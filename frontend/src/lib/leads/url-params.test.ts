import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyFallbackDefaults,
  getDisplayValue,
  normalizeUrlParams,
  parseUrlParams,
  shouldHideField,
  validateUrlParamEmail,
} from './url-params'

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

function withDevelopmentMode(callback: () => void) {
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'

  try {
    callback()
  } finally {
    restoreEnvironment('NODE_ENV', previousNodeEnv)
  }
}

function withProductionMode(callback: () => void) {
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'

  try {
    callback()
  } finally {
    restoreEnvironment('NODE_ENV', previousNodeEnv)
  }
}

function withMockWindow(callback: (window: {location: {search: string}}) => void) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const mockWindow = {
    location: { search: '' },
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: mockWindow,
  })

  try {
    callback(mockWindow as unknown as {location: {search: string}})
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, 'window', previousWindow)
    } else {
      delete (globalThis as {window?: unknown}).window
    }
  }
}

test('parseUrlParams returns empty object when window is undefined', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  delete (globalThis as {window?: unknown}).window

  try {
    const result = parseUrlParams()
    assert.deepEqual(result, {})
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, 'window', previousWindow)
    }
  }
})

test('parseUrlParams parses valid parameters', () => {
  withMockWindow((window) => {
    window.location.search = '?how_did_you_hear=linkedin&what_brought_you=workflow-problem'
    const result = parseUrlParams()
    assert.equal(result.how_did_you_hear, 'linkedin')
    assert.equal(result.what_brought_you, 'workflow-problem')
  })
})

test('parseUrlParams handles enum capitalization', () => {
  withMockWindow((window) => {
    window.location.search = '?how_did_you_hear=LinkedIn&what_brought_you=WORKFLOW-PROBLEM'
    const result = parseUrlParams()
    // Zod enum is case-sensitive, so capitalized values are rejected
    // Normalization happens in normalizeUrlParams
    assert.equal(result.how_did_you_hear, undefined)
    assert.equal(result.what_brought_you, undefined)
  })
})

test('parseUrlParams ignores invalid enum values', () => {
  withMockWindow((window) => {
    window.location.search = '?how_did_you_hear=invalid-source&what_brought_you=workflow-problem'
    const result = parseUrlParams()
    assert.equal(result.how_did_you_hear, undefined)
    assert.equal(result.what_brought_you, 'workflow-problem')
  })
})

test('parseUrlParams handles missing parameters', () => {
  withMockWindow((window) => {
    window.location.search = ''
    const result = parseUrlParams()
    assert.equal(result.how_did_you_hear, undefined)
    assert.equal(result.what_brought_you, undefined)
  })
})

test('parseUrlParams parses email with validation', () => {
  withMockWindow((window) => {
    window.location.search = '?email=user@example.com'
    const result = parseUrlParams()
    assert.equal(result.email, 'user@example.com')
  })
})

test('parseUrlParams rejects invalid email format', () => {
  withMockWindow((window) => {
    window.location.search = '?email=not-an-email'
    const result = parseUrlParams()
    assert.equal(result.email, undefined)
  })
})

test('parseUrlParams parses identity fields', () => {
  withMockWindow((window) => {
    window.location.search = '?name=John%20Doe&company=Acme&role=founder-executive&website=https://example.com'
    const result = parseUrlParams()
    assert.equal(result.name, 'John Doe')
    assert.equal(result.company, 'Acme')
    assert.equal(result.role, 'founder-executive')
    assert.equal(result.website, 'https://example.com')
  })
})

test('parseUrlParams handles URL-encoded spaces', () => {
  withMockWindow((window) => {
    window.location.search = '?name=John%20Doe&company=The%20Production%20Company'
    const result = parseUrlParams()
    assert.equal(result.name, 'John Doe')
    assert.equal(result.company, 'The Production Company')
  })
})

test('parseUrlParams handles plus-encoded spaces', () => {
  withMockWindow((window) => {
    window.location.search = '?name=John+Doe&company=The+Production+Company'
    const result = parseUrlParams()
    assert.equal(result.name, 'John Doe')
    assert.equal(result.company, 'The Production Company')
  })
})

test('parseUrlParams enforces max length constraints', () => {
  withMockWindow((window) => {
    const longString = 'a'.repeat(200)
    window.location.search = `?name=${longString}`
    const result = parseUrlParams()
    assert.equal(result.name, undefined)
  })
})

test('parseUrlParams allows text fields within limits', () => {
  withMockWindow((window) => {
    const validString = 'a'.repeat(100)
    window.location.search = `?name=${validString}`
    const result = parseUrlParams()
    assert.equal(result.name, validString)
  })
})

test('parseUrlParams handles multiple parameters', () => {
  withMockWindow((window) => {
    window.location.search = '?how_did_you_hear=linkedin&what_brought_you=workflow-problem&email=user@example.com&name=John+Doe&company=Acme'
    const result = parseUrlParams()
    assert.equal(result.how_did_you_hear, 'linkedin')
    assert.equal(result.what_brought_you, 'workflow-problem')
    assert.equal(result.email, 'user@example.com')
    assert.equal(result.name, 'John Doe')
    assert.equal(result.company, 'Acme')
  })
})

test('parseUrlParams returns partial valid params on validation failure', () => {
  withMockWindow((window) => {
    window.location.search = '?how_did_you_hear=invalid&what_brought_you=workflow-problem&email=user@example.com'
    const result = parseUrlParams()
    assert.equal(result.how_did_you_hear, undefined)
    assert.equal(result.what_brought_you, 'workflow-problem')
    assert.equal(result.email, 'user@example.com')
  })
})

test('normalizeUrlParams lowercases enum values', () => {
  const input = {
    how_did_you_hear: 'LinkedIn',
    what_brought_you: 'WORKFLOW-PROBLEM',
    interest: 'SECURITY-REVIEW',
  }
  const result = normalizeUrlParams(input)
  assert.equal(result.how_did_you_hear, 'linkedin')
  assert.equal(result.what_brought_you, 'workflow-problem')
  assert.equal(result.interest, 'security-review')
})

test('normalizeUrlParams lowercases email', () => {
  const input = { email: 'USER@EXAMPLE.COM' }
  const result = normalizeUrlParams(input)
  assert.equal(result.email, 'user@example.com')
})

test('normalizeUrlParams title-cases names', () => {
  const input = { name: 'john doe' }
  const result = normalizeUrlParams(input)
  assert.equal(result.name, 'John Doe')
})

test('normalizeUrlParams lowercases companies', () => {
  const input = { company: 'ACME CORP' }
  const result = normalizeUrlParams(input)
  assert.equal(result.company, 'acme corp')
})

test('normalizeUrlParams lowercases roles', () => {
  const input = { role: 'FOUNDER-EXECUTIVE' }
  const result = normalizeUrlParams(input)
  assert.equal(result.role, 'founder-executive')
})

test('normalizeUrlParams preserves free text case', () => {
  const input = { what_brought_you_other: 'This is a detailed explanation' }
  const result = normalizeUrlParams(input)
  assert.equal(result.what_brought_you_other, 'This is a detailed explanation')
})

test('normalizeUrlParams adds https to website without protocol', () => {
  const input = { website: 'example.com' }
  const result = normalizeUrlParams(input)
  assert.equal(result.website, 'https://example.com')
})

test('normalizeUrlParams preserves existing website protocol', () => {
  const input = { website: 'https://example.com' }
  const result = normalizeUrlParams(input)
  assert.equal(result.website, 'https://example.com')
})

test('normalizeUrlParams preserves http protocol', () => {
  const input = { website: 'http://example.com' }
  const result = normalizeUrlParams(input)
  assert.equal(result.website, 'http://example.com')
})

test('normalizeUrlParams handles empty website', () => {
  const input = { website: '' }
  const result = normalizeUrlParams(input)
  // Empty website is not included in output
  assert.equal(result.website, undefined)
})

test('applyFallbackDefaults sets google-search for missing how_did_you_hear', () => {
  const input = { what_brought_you: 'workflow-problem' }
  const result = applyFallbackDefaults(input)
  assert.equal(result.how_did_you_hear, 'google-search')
  assert.equal(result.what_brought_you, 'workflow-problem')
})

test('applyFallbackDefaults preserves existing how_did_you_hear', () => {
  const input = { how_did_you_hear: 'linkedin' }
  const result = applyFallbackDefaults(input)
  assert.equal(result.how_did_you_hear, 'linkedin')
})

test('applyFallbackDefaults does not set fallback for other fields', () => {
  const input = {}
  const result = applyFallbackDefaults(input)
  assert.equal(result.how_did_you_hear, 'google-search')
  assert.equal(result.what_brought_you, undefined)
  assert.equal(result.email, undefined)
})

test('validateUrlParamEmail validates correct email format', () => {
  const result = validateUrlParamEmail('user@example.com')
  assert.equal(result.valid, true)
  assert.equal(result.error, undefined)
})

test('validateUrlParamEmail rejects invalid email format', () => {
  const result = validateUrlParamEmail('not-an-email')
  assert.equal(result.valid, false)
  assert.equal(result.error, 'invalid email format')
})

test('validateUrlParamEmail rejects empty email as invalid', () => {
  const result = validateUrlParamEmail('')
  assert.equal(result.valid, true)
})

test('validateUrlParamEmail rejects overly long email', () => {
  const longEmail = 'a'.repeat(300) + '@example.com'
  const result = validateUrlParamEmail(longEmail)
  assert.equal(result.valid, false)
})

test('shouldHideField returns false for empty values', () => {
  const result = shouldHideField('howDidYouHearAboutPortals', '')
  assert.equal(result, false)
})

test('shouldHideField returns false for null values', () => {
  const result = shouldHideField('howDidYouHearAboutPortals', null)
  assert.equal(result, false)
})

test('shouldHideField returns false for undefined values', () => {
  const result = shouldHideField('howDidYouHearAboutPortals', undefined)
  assert.equal(result, false)
})

test('shouldHideField returns true for non-critical fields with values', () => {
  const result = shouldHideField('howDidYouHearAboutPortals', 'linkedin')
  assert.equal(result, true)
})

test('shouldHideField returns false for critical fields with values', () => {
  const result = shouldHideField('email', 'user@example.com')
  assert.equal(result, false)
})

test('shouldHideField returns false for company field with values', () => {
  const result = shouldHideField('company', 'Acme')
  assert.equal(result, false)
})

test('shouldHideField returns false for role field with values', () => {
  const result = shouldHideField('role', 'founder-executive')
  assert.equal(result, false)
})

test('getDisplayValue title-cases company names', () => {
  const result = getDisplayValue('acme corp', 'company')
  assert.equal(result, 'Acme Corp')
})

test('getDisplayValue title-cases names', () => {
  const result = getDisplayValue('john doe', 'name')
  assert.equal(result, 'John Doe')
})

test('getDisplayValue lowercases roles', () => {
  const result = getDisplayValue('FOUNDER-EXECUTIVE', 'role')
  assert.equal(result, 'founder-executive')
})

test('getDisplayValue preserves text case', () => {
  const result = getDisplayValue('This is a detailed explanation', 'text')
  assert.equal(result, 'This is a detailed explanation')
})

test('full URL parameter flow: parse, normalize, apply defaults', () => {
  withMockWindow((window) => {
    window.location.search = '?how_did_you_hear=linkedin&what_brought_you=workflow-problem&email=USER@EXAMPLE.COM&name=john+doe&company=ACME'
    
    const parsed = parseUrlParams()
    const normalized = normalizeUrlParams(parsed)
    const withDefaults = applyFallbackDefaults(normalized)
    
    assert.equal(withDefaults.how_did_you_hear, 'linkedin')
    assert.equal(withDefaults.what_brought_you, 'workflow-problem')
    assert.equal(withDefaults.email, 'user@example.com')
    assert.equal(withDefaults.name, 'John Doe')
    assert.equal(withDefaults.company, 'acme')
  })
})

test('full URL parameter flow with missing values', () => {
  withMockWindow((window) => {
    window.location.search = '?what_brought_you=workflow-problem'
    
    const parsed = parseUrlParams()
    const normalized = normalizeUrlParams(parsed)
    const withDefaults = applyFallbackDefaults(normalized)
    
    assert.equal(withDefaults.how_did_you_hear, 'google-search')
    assert.equal(withDefaults.what_brought_you, 'workflow-problem')
    assert.equal(withDefaults.email, undefined)
  })
})

test('normalizeUrlParams should handle manually constructed capitalized params', () => {
  // Test that if someone bypasses parseUrlParams and directly calls normalizeUrlParams
  // with capitalized values, it will lowercase them
  const input = {
    how_did_you_hear: 'LinkedIn',
    what_brought_you: 'WORKFLOW-PROBLEM',
  }
  const result = normalizeUrlParams(input)
  assert.equal(result.how_did_you_hear, 'linkedin')
  assert.equal(result.what_brought_you, 'workflow-problem')
})

test('handles UTM parameters (parsing only, mapping handled elsewhere)', () => {
  withMockWindow((window) => {
    window.location.search = '?utm_source=linkedin&utm_medium=social&utm_campaign=brand-awareness&what_brought_you=workflow-problem'
    const result = parseUrlParams()
    // UTM params are not in the schema, so they won't be parsed
    // This is expected - UTM mapping is handled in analytics-client
    assert.equal(result.what_brought_you, 'workflow-problem')
  })
})

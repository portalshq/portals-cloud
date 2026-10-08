import assert from 'node:assert/strict'
import test from 'node:test'
import React, {act} from 'react'
import {JSDOM} from 'jsdom'
import {pilotAssessmentPrefill} from './assessment-diagnostic'
import {completeAssessment, highAssessment} from './assessment-fixtures'
import type {KnownLeadContext} from './contracts'

const identityContext: KnownLeadContext = {
  known: true,
  knownFields: ['name', 'email', 'company', 'role', 'website'],
  knownAnswerFields: [],
  identity: {
    name: 'Test Producer',
    email: 'producer@studio.test',
    company: 'Studio',
    role: 'production-operations',
    website: 'https://studio.test',
  },
}

test('progressive form validates, preserves navigation/drafts, and submits accessible explainable results', async (t) => {
  const previousToken = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN
  process.env.NEXT_PUBLIC_MIXPANEL_TOKEN = 'test-token'
  t.after(() => {
    if (previousToken === undefined)
      delete process.env.NEXT_PUBLIC_MIXPANEL_TOKEN
    else process.env.NEXT_PUBLIC_MIXPANEL_TOKEN = previousToken
  })
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'https://portals.test/assessment?utm_source=email',
    pretendToBeVisual: true,
  })
  const globals = {
    window: dom.window,
    self: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLSelectElement: dom.window.HTMLSelectElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    FormData: dom.window.FormData,
    CustomEvent: dom.window.CustomEvent,
    Event: dom.window.Event,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    React,
    IS_REACT_ACT_ENVIRONMENT: true,
  }
  const saved = Object.fromEntries(
    Object.keys(globals).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  )
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    })
  const {createRoot} = await import('react-dom/client')
  const {AssessmentForm} = await import('@/components/leads/AssessmentForm')
  let root = createRoot(document.getElementById('root')!)
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const key of Object.keys(globals)) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]!)
      else delete (globalThis as Record<string, unknown>)[key]
    }
  })
  const submit = async () => {
    await act(async () => {
      document
        .querySelector<HTMLFormElement>('form')!
        .dispatchEvent(
          new dom.window.Event('submit', {bubbles: true, cancelable: true}),
        )
    })
  }
  const currentStage = () =>
    document.querySelector<HTMLFieldSetElement>(
      'fieldset[data-stage]:not([hidden])',
    )?.dataset.stage
  await act(async () =>
    root.render(
      React.createElement(AssessmentForm, {context: identityContext}),
    ),
  )
  assert.equal(currentStage(), '0')
  assert.equal(
    document.querySelector('progress')?.getAttribute('aria-label'),
    'Assessment progress',
  )
  await submit()
  assert.ok(
    document
      .querySelector('[role="alert"]')
      ?.textContent?.includes('Please answer'),
  )
  assert.equal(
    document.activeElement?.getAttribute('data-question'),
    'production_status',
  )
  await act(async () => root.unmount())
  root = createRoot(document.getElementById('root')!)
  await act(async () =>
    root.render(
      React.createElement(AssessmentForm, {
        context: {...identityContext, answerValues: highAssessment},
      }),
    ),
  )
  await submit()
  assert.equal(currentStage(), '1')
  assert.equal(document.activeElement?.textContent, 'Transferability')
  assert.ok(
    document.querySelector('label[for="transferability_without_originator"]'),
  )
  const back = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'Back',
  )!
  await act(async () => back.click())
  assert.equal(currentStage(), '0')
  assert.equal(
    document.querySelector<HTMLSelectElement>('[name="production_status"]')
      ?.value,
    'live_now',
  )
  await submit()
  await act(async () => root.unmount())
  root = createRoot(document.getElementById('root')!)
  await act(async () =>
    root.render(
      React.createElement(AssessmentForm, {context: identityContext}),
    ),
  )
  assert.equal(
    document.querySelector<HTMLSelectElement>('[name="production_status"]')
      ?.value,
    'live_now',
  )
  assert.equal(
    document.querySelector<HTMLInputElement>(
      '[name="context_storage_locations:creator_memory_or_undocumented"]',
    )?.checked,
    true,
  )
  let submitted: {answers: Record<string, unknown>} | undefined
  const analytics: Array<{event: string; properties: Record<string, unknown>}> =
    []
  t.mock.method(
    globalThis,
    'fetch',
    async (url: unknown, init?: RequestInit) => {
      if (String(url) === '/api/analytics/track') {
        analytics.push(JSON.parse(String(init?.body)))
        return new Response(JSON.stringify({ok: true}), {status: 200})
      }
      assert.equal(String(url), '/api/leads')
      submitted = JSON.parse(String(init?.body))
      return new Response(
        JSON.stringify({
          ok: true,
          nextAction: 'pilot_scope',
          qualificationTier: 'high',
          diagnosticResult: {
            title: 'Strong production-pilot candidate',
            explanations: ['Approved work requires substantial handoff.'],
            recommendation: 'Make approved production state transferable.',
          },
        }),
        {status: 200},
      )
    },
  )
  for (let index = 0; index < 8; index++) await submit()
  assert.equal(submitted?.answers.assessment_version, 'assessment.v4')
  assert.deepEqual(
    submitted?.answers.context_storage_locations,
    highAssessment.context_storage_locations,
  )
  assert.equal(submitted?.answers.incorrect_source_exposure, undefined)
  assert.ok(
    document
      .querySelector('[role="status"]')
      ?.textContent?.includes('Strong production-pilot candidate'),
  )
  assert.ok(document.querySelector('a[href="/pilot?from=assessment#scope"]'))
  assert.ok(!document.body.textContent?.includes('A_STATE_PERSON_DEPENDENT'))
  dom.window.localStorage.setItem('portals_analytics_consent', 'accepted')
  await act(async () => root.unmount())
  root = createRoot(document.getElementById('root')!)
  await act(async () =>
    root.render(
      React.createElement(AssessmentForm, {
        context: {...identityContext, answerValues: completeAssessment},
      }),
    ),
  )
  for (let index = 0; index < 3; index++) await submit()
  assert.equal(
    currentStage(),
    '4',
    'excellent transfer skips the handoff stage',
  )
  assert.equal(
    document
      .querySelector('[data-question="most_recent_incident"]')
      ?.hasAttribute('hidden'),
    true,
  )
  for (let index = 0; index < 3; index++) await submit()
  assert.equal(currentStage(), '7')
  assert.equal(
    document
      .querySelector('[data-question="incorrect_source_exposure"]')
      ?.hasAttribute('hidden'),
    true,
  )
  const ip = document.querySelector<HTMLSelectElement>(
    '[name="ip_controlled_content"]',
  )!
  await act(async () => {
    ip.value = 'yes'
    ip.dispatchEvent(new dom.window.Event('change', {bubbles: true}))
  })
  assert.equal(
    document
      .querySelector('[data-question="incorrect_source_exposure"]')
      ?.hasAttribute('hidden'),
    false,
  )
  await submit()
  assert.ok(
    document
      .querySelector('[role="alert"]')
      ?.textContent?.includes('Please answer'),
  )
  await act(async () => root.unmount())
  dom.reconfigure({
    url: 'https://portals.test/assessment?email=new@studio.test&name=New+Producer&company=New+Studio&role=production-operations',
  })
  root = createRoot(document.getElementById('root')!)
  await act(async () =>
    root.render(
      React.createElement(AssessmentForm, {
        context: {...identityContext, answerValues: highAssessment},
      }),
    ),
  )
  assert.equal(
    document.querySelector<HTMLInputElement>('[name="email"]')?.value,
    'new@studio.test',
  )
  assert.equal(
    document.querySelector<HTMLInputElement>('[name="company"]')?.value,
    'new studio',
  )
  assert.equal(
    document.querySelector<HTMLSelectElement>('[name="production_status"]')
      ?.value,
    '',
    'a new identity cannot inherit another profile’s qualification',
  )
  await act(async () => root.unmount())
  const {ProgressiveAssessmentFields} = await import(
    '@/components/leads/ProgressiveAssessmentFields'
  )
  root = createRoot(document.getElementById('root')!)
  await act(async () =>
    root.render(
      React.createElement(ProgressiveAssessmentFields, {
        context: {
          ...identityContext,
          answerValues: {
            ...highAssessment,
            ...pilotAssessmentPrefill(highAssessment),
          },
        },
        onStarted: () => {},
      }),
    ),
  )
  assert.equal(
    document.querySelector('select'),
    null,
    'v4 pilot applicants should not repeat the historical diagnostic',
  )
  assert.ok(document.body.textContent?.includes('Time to transfer'))
  for (const event of [
    'assessment_viewed',
    'assessment_started',
    'assessment_stage_completed',
    'assessment_branch_entered',
  ])
    assert.ok(analytics.some((value) => value.event === event))
  assert.ok(
    analytics.some(
      (value) =>
        value.event === 'assessment_branch_entered' &&
        value.properties.branch === 'controlled_ip',
    ),
  )
  assert.ok(
    !JSON.stringify(analytics).includes(
      String(highAssessment.most_urgent_active_workflow),
    ),
  )
})

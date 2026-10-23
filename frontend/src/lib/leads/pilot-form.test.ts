import assert from 'node:assert/strict'
import test from 'node:test'
import React, {act} from 'react'
import {JSDOM} from 'jsdom'
import {highAssessment} from './assessment-fixtures'
import {pilotAssessmentContext} from './pilot-inheritance'
import {PRIMARY_PILOT_SUCCESS_TEST} from './pilot-success'

test('a returning qualified applicant keeps edits, skips discovery, and submits the unified success test', async (t) => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'https://portals.test/pilot',
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
    ])
  )
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    })
  dom.window.HTMLElement.prototype.scrollIntoView = () => {}
  dom.window.matchMedia = () => ({
    matches: true,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true
    },
    media: '',
  })
  let captured: any
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    captured = JSON.parse(String(init?.body))
    return new Response(
      JSON.stringify({
        ok: true,
        nextAction: 'pilot_room',
        pilotUrl: '/account/owned/pilot-room/test',
        pilotRoute: 'zero-call',
        profileId: 'owned',
        pilotAuthToken: 'one-time-test-token',
      }),
      {status: 200}
    )
  })
  const {createRoot} = await import('react-dom/client')
  const {PilotScopeForm} = await import('@/components/leads/PilotScopeForm')
  let root = createRoot(document.getElementById('root')!)
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const key of Object.keys(globals)) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]!)
      else delete (globalThis as Record<string, unknown>)[key]
    }
  })
  const answers = pilotAssessmentContext(highAssessment)
  const render = async (values: Record<string, unknown>) =>
    act(async () =>
      root.render(
        React.createElement(PilotScopeForm, {
          specSummary: 'Studio pilot / 21 days',
          context: {
            known: true,
            profileId: 'owned',
            assessmentCompleted: true,
            knownFields: ['name', 'email', 'company', 'role', 'website'],
            knownAnswerFields: Object.keys(values),
            identity: {
              name: 'Test Producer',
              email: 'producer@studio.test',
              company: 'Studio',
              role: 'production-operations',
            },
            answerValues: values,
          },
          annualOptions: [
            {slug: 'production-team', name: 'Production Team', priceLabel: '$60,000 annually from CMS'},
            {slug: 'studio', name: 'Studio', priceLabel: 'Studio annual pricing from CMS'},
          ],
          packageSpecifications: [{
            _id: 'production-team-package',
            status: 'published',
            packageKind: 'subscription',
            name: 'Production Team',
            slug: 'production-team',
            sortOrder: 1,
            price: {amount: 5000, annualAmount: 60000, onboardingFee: 2500, displayValue: '$5,000', currency: 'USD', periodLabel: '/month'},
          }, {
            _id: 'studio-package',
            status: 'published',
            packageKind: 'subscription',
            name: 'Studio',
            slug: 'studio',
            sortOrder: 1,
            price: {amount: 2400, annualAmount: 28800, onboardingFee: 1750, displayValue: '$2,400', currency: 'USD', periodLabel: '/month'},
          }, {
            _id: 'studio-pilot-package',
            status: 'published',
            packageKind: 'paidPilot',
            name: 'Studio Pilot',
            slug: 'studio-pilot',
            sortOrder: 10,
            price: {amount: 3900, displayValue: '$3,900', currency: 'USD', periodLabel: 'one-time'},
          }],
        })
      )
    )
  await render(answers)
  const historicalSelect = document.querySelector<HTMLSelectElement>(
    '[name="historicalProject"]'
  )!
  assert.equal(historicalSelect.labels?.[0].textContent, 'historical project *')
  const set = async (name: string, value: string) => {
    await act(async () => {
      const input = document.querySelector<HTMLInputElement>(
        `[name="${name}"]`
      )!
      input.value = value
      input.dispatchEvent(new dom.window.Event('change', {bubbles: true}))
    })
  }
  const click = async (label: string) => {
    await act(async () => {
      const button = [
        ...document.querySelectorAll<HTMLButtonElement>('button'),
      ].find((x) => x.textContent?.trim() === label)!
      assert.ok(button, label)
      button.click()
    })
  }
  await set('historicalProject', 'one-completed')
  await set('dataClassification', 'confidential')
  await click('Continue')
  assert.equal(
    document.querySelectorAll(
      '[name="toolsUsed"],[name="teamType"],[name="transferability_without_originator"]'
    ).length,
    0
  )
  assert.equal(
    (
      document.querySelector(
        '[name="requiredIntegrations"]'
      ) as HTMLTextAreaElement
    ).value,
    'ComfyUI, Runway, Midjourney'
  )
  await set('participantsRange', '2-4')
  await set('integrationMethod', 'manual-upload')
  await set('requiredIntegrations', 'Saved export path')
  await click('Back')
  await click('Continue')
  assert.equal(
    (
      document.querySelector(
        '[name="requiredIntegrations"]'
      ) as HTMLTextAreaElement
    ).value,
    'Saved export path'
  )
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400))
  })
  await act(async () => root.unmount())
  root = createRoot(document.getElementById('root')!)
  await render(
    pilotAssessmentContext({
      ...highAssessment,
      most_urgent_active_workflow: 'Updated assessment workflow',
    })
  )
  assert.equal(
    (document.querySelector('[name="pilotWorkflow"]') as HTMLTextAreaElement)
      .value,
    'Updated assessment workflow'
  )
  await click('Continue')
  assert.equal(
    (
      document.querySelector(
        '[name="requiredIntegrations"]'
      ) as HTMLTextAreaElement
    ).value,
    'Saved export path'
  )
  await click('Continue')
  assert.equal(
    document.querySelectorAll(
      'input[type="checkbox"][name="successCriterionKeysJson"]'
    ).length,
    0
  )
  assert.equal(
    (document.querySelector('[name="successCriteria"]') as HTMLTextAreaElement)
      .value,
    PRIMARY_PILOT_SUCCESS_TEST
  )
  await click('Continue')
  await set('budgetOwner', 'production')
  await set('budgetReadiness', 'current-cycle')
  await set('annualDeploymentOption', 'production-team')
  assert.match(document.body.textContent || '', /proposed production team annual plan and the onboarding fee of \$2,500/)
  await set('annualDeploymentOption', 'studio')
  assert.match(document.body.textContent || '', /proposed studio annual plan and the pilot fee of \$3,900/)
  await act(async () => {
    ;(
      document.querySelector(
        '[name="annualPriceAcknowledged"]'
      ) as HTMLInputElement
    ).click()
  })
  await click('Continue')
  await click('Create my pilot plan')
  assert.ok(captured)
  assert.equal(captured.answers.successCriteria, PRIMARY_PILOT_SUCCESS_TEST)
  assert.equal(captured.answers.requiredIntegrations, 'Saved export path')
  assert.equal(captured.answers.productionOwner, 'Senior producer')
  assert.equal(captured.answers.productionOwnerEmail, '')
  const confirmation = JSON.parse(
    dom.window.localStorage.getItem('portals_pilot_confirmation:owned')!
  )
  assert.equal(
    confirmation.pilotUrl,
    '/auth/sign-in?next=%2Faccount%2Fowned%2Fpilot-room%2Ftest'
  )
  assert.equal(
    dom.window.localStorage.getItem('portals_pilot_confirmation:direct'),
    null
  )
  assert.ok(
    !JSON.stringify(dom.window.localStorage).includes('one-time-test-token')
  )
  assert.equal(
    document.querySelector('[role="status"] a')?.getAttribute('href'),
    '/auth/verify?token=one-time-test-token&next=%2Faccount%2Fowned%2Fpilot-room%2Ftest'
  )
  assert.ok(
    document
      .querySelector('[role="status"]')
      ?.textContent?.includes('approval room is ready')
  )
  await click('submit a new pilot request')
  assert.ok(document.querySelector('form'))
})

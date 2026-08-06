// console auto-fill script. Paste it into the browser console on the /paid-pilot page (the pilot-scope form). All option values are taken directly from PilotScopeForm.tsx / ProgressiveAssessmentFields.tsx so they pass the :invalid gating on each stage.
(() => {
  const $ = (s) => document.querySelector(s)
  const $$ = (s) => Array.from(document.querySelectorAll(s))
  const nativeValueSetter = (el) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype
    return Object.getOwnPropertyDescriptor(proto, 'value').set
  }
  const nativeCheckedSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, 'checked').set

  function setField(name, value) {
    const el = $(`[name="${name}"]`)
    if (!el) return false
    if (el.type === 'checkbox') {
      nativeCheckedSetter.call(el, Boolean(value))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    }
    nativeValueSetter(el).call(el, String(value))
    el.dispatchEvent(new Event(
      el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    return true
  }

  function setCriteria(keys) {
    $$('input[name="successCriterionKeysJson"]').forEach((cb) => {
      nativeCheckedSetter.call(cb, keys.includes(cb.value))
      cb.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  const values = {
    // consent / identity
    email: 'bmejia220@gmail.com',
    company: 'Acme Creative',
    role: 'creative-leadership',
    website: 'https://acme.example.com',

    // stage 0
    pilotWorkflow: 'Approved-asset retrieval and meaningful extension for a client campaign archive; designers recreate or rework final assets without reliable lineage.',
    historicalProject: 'none',
    targetStartPeriod: 'within-30-days',

    // stage 1
    productionOwner: 'Jamie Reyes — Head of Production',
    economicBuyer: 'Maya Chen — VP Marketing',
    economicBuyerEmail: 'maya@acme.example.com',
    technicalEvaluator: 'Dana Wu — Technical Lead',
    technicalEvaluatorEmail: 'dana@acme.example.com',
    participantsRange: '2-4',
    integrationMethod: 'manual-upload',
    requiredIntegrations: 'Manual structured upload of approved Figma + Dropbox exports; nothing leaves our owned storage.',
    dataClassification: 'confidential',
    exactReproductionRequired: true,
    teamType: 'creative-studio',
    teamSize: '5-9',
    workflowCollaborators: '2-4',
    toolsUsed: '3-4',
    recurringWorkflow: 'weekly',
    assetVolume: '100-499',
    approvedVersionMethod: 'canonical-system',
    productionContextMethod: 'project-document',
    recreationFrequency: 'never',

    // stage 2 (criteria set via setCriteria below)
    successCriteria: 'An approved asset is retrievable in under one minute; a variant can be reproduced or meaningfully extended from its stored context.',
    securityRequirements: 'SSO required; signed MSA / SOC 2 available; data residency US-East; no training on client content.',

    // stage 3 (approvalPath procurement)
    approvalPath: 'procurement',
    annualDeploymentOption: 'studio',
    annualPriceAcknowledged: true,
    approverName: 'Brian Smith',
    approverEmail: 'brian@acme.example.com',

    budgetOwner: 'executive',
    budgetReadiness: 'current-cycle',
    signerName: 'Jamie Reyes',
    signerEmail: 'jamie@acme.example.com',
    pilotBlocker: 'Legal review of the pilot terms is required before signature.',
  }

  async function run() {
    Object.entries(values).forEach(([name, val]) => setField(name, val))
    setCriteria(['approved-retrieval', 'meaningful-extension', 'variant-lineage'])

    for (let i = 0; i < 8; i++) {
      const btn = $('.js-lead-submit')
      if (!btn) break
      const label = btn.textContent || ''
      if (label.includes('Build') || label.includes('submit the revised')) {
        console.log('[pilot-fill] clicking submit at stage', i)
        btn.click()
        return
      }
      btn.click()
      await new Promise((r) => setTimeout(r, 450))
    }
    console.log('[pilot-fill] done (no submit reached — check for stage errors)')
  }

  run()
})()
// Two notes:
// Must be a fresh form. If you've already submitted once, writePilotConfirmation puts the page in a success state — reload first.
// incidentType/peopleAffected/hoursLost/deliveryImpact safely mentioned recreationFrequency: 'never' → the incident block hides, so those required fields never validate. annualDeploymentOption is set to studio — change to production-team if you want the $9k package; the acknowledgement copy adapts automatically.
// The $5,000 historicalProject: 'none' + integrationMethod: 'manual-upload' combo matches the known-good test fixture. Nothing here hits Resend/DB until you click the final Build my pilot plan.
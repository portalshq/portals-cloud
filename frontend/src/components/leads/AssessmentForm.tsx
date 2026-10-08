'use client'

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
  type ChangeEvent,
} from 'react'
import { CTAButton } from '@/components/CTAButton'
import {
  LeadCheckbox,
  LeadSelectField,
  LeadTextareaField,
} from '@/components/mui/fields'
import {
  analyticsConsent,
  buildAttribution,
  retrieveFormParams,
  trackEvent,
} from '@/lib/leads/analytics-client'
import {
  newSubmissionId,
  publicEmailNeedsWebsite,
  submitLead,
} from '@/lib/leads/client'
import {
  DISCLOSURE_VERSION,
  assessmentAnswersSchema,
  type KnownLeadContext,
  type LeadResponse,
} from '@/lib/leads/contracts'
import {
  ASSESSMENT_VERSION,
  activeAssessmentAnswers,
  answerLabel,
  assessmentAnswersFromDraft,
  assessmentQuestions,
  assessmentStages,
  assessmentTextMaximum,
  assessmentValidationErrors,
  diagnosticFields,
  questionVisible,
  selected,
  visibleAssessmentStages,
  type AssessmentQuestion,
  type AssessmentValues,
} from '@/lib/leads/assessment-definition'
import {
  applyFallbackDefaults,
  normalizeUrlParams,
  parseUrlParams,
  type UrlParams,
} from '@/lib/leads/url-params'
import {
  ConsentFields,
  IdentityFields,
  LeadField,
  NoScriptLeadFallback,
} from './LeadFields'
import { useFormDraft } from './useFormDraft'
import { Progress } from '../ui/progress'

function validatedPrefill(values: AssessmentValues): AssessmentValues {
  return Object.fromEntries(
    Object.entries(values).flatMap(([id, value]) => {
      const field = diagnosticFields[id]
      if (!field) return []
      const parsed = field.safeParse(value)
      return parsed.success ? [[id, parsed.data]] : []
    }),
  )
}

const MemoIdentityFields = memo(IdentityFields)
const MemoConsentFields = memo(ConsentFields)

const questionsByStage = new Map<number, AssessmentQuestion[]>()
for (const q of assessmentQuestions) {
  const list = questionsByStage.get(q.stage)
  if (list) list.push(q)
  else questionsByStage.set(q.stage, [q])
}

function QuestionItem({
  q,
  visible,
  required,
  invalid,
  value,
  onChange,
}: {
  q: (typeof assessmentQuestions)[number]
  visible: boolean
  required: boolean
  invalid: boolean
  value: unknown
  onChange: (id: string, value: unknown) => void
}) {
  const helpId = `${q.id}-help`
  const selectedValues = useMemo(
    () =>
      q.kind === 'multi'
        ? selected({ [q.id]: value } as AssessmentValues, q.id)
        : [],
    [q.kind, q.id, value],
  )
  return (
    <div hidden={!visible} data-question={q.id} tabIndex={-1}>
      {q.kind === 'multi' ? (
        <fieldset
          aria-describedby={q.help ? helpId : undefined}
          aria-invalid={invalid || undefined}
          className="space-y-12"
        >
          <legend className="t-p-sm-sans">
            {q.label}
            {q.required ? ' *' : ''}
          </legend>
          {q.help ? (
            <p id={helpId} className="t-p-sm-sans text-white/80">
              {q.help}
            </p>
          ) : null}
          <div className="grid gap-10 sm:grid-cols-2">
            {q.options!.map((optionValue) => (
              <label
                key={optionValue}
                className="flex items-start gap-10 t-p-sm-sans"
              >
                <LeadCheckbox
                  name={`${q.id}:${optionValue}`}
                  checked={selectedValues.includes(optionValue)}
                  onChange={(event) => {
                    const current = selectedValues
                    onChange(
                      q.id,
                      event.target.checked
                        ? optionValue === q.exclusive
                          ? [optionValue]
                          : [
                            ...current.filter((v) => v !== q.exclusive),
                            optionValue,
                          ]
                        : current.filter((v) => v !== optionValue),
                    )
                  }}
                />
                <span>{answerLabel(q, optionValue)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <LeadField
          label={`${q.label}${q.required ? ' *' : ''}`}
          name={q.id}
        >
          {q.kind === 'select' ? (
            <LeadSelectField
              id={q.id}
              name={q.id}
              required={required}
              value={String(value || '')}
              onChange={(event) => onChange(q.id, event.target.value)}
              error={invalid}
            >
              <option value="">Select one</option>
              {q.options!.map((optionValue) => (
                <option key={optionValue} value={optionValue}>
                  {answerLabel(q, optionValue)}
                </option>
              ))}
            </LeadSelectField>
          ) : (
            <LeadTextareaField
              id={q.id}
              name={q.id}
              required={required}
              minRows={3}
              resizable={false}
              value={String(value || '')}
              onChange={(event) => onChange(q.id, event.target.value)}
              slotProps={{
                htmlInput: {
                  maxLength: assessmentTextMaximum(q.id),
                  'aria-invalid': invalid || undefined,
                  'aria-describedby': q.help ? helpId : undefined,
                },
              }}
            />
          )}
          {q.help ? (
            <span id={helpId} className="t-p-sm-sans text-white/80">
              {q.help}
            </span>
          ) : null}
        </LeadField>
      )}
    </div>
  )
}

const MemoQuestionItem = memo(QuestionItem)

export function AssessmentForm({
  context,
  preface,
}: {
  context: KnownLeadContext
  preface?: ReactNode
}) {
  const [answers, setAnswers] = useState<AssessmentValues>(() =>
    validatedPrefill(context.answerValues || {}),
  )
  const [stage, setStage] = useState(0)
  const [email, setEmail] = useState('')
  const [urlParams, setUrlParams] = useState<UrlParams>({})
  const [result, setResult] = useState<LeadResponse | null>(() =>
    context.diagnosticResult && context.assessmentCompleted
      ? {
        ok: true,
        nextAction:
          context.qualificationTier === 'low' ? 'use_case' : 'pilot_scope',
        qualificationTier: context.qualificationTier,
        diagnosticResult: context.diagnosticResult,
      }
      : null,
  )
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [error, setError] = useState('')
  const [invalidFields, setInvalidFields] = useState<string[]>([])
  const formRef = useRef<HTMLFormElement | null>(null)
  const hasNavigated = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const started = useRef(false)
  const startedAt = useRef(Date.now())
  const idempotencyKey = useRef(newSubmissionId('assessment'))
  const enteredBranches = useRef(new Set<string>())
  const {
    ref: draftRef,
    restored,
    flush,
    clear,
  } = useFormDraft('workflow_assessment')
  const registerForm = useCallback(
    (element: HTMLFormElement | null) => {
      formRef.current = element
      draftRef(element)
    },
    [draftRef],
  )
  const identityChanged = Boolean(
    urlParams.email &&
    context.identity?.email &&
    urlParams.email.toLowerCase() !== context.identity.email.toLowerCase(),
  )
  const identityContext: KnownLeadContext = useMemo(
    () =>
      identityChanged
        ? { known: false, knownFields: [], knownAnswerFields: [] }
        : {
          ...context,
          knownFields: context.knownFields.filter(
            (field) => !urlParams[field],
          ),
        },
    [identityChanged, context, urlParams],
  )
  const stages = useMemo(() => visibleAssessmentStages(answers), [answers])
  const currentStage = stages.includes(stage)
    ? stage
    : stages.find((v) => v > stage) || stages.at(-1) || 0
  const position = stages.indexOf(currentStage)
  const isLast = position === stages.length - 1
  const visibility = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const q of assessmentQuestions)
      map.set(q.id, questionVisible(q, answers))
    return map
  }, [answers])

  useEffect(() => {
    const params = applyFallbackDefaults(
      normalizeUrlParams({ ...retrieveFormParams(), ...parseUrlParams() }),
    )
    setUrlParams(params)
    if (params.email) setEmail(params.email)
    if (
      params.email &&
      context.identity?.email &&
      params.email.toLowerCase() !== context.identity.email.toLowerCase()
    ) {
      clear()
      setAnswers({})
      setResult(null)
    }
    void trackEvent('assessment_viewed', {
      assessment_version: ASSESSMENT_VERSION,
    })
  }, [])
  useEffect(() => {
    setAnswers((current) => ({
      ...current,
      ...validatedPrefill(assessmentAnswersFromDraft(restored)),
    }))
    if (restored.email) setEmail(restored.email)
  }, [restored])
  useEffect(() => {
    for (const key of ['name', 'company', 'role', 'website'] as const) {
      const value = urlParams[key]
      const control = formRef.current?.elements.namedItem(key)
      if (
        !value ||
        !(
          control instanceof HTMLInputElement ||
          control instanceof HTMLSelectElement
        )
      )
        continue
      if (
        control instanceof HTMLSelectElement &&
        ![...control.options].some((option) => option.value === value)
      )
        continue
      control.value = value
    }
    if (urlParams.email) setEmail(urlParams.email)
  }, [urlParams, restored])
  useEffect(() => {
    for (const q of assessmentQuestions.filter(
      (q) =>
        q.stage === currentStage && q.branch && questionVisible(q, answers),
    )) {
      if (enteredBranches.current.has(q.branch!)) continue
      enteredBranches.current.add(q.branch!)
      void trackEvent('assessment_branch_entered', {
        branch: q.branch,
        assessment_version: ASSESSMENT_VERSION,
      })
    }
  }, [currentStage, answers])

  useEffect(() => {
    if (hasNavigated.current) headingRef.current?.focus()
    hasNavigated.current = true
  }, [currentStage])

  const onStarted = useCallback(() => {
    if (started.current) return
    started.current = true
    startedAt.current = Date.now()
    void trackEvent('assessment_started', {
      assessment_version: ASSESSMENT_VERSION,
    })
  }, [])
  const change = useCallback(
    (id: string, value: unknown) => {
      onStarted()
      setAnswers((current) => ({ ...current, [id]: value }))
      setInvalidFields((current) => current.filter((field) => field !== id))
      setError('')
    },
    [onStarted],
  )
  const onEmailChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      setEmail(event.target.value),
    [],
  )
  function validateStage(index: number): boolean {
    const errors = assessmentValidationErrors(answers, index)
    setInvalidFields(errors.map((e) => e.field))
    if (errors.length) {
      setError(errors[0].message)
      formRef.current
        ?.querySelector<HTMLElement>(`[data-question="${errors[0].field}"]`)
        ?.focus()
      return false
    }
    const fieldset = formRef.current?.querySelector<HTMLFieldSetElement>(
      `[data-stage="${index}"]`,
    )
    const controls =
      fieldset?.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >('input,select,textarea') || []
    for (const control of controls)
      if (!control.checkValidity()) {
        control.reportValidity()
        return false
      }
    return true
  }
  function next() {
    onStarted()
    if (!validateStage(currentStage)) return
    flush()
    setError('')
    void trackEvent('assessment_stage_completed', {
      stage: currentStage + 1,
      assessment_version: ASSESSMENT_VERSION,
    })
    setStage(stages[position + 1])
  }
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onStarted()
    if (!isLast) {
      next()
      return
    }
    const errors = assessmentValidationErrors(answers)
    if (errors.length) {
      setStage(assessmentQuestions.find((q) => q.id === errors[0].field)!.stage)
      setError(errors[0].message)
      setInvalidFields(errors.map((e) => e.field))
      return
    }
    if (!validateStage(0)) {
      setStage(0)
      return
    }
    if (!validateStage(currentStage)) return
    setStatus('submitting')
    flush()
    const values = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    )
    try {
      const identity = {
        website: '',
        ...Object.fromEntries(
          ['name', 'email', 'company', 'role', 'website'].flatMap((key) => {
            const value =
              values[key] ||
              identityContext.identity?.[
              key as keyof typeof identityContext.identity
              ]
            return value ? [[key, String(value)]] : []
          }),
        ),
      }
      const response = await submitLead({
        submissionType: 'assessment',
        idempotencyKey: idempotencyKey.current,
        formVersion: ASSESSMENT_VERSION,
        provider: 'browser',
        identity,
        attribution: buildAttribution({
          sourcePage: '/assessment',
          ctaLabel: 'See my production recommendation',
          intent: 'workflow_assessment',
        }),
        consent: {
          disclosureVersion: DISCLOSURE_VERSION,
          marketing: values.marketingConsent === 'on',
          analytics: analyticsConsent() === 'accepted',
        },
        companyFax: String(values.companyFax || ''),
        whatBroughtYouHere: urlParams.what_brought_you,
        whatBroughtYouHereOther: urlParams.what_brought_you_other || '',
        howDidYouHearAboutPortals: urlParams.how_did_you_hear,
        answers: assessmentAnswersSchema.parse({
          ...activeAssessmentAnswers(answers),
          assessment_version: ASSESSMENT_VERSION,
          assessment_completion_seconds: Math.min(
            7_776_000,
            Math.max(0, Math.round((Date.now() - startedAt.current) / 1000)),
          ),
        }),
      })
      void trackEvent('assessment_stage_completed', {
        stage: currentStage + 1,
        assessment_version: ASSESSMENT_VERSION,
      })
      clear()
      setResult(response)
      setStatus('idle')
    } catch (cause) {
      setStatus('error')
      setError(
        cause instanceof Error
          ? cause.message
          : 'We could not complete the assessment. Please try again.',
      )
    }
  }

  if (result)
    return (
      <div role="status" className="space-y-24">
        <h2 className="t-h3-sans">
          {result.diagnosticResult?.title || 'Your production recommendation'}
        </h2>
        <p className="t-p-sans">{result.message}</p>
        <ul className="space-y-10 t-p-sans">
          {result.diagnosticResult?.explanations.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <div className="space-y-12 border-t border-white/20 pt-20">
          <h3 className="t-h3-sans">Recommended intervention</h3>
          <p className="t-p-sans">{result.diagnosticResult?.recommendation}</p>
        </div>
        <div className="flex flex-wrap gap-16">
          {result.nextAction === 'pilot_scope' ? (
            <>
              <CTAButton
                href="/pilot?from=assessment#scope"
                analyticsLabel="Configure production pilot"
              >
                {result.qualificationTier === 'high'
                  ? 'Configure production pilot'
                  : 'Continue pilot application'}
              </CTAButton>
              <CTAButton
                href="/pilot?from=assessment&mode=assisted#scope"
                appearance="plain"
                analyticsLabel="Request assisted review"
                onClick={() =>
                  void trackEvent('pilot_assisted_review_requested', {
                    assessment_version: ASSESSMENT_VERSION,
                  })
                }
              >
                Request assisted review
              </CTAButton>
            </>
          ) : (
            <>
              <CTAButton
                href="/use-cases"
                analyticsLabel="Explore production use cases"
              >
                Explore use cases
              </CTAButton>
              <CTAButton
                href="/production-memory"
                appearance="plain"
                analyticsLabel="Explore product materials"
              >
                Explore product materials
              </CTAButton>
            </>
          )}
          {result.downloadUrl ? (
            <CTAButton
              href={result.downloadUrl}
              appearance="plain"
              target="_blank"
              rel="noreferrer"
              analyticsLabel="Download my assessment"
            >
              Download my evaluation
            </CTAButton>
          ) : null}
        </div>
        {result.nextAction === 'pilot_scope' ? (
          <p className="t-p-sm-sans text-white/80">
            Your answers carry into the pilot application. You can review the
            scope, measurable outcomes, requirements, and terms before approving
            a pilot. A meeting is optional unless the requirements need
            clarification.
          </p>
        ) : null}
        <CTAButton
          type="button"
          appearance="plain"
          analyticsLabel="Reassess production"
          onClick={() => {
            setResult(null)
            setStage(0)
            idempotencyKey.current = newSubmissionId('assessment')
            started.current = false
          }}
        >
          Reassess this production
        </CTAButton>
      </div>
    )

  return (
    <>
      {preface}
      <form
        noValidate
        ref={registerForm}
        onSubmit={onSubmit}
        onInput={onStarted}
        className="space-y-24"
      >
        <p className="t-p-sm-sans" aria-live="polite">
          Step {position + 1} of {stages.length} —{' '}
          {assessmentStages[currentStage]}
        </p>
        <Progress
          aria-label="Assessment progress"
          value={(Number(position) / stages.length) * 100}
          max={stages.length}
          className="h-[2px] w-full"
        />
        <h2 ref={headingRef} tabIndex={-1} className="t-h3-sans">
          {assessmentStages[currentStage]}
        </h2>
        {assessmentStages.map((title, index) => (
          <fieldset
            key={title}
            data-stage={index}
            hidden={currentStage !== index}
            className="space-y-20"
          >
            <legend className="sr-only">{title}</legend>
            {index === 0 ? (
              <div className="grid gap-20 sm:grid-cols-2">
                <MemoIdentityFields
                  context={identityContext}
                  email={email}
                  onEmailChange={onEmailChange}
                  requireWebsite={publicEmailNeedsWebsite(email)}
                  onStarted={onStarted}
                  urlParams={urlParams}
                />
              </div>
            ) : null}
            {(questionsByStage.get(index) ?? []).map((q) => (
              <MemoQuestionItem
                key={q.id}
                q={q}
                visible={visibility.get(q.id) ?? true}
                required={Boolean(
                  q.required &&
                  visibility.get(q.id) &&
                  currentStage === index,
                )}
                invalid={invalidFields.includes(q.id)}
                value={answers[q.id]}
                onChange={change}
              />
            ))}
            {index === 7 ? (
              <>
                <MemoConsentFields
                  onStarted={onStarted}
                  showMarketing={!identityContext.known}
                />
                <NoScriptLeadFallback />
              </>
            ) : null}
          </fieldset>
        ))}
        {error ? (
          <p role="alert" className="t-p-sans">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-16">
          {position > 0 ? (
            <CTAButton
              type="button"
              appearance="plain"
              analyticsLabel="Previous assessment step"
              disabled={status === 'submitting'}
              onClick={() => {
                flush()
                setError('')
                setStage(stages[position - 1])
              }}
            >
              Back
            </CTAButton>
          ) : null}
          <CTAButton
            type="submit"
            analyticsLabel={
              isLast ? 'See production recommendation' : 'Next assessment step'
            }
            disabled={status === 'submitting'}
          >
            {status === 'submitting'
              ? 'Evaluating…'
              : isLast
                ? 'See my recommendation'
                : 'Continue'}
          </CTAButton>
        </div>
      </form>
    </>
  )
}

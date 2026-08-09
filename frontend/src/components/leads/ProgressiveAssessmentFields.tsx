'use client'

import {useEffect, useState} from 'react'
import type {KnownLeadContext} from '@/lib/leads/contracts'
import {LeadSelectField as SelectField} from '@/components/mui/fields'
import {LeadField} from './LeadFields'
import {ConditionalReveal} from './ConditionalReveal'

export function ProgressiveAssessmentFields({
  context,
  onStarted,
  draft,
}: {
  context: KnownLeadContext
  onStarted: () => void
  draft?: Record<string, string>
}) {
  const known = new Set(context.knownAnswerFields)
  const [recreationFrequency, setRecreationFrequency] = useState('')
  const incidentEligible =
    context.incidentFollowUpEligible ??
    (recreationFrequency ? recreationFrequency !== 'never' : false)
  const missing = (field: string) => !known.has(field)

  useEffect(() => {
    if (draft?.recreationFrequency) {
      setRecreationFrequency(draft.recreationFrequency)
    }
  }, [draft?.recreationFrequency])

  return (
    <div className="grid grid-cols-2 gap-20">
      {missing('teamType') ? (
        <LeadField label="team type *" name="teamType">
          <SelectField id="teamType" name="teamType" required defaultValue="" onChange={onStarted}>
            <option value="" disabled>select one</option>
            <option value="agency">agency</option>
            <option value="creative-studio">creative studio</option>
            <option value="production-company">production company</option>
            <option value="in-house-creative">in-house creative team</option>
            <option value="brand-marketing">brand or marketing team</option>
            <option value="film-animation">film or animation team</option>
            <option value="game-entertainment">game or entertainment team</option>
            <option value="independent-creator">independent creator</option>
            <option value="other">other</option>
          </SelectField>
        </LeadField>
      ) : null}
      {missing('teamSize') ? (
        <LeadField label="production-team size *" name="teamSize">
          <SelectField id="teamSize" name="teamSize" required defaultValue="" onChange={onStarted}>
            <option value="" disabled>select one</option>
            <option value="1">1</option>
            <option value="2-4">2-4</option>
            <option value="5-9">5-9</option>
            <option value="10-24">10-24</option>
            <option value="25-plus">25+</option>
          </SelectField>
        </LeadField>
      ) : null}
      {missing('workflowCollaborators') ? (
        <LeadField label="people involved in this workflow *" name="workflowCollaborators">
          <SelectField id="workflowCollaborators" name="workflowCollaborators" required defaultValue="" onChange={onStarted}>
            <option value="" disabled>select one</option>
            <option value="1">1</option>
            <option value="2-4">2-4</option>
            <option value="5-9">5-9</option>
            <option value="10-plus">10+</option>
          </SelectField>
        </LeadField>
      ) : null}
      {missing('toolsUsed') ? (
        <LeadField label="ai and creative tools used *" name="toolsUsed">
          <SelectField id="toolsUsed" name="toolsUsed" required defaultValue="" onChange={onStarted}>
            <option value="" disabled>select one</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3-4">3-4</option>
            <option value="5-plus">5+</option>
          </SelectField>
        </LeadField>
      ) : null}
      {missing('recurringWorkflow') ? (
        <LeadField label="how often does this workflow run? *" name="recurringWorkflow">
          <SelectField id="recurringWorkflow" name="recurringWorkflow" required defaultValue="" onChange={onStarted}>
            <option value="" disabled>select one</option>
            <option value="daily">daily</option>
            <option value="weekly">weekly</option>
            <option value="monthly">monthly</option>
            <option value="quarterly">quarterly</option>
            <option value="one-off">one-off</option>
          </SelectField>
        </LeadField>
      ) : null}
      {missing('assetVolume') ? (
        <LeadField label="monthly asset or variant volume *" name="assetVolume">
          <SelectField id="assetVolume" name="assetVolume" required defaultValue="" onChange={onStarted}>
            <option value="" disabled>select one</option>
            <option value="under-25">under 25</option>
            <option value="25-99">25-99</option>
            <option value="100-499">100-499</option>
            <option value="500-plus">500+</option>
          </SelectField>
        </LeadField>
      ) : null}
      {missing('approvedVersionMethod') ? (
        <LeadField label="current approved-version method *" name="approvedVersionMethod">
          <SelectField id="approvedVersionMethod" name="approvedVersionMethod" required defaultValue="" onChange={onStarted}>
            <option value="" disabled>select one</option>
            <option value="canonical-system">canonical system</option>
            <option value="documented-review">documented review process</option>
            <option value="folder-naming">folders or file naming</option>
            <option value="chat-spreadsheet">chat or spreadsheet</option>
            <option value="creator-memory">creator memory</option>
            <option value="inconsistent">inconsistent</option>
          </SelectField>
        </LeadField>
      ) : null}
      {missing('productionContextMethod') ? (
        <LeadField label="where generation context is stored *" name="productionContextMethod">
          <SelectField id="productionContextMethod" name="productionContextMethod" required defaultValue="" onChange={onStarted}>
            <option value="" disabled>select one</option>
            <option value="attached-record">attached to the production record</option>
            <option value="project-document">project documentation</option>
            <option value="multiple-tools">multiple tools</option>
            <option value="chat-personal-notes">chat or personal notes</option>
            <option value="memory-inconsistent">memory or inconsistent</option>
          </SelectField>
        </LeadField>
      ) : null}
      {missing('recreationFrequency') ? (
        <LeadField label="frequency of rediscovery or recreation *" name="recreationFrequency">
          <SelectField
            id="recreationFrequency"
            name="recreationFrequency"
            required
            defaultValue=""
            onChange={(event) => {
              onStarted()
              setRecreationFrequency(String(event.target.value))
            }}
          >
            <option value="" disabled>select one</option>
            <option value="never">never</option>
            <option value="quarterly">quarterly</option>
            <option value="monthly">monthly</option>
            <option value="weekly">weekly</option>
            <option value="daily">daily</option>
          </SelectField>
        </LeadField>
      ) : null}
      <ConditionalReveal active={incidentEligible} className="sm:col-span-2">
        <div className="grid gap-20 sm:grid-cols-2">
          {missing('incidentType') ? (
            <LeadField label="most recent incident *" name="incidentType">
              <SelectField id="incidentType" name="incidentType" required={incidentEligible} defaultValue="" onChange={onStarted}>
                <option value="" disabled>select one</option>
                <option value="version-confusion">version confusion</option>
                <option value="missing-context">missing production context</option>
                <option value="failed-reproduction">failed reproduction</option>
                <option value="recreated-work">work had to be recreated</option>
                <option value="other">other</option>
              </SelectField>
            </LeadField>
          ) : null}
          {missing('peopleAffected') ? (
            <LeadField label="people affected *" name="peopleAffected">
              <SelectField id="peopleAffected" name="peopleAffected" required={incidentEligible} defaultValue="" onChange={onStarted}>
                <option value="" disabled>select one</option>
                <option value="1">1</option>
                <option value="2-4">2-4</option>
                <option value="5-9">5-9</option>
                <option value="10-24">10-24</option>
                <option value="25-plus">25+</option>
              </SelectField>
            </LeadField>
          ) : null}
          {missing('hoursLost') ? (
            <LeadField label="total working time lost *" name="hoursLost">
              <SelectField id="hoursLost" name="hoursLost" required={incidentEligible} defaultValue="" onChange={onStarted}>
                <option value="" disabled>select one</option>
                <option value="under-1-hour">under one hour</option>
                <option value="1-4-hours">1-4 hours</option>
                <option value="one-day">one working day</option>
                <option value="2-5-days">2-5 working days</option>
                <option value="week-plus">one week or more</option>
              </SelectField>
            </LeadField>
          ) : null}
          {missing('deliveryImpact') ? (
            <LeadField label="delivery or client impact *" name="deliveryImpact">
              <SelectField id="deliveryImpact" name="deliveryImpact" required={incidentEligible} defaultValue="" onChange={onStarted}>
                <option value="" disabled>select one</option>
                <option value="none">none</option>
                <option value="internal-delay">internal delay</option>
                <option value="delivery-delayed">delivery delayed</option>
                <option value="client-affected">client affected</option>
                <option value="revenue-relationship">revenue or relationship affected</option>
              </SelectField>
            </LeadField>
          ) : null}
          {missing('annualAffectedValue') ? (
            <LeadField label="annual value of affected work, optional" name="annualAffectedValue">
              <SelectField id="annualAffectedValue" name="annualAffectedValue" defaultValue="" onChange={onStarted}>
                <option value="">prefer not to say</option>
                <option value="under-100k">under $100k</option>
                <option value="100k-500k">$100k-$500k</option>
                <option value="500k-1m">$500k-$1m</option>
                <option value="1m-plus">$1m+</option>
              </SelectField>
            </LeadField>
          ) : null}
        </div>
      </ConditionalReveal>
    </div>
  )
}
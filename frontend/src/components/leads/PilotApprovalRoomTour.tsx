'use client'

import { useState } from 'react'
import { Info, X } from 'lucide-react'

type TourStep = {
  target: string
  title: string
  description: string
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '#scope',
    title: 'Scope',
    description: 'Review the operational shape of the pilot: workflow, people, integrations, data, participants, and target start date. Edit any field by clicking on it.',
  },
  {
    target: '#commercial',
    title: 'Commercial Terms',
    description: 'Review the pilot fee, term duration, annual option, and value estimate. These terms are server-controlled and cannot be edited.',
  },
  {
    target: '#success-criteria',
    title: 'Success Criteria',
    description: 'Define how this pilot will be judged. Accept each criterion as written, modify it for this pilot, or mark it as not applicable.',
  },
  {
    target: '#security',
    title: 'Security Posture',
    description: 'Review Portals\' current security posture. If your organization has additional requirements, submit them for review using the "Request a change" button.',
  },
  {
    target: '#reviewers',
    title: 'Reviewers',
    description: 'Confirm who needs access to this room. Invite reviewers by email. One person can hold multiple roles. Reviewers must confirm the terms before the pilot can be signed.',
  },
  {
    target: '#your-review',
    title: 'Your Review',
    description: 'As an assigned reviewer, review the current terms revision. Confirm the terms or request specific changes with notes.',
  },
  {
    target: '#signature',
    title: 'Sign and Fund',
    description: 'After scope is confirmed and all reviewers have approved, the authorized signer accepts the agreement. Payment is due on signature, not during scope confirmation.',
  },
]

export function PilotApprovalRoomTour() {
  const [currentStep, setCurrentStep] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const step = TOUR_STEPS[currentStep]
  const isLastStep = currentStep === TOUR_STEPS.length - 1

  const handleNext = () => {
    if (isLastStep) {
      setIsOpen(false)
      setDismissed(true)
    } else {
      setCurrentStep((prev) => prev + 1)
      // Scroll to target
      const target = document.querySelector(step.target)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }

  const handlePrevious = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1))
  }

  const handleDismiss = () => {
    setIsOpen(false)
    setDismissed(true)
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-8 rounded-full bg-white/10 border border-white/80 px-16 py-8 text-white hover:bg-white/20 transition-colors lg:fixed lg:bottom-24 lg:right-24 lg:z-50"
        aria-label="Start guided tour"
      >
        <Info size={16} strokeWidth={1.8} />
        <span className="t-p-sm-sans">Show tour</span>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-24">
      <div className="max-w-md w-full bg-[#07112C] border border-white/80 rounded-lg p-24">
        <div className="flex items-start justify-between mb-16">
          <div>
            <h3 className="t-h3-sans mb-4">{step.title}</h3>
            <p className="t-p-sm-sans text-white/80">{step.description}</p>
          </div>
          <button
            onClick={handleDismiss}
            className="text-white/60 hover:text-white transition-colors"
            aria-label="Close tour"
          >
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>
        <div className="flex items-center justify-between mt-16">
          <div className="flex gap-8">
            {TOUR_STEPS.map((_, index) => (
              <div
                key={index}
                className={`h-2 w-2 rounded-full transition-colors ${
                  index === currentStep ? 'bg-white' : 'bg-white/20'
                }`}
                aria-label={`Step ${index + 1} of ${TOUR_STEPS.length}`}
              />
            ))}
          </div>
          <div className="flex gap-8">
            {currentStep > 0 && (
              <button
                onClick={handlePrevious}
                className="t-p-sm-sans text-white/60 hover:text-white transition-colors"
              >
                Previous
              </button>
            )}
            <button
              onClick={handleNext}
              className="t-p-sm-sans text-white hover:text-white/80 transition-colors"
            >
              {isLastStep ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

"use client"
import { useState } from "react"
import { CTAButton } from "../CTAButton"

export default function Faq({faqs}: {faqs: {question: string, answer: string}[]}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
        <div className="col-span-full flex flex-col w-full space-y-36">
          <div className="space-y-16 max-w-3xl lg:w-3xl">
            {faqs.map((faq, index) => (
              <div
                key={faq.question}
                className="rounded-sm border border-white/70"
              >
                <CTAButton
                  appearance="plain"
                  type="button"
                  data-faq-question={faq.question}
                  onClick={() =>
                    setOpenIndex(openIndex === index ? null : index)
                  }
                  className="flex w-full items-center justify-between !p-24 h-auto text-left text-white focus:outline-none [&>span]:w-full [&>span]:justify-between"
                  aria-expanded={openIndex === index}
                >
                  <span className="t-p-serif">{faq.question}</span>
                  <span
                    aria-hidden="true"
                    className={`transform transition-transform duration-300 ${openIndex === index ? 'rotate-45' : ''}`}
                  >
                    +
                  </span>
                </CTAButton>
                {openIndex === index ? (
                  <div className="px-24 pb-24 t-p-sans text-white">
                    {faq.answer}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
  )
}
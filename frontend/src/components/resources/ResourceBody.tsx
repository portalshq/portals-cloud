import {PortableText, type PortableTextComponents} from '@portabletext/react'
import Link from 'next/link'
import type {PortableTextBlock} from '@/types/resource'
import {resolvePackageSpecValue} from '@/lib/package-specifications'

const components: PortableTextComponents = {
  block: {
    normal: ({children}) => (
      <p className="text-base leading-[1.6] text-white/72">{children}</p>
    ),
    h2: ({children}) => (
      <h3 className="mt-12 text-2xl font-medium tracking-tight text-white">
        {children}
      </h3>
    ),
    h3: ({children}) => (
      <h4 className="mt-9 text-xl font-medium tracking-tight text-white">
        {children}
      </h4>
    ),
    blockquote: ({children}) => (
      <blockquote className="my-8 border-l border-white/30 pl-6 text-xl leading-[1.5] text-white/88">
        {children}
      </blockquote>
    ),
  },

  list: {
    bullet: ({children}) => (
      <ul className="my-6 list-disc space-y-2 pl-6 text-white/72">
        {children}
      </ul>
    ),
    number: ({children}) => (
      <ol className="my-6 list-decimal space-y-2 pl-6 text-white/72">
        {children}
      </ol>
    ),
  },

  listItem: {
    bullet: ({children}) => <li className="pl-2 leading-[1.55]">{children}</li>,
    number: ({children}) => <li className="pl-2 leading-[1.55]">{children}</li>,
  },

  marks: {
    strong: ({children}) => (
      <strong className="font-medium text-white">{children}</strong>
    ),
    em: ({children}) => <em>{children}</em>,
    code: ({children}) => (
      <code className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-sm text-white">
        {children}
      </code>
    ),
    link: ({children, value}) => (
      <a
        href={value?.href}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-white/35 underline-offset-4"
      >
        {children}
      </a>
    ),
    internalLink: ({children, value}) => (
      <Link
        href={`/${value?.slug ?? ''}`}
        className="underline decoration-white/35 underline-offset-4"
      >
        {children}
      </Link>
    ),
    packageSpecValue: ({children, value}) => {
      const resolved = resolvePackageSpecValue(
        value?.packageSpecification,
        value?.valuePath,
      )

      return (
        <span className="font-medium text-white">
          {resolved || children}
        </span>
      )
    },
  },

  types: {
    calloutBlock: ({value}) => (
      <aside className="my-8 border border-white/15 bg-white/[0.04] p-6">
        {value.title ? (
          <p className="mb-2 text-sm font-medium uppercase tracking-[0.15em] text-white/55">
            {value.title}
          </p>
        ) : null}
        <p className="leading-[1.55] text-white/82">{value.text}</p>
      </aside>
    ),

    formulaBlock: ({value}) => (
      <figure className="my-8 border-y border-white/15 py-6">
        {value.label ? (
          <figcaption className="mb-3 text-sm uppercase tracking-[0.15em] text-white/50">
            {value.label}
          </figcaption>
        ) : null}
        <pre className="whitespace-pre-wrap font-mono text-base leading-[1.55] text-white">
          {value.expression}
        </pre>
        {value.note ? (
          <p className="mt-3 text-sm leading-[1.5] text-white/55">{value.note}</p>
        ) : null}
      </figure>
    ),

    checklistBlock: ({value}) => (
      <section className="my-8">
        {value.title ? (
          <h3 className="mb-4 text-lg font-medium text-white">
            {value.title}
          </h3>
        ) : null}
        <ul className="space-y-3">
          {value.items?.map(
            (
              item: {_key?: string; text: string; checked?: boolean},
              index: number,
            ) => (
              <li
                key={item._key ?? `${item.text}-${index}`}
                className="flex gap-3 text-white/72"
              >
                <span aria-hidden="true">
                  {item.checked ? '■' : '□'}
                </span>
                <span>{item.text}</span>
              </li>
            ),
          )}
        </ul>
      </section>
    ),

    quoteBlock: ({value}) => (
      <figure className="my-12">
        <blockquote className="text-2xl leading-[1.35] tracking-tight text-white">
          &ldquo;{value.quote}&rdquo;
        </blockquote>
        {value.attribution ? (
          <figcaption className="mt-4 text-sm text-white/50">
            {value.attribution}
          </figcaption>
        ) : null}
      </figure>
    ),

    metricGridBlock: ({value}) => (
      <section className="my-8">
        {value.title ? (
          <h3 className="mb-5 text-lg font-medium text-white">
            {value.title}
          </h3>
        ) : null}
        <div className="grid gap-px overflow-hidden border border-white/12 bg-white/12 sm:grid-cols-2">
          {value.items?.map(
            (
              item: {
                _key?: string
                value: string
                label: string
                note?: string
              },
              index: number,
            ) => (
              <div
                key={item._key ?? `${item.label}-${index}`}
                className="bg-black p-5"
              >
                <p className="text-2xl text-white">{item.value}</p>
                <p className="mt-1 text-sm text-white/70">{item.label}</p>
                {item.note ? (
                  <p className="mt-3 text-sm leading-[1.5] text-white/45">
                    {item.note}
                  </p>
                ) : null}
              </div>
            ),
          )}
        </div>
      </section>
    ),

    packageSpecReferenceBlock: ({value}) => {
      const resolved = resolvePackageSpecValue(
        value.packageSpecification,
        value.valuePath,
      )

      return (
        <aside className="my-8 border border-white/15 bg-white/[0.04] p-5">
          {value.title ? (
            <h3 className="mb-3 text-lg font-medium text-white">
              {value.title}
            </h3>
          ) : null}
          <dl>
            <dt className="text-sm uppercase text-white/50">
              {value.label || value.packageSpecification?.name}
            </dt>
            <dd className="mt-2 text-2xl text-white">
              {resolved || value.packageSpecification?.name}
            </dd>
          </dl>
          {value.note ? (
            <p className="mt-3 text-sm leading-[1.5] text-white/55">
              {value.note}
            </p>
          ) : null}
        </aside>
      )
    },

    dataTableBlock: ({value}) => (
      <figure className="my-8">
        {value.title ? (
          <h3 className="mb-4 text-lg font-medium text-white">
            {value.title}
          </h3>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <tbody>
              {value.rows?.map(
                (
                  row: {_key?: string; cells: string[]},
                  rowIndex: number,
                ) => (
                  <tr
                    key={row._key ?? rowIndex}
                    className="border-b border-white/12"
                  >
                    {row.cells.map((cell, cellIndex) => {
                      const Cell =
                        value.hasHeader && rowIndex === 0 ? 'th' : 'td'
                      return (
                        <Cell
                          key={`${rowIndex}-${cellIndex}`}
                          className="px-3 py-3 text-white/72 first:pl-0"
                        >
                          {cell}
                        </Cell>
                      )
                    })}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        {value.caption ? (
          <figcaption className="mt-3 text-sm text-white/45">
            {value.caption}
          </figcaption>
        ) : null}
      </figure>
    ),

    figureBlock: ({value}) => (
      <figure className="my-10">
        <img
          src={value.imageUrl}
          alt={value.alt}
          className="h-auto w-full"
        />
        {value.caption ? (
          <figcaption className="mt-3 text-sm leading-[1.5] text-white/45">
            {value.caption}
          </figcaption>
        ) : null}
      </figure>
    ),

    dividerBlock: ({value}) =>
      value.style === 'space' ? (
        <div className="h-12" aria-hidden="true" />
      ) : (
        <hr className="my-12 border-white/15" />
      ),
  },
}

export function ResourceBody({value}: {value: PortableTextBlock[]}) {
  return (
    <div className="space-y-5">
      <PortableText value={value} components={components} />
    </div>
  )
}

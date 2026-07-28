import React from 'react'
import {renderToBuffer} from '@react-pdf/renderer'
import {ResourcePdfDocument} from '@/components/pdf/ResourcePdfDocument'
import {getPublishedResourceForPdf} from '@/sanity/lib/resources'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{
    slug: string
  }>
}

function safeAsciiFileName(value: string): string {
  const sanitized = value
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return `${sanitized || 'document'}.pdf`
}

function defaultFileName(slug: string): string {
  return safeAsciiFileName(slug)
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const {slug} = await context.params
  const document = await getPublishedResourceForPdf(slug)

  if (!document || document.pdf?.enabled === false) {
    return Response.json(
      {error: 'PDF resource not found.'},
      {status: 404},
    )
  }

  try {
    const buffer = await renderToBuffer(
      React.createElement(ResourcePdfDocument, {document}) as never,
    )

    const requestedFileName =
      document.pdf?.fileName || defaultFileName(document.slug)
    const asciiFileName = safeAsciiFileName(requestedFileName)

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(buffer.byteLength),
        'Content-Disposition': [
          `attachment; filename="${asciiFileName}"`,
          `filename*=UTF-8''${encodeURIComponent(requestedFileName)}`,
        ].join('; '),
        'Cache-Control':
          'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (error) {
    console.error('Failed to generate PDF:', error)
    return Response.json(
      {error: 'The PDF could not be generated.'},
      {status: 500},
    )
  }
}

import React, {type ReactNode} from 'react'
import {
  Document,
  Font,
  Image,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'
import type {
  DocumentSection,
  MarkDefinition,
  PortableSpan,
  PortableTextBlock,
  ResourceDocument,
} from '@/types/resource'
import {resolvePackageSpecValue} from '@/lib/package-specifications'

const HEADING_SIZE = 22
const NORMAL_SIZE = 10.5
const FONT_ROOT = new URL('../../../public/fonts/', import.meta.url)

Font.register({
  family: 'DieGroteskC',
  fonts: [
    {
      src: new URL(
        'pdf/DieGroteskC-Light.ttf',
        FONT_ROOT,
      ).pathname,
      fontWeight: 300,
    },
    {
      src: new URL(
        'pdf/DieGroteskC-Regular.ttf',
        FONT_ROOT,
      ).pathname,
      fontWeight: 400,
    },
  ],
})

Font.register({
  family: 'DieGroteskB',
  fonts: [
    {
      src: new URL(
        'pdf/DieGroteskB-Regular.ttf',
        FONT_ROOT,
      ).pathname,
      fontWeight: 400,
    },
    {
      src: new URL(
        'pdf/DieGroteskB-Medium.ttf',
        FONT_ROOT,
      ).pathname,
      fontWeight: 500,
    },
  ],
})

const styles = StyleSheet.create({
  page: {
    paddingTop: 62,
    paddingRight: 54,
    paddingBottom: 64,
    paddingLeft: 54,
    fontFamily: 'DieGroteskB',
    fontSize: NORMAL_SIZE,
    lineHeight: 1.2,
    letterSpacing: 0,
    color: '#171717',
  },
  cover: {
    paddingTop: 72,
    paddingRight: 60,
    paddingBottom: 64,
    paddingLeft: 60,
    fontFamily: 'DieGroteskB',
    fontSize: NORMAL_SIZE,
    lineHeight: 1.2,
    letterSpacing: 0,
    color: '#111111',
  },
  heroCover: {
    position: 'relative',
    padding: 0,
    fontFamily: 'DieGroteskB',
    fontSize: NORMAL_SIZE,
    color: '#FFFFFF',
  },
  heroBackground: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  coverRule: {
    width: 46,
    height: 3,
    marginBottom: 54,
  },
  coverTitle: {
    maxWidth: 470,
    fontFamily: 'DieGroteskC',
    fontSize: HEADING_SIZE,
    lineHeight: 1.04,
    fontWeight: 300,
    letterSpacing: 0,
  },
  coverSubtitle: {
    maxWidth: 450,
    marginTop: 24,
    fontFamily: 'DieGroteskC',
    fontSize: HEADING_SIZE,
    lineHeight: 1.04,
    fontWeight: 300,
    color: '#444444',
  },
  coverAbstract: {
    maxWidth: 430,
    marginTop: 28,
    fontSize: NORMAL_SIZE,
    lineHeight: 1.2,
    color: '#555555',
  },
  coverMeta: {
    marginTop: 'auto',
    paddingTop: 36,
    borderTopWidth: 0.75,
    borderTopColor: '#D0D0D0',
    fontSize: NORMAL_SIZE,
    color: '#666666',
  },
  header: {
    position: 'absolute',
    top: 24,
    left: 54,
    right: 54,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
    fontSize: NORMAL_SIZE,
    color: '#777777',
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 54,
    right: 54,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    fontSize: NORMAL_SIZE,
    color: '#777777',
  },
  toc: {
    marginBottom: 40,
  },
  tocTitle: {
    marginBottom: 18,
    fontFamily: 'DieGroteskC',
    fontSize: HEADING_SIZE,
    fontWeight: 300,
    lineHeight: 1.04,
  },
  tocItem: {
    paddingTop: 7,
    paddingBottom: 7,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E3E3E3',
    fontSize: NORMAL_SIZE,
    color: '#333333',
    textDecoration: 'none',
  },
  section: {
    marginBottom: 30,
  },
  sectionEyebrow: {
    marginBottom: 6,
    fontSize: NORMAL_SIZE,
    letterSpacing: 0,
    textTransform: 'uppercase',
    color: '#777777',
  },
  sectionTitle: {
    marginBottom: 12,
    fontFamily: 'DieGroteskC',
    fontSize: HEADING_SIZE,
    lineHeight: 1.04,
    fontWeight: 300,
  },
  sectionSummary: {
    marginBottom: 16,
    fontSize: NORMAL_SIZE,
    lineHeight: 1.2,
    color: '#555555',
  },
  paragraph: {
    marginBottom: 8,
  },
  heading2: {
    marginTop: 19,
    marginBottom: 8,
    fontFamily: 'DieGroteskC',
    fontSize: HEADING_SIZE,
    lineHeight: 1.04,
    fontWeight: 300,
  },
  heading3: {
    marginTop: 15,
    marginBottom: 7,
    fontFamily: 'DieGroteskC',
    fontSize: HEADING_SIZE,
    lineHeight: 1.04,
    fontWeight: 300,
  },
  blockquote: {
    marginTop: 10,
    marginBottom: 12,
    paddingLeft: 14,
    borderLeftWidth: 2,
    borderLeftColor: '#999999',
    fontSize: NORMAL_SIZE,
    lineHeight: 1.2,
    color: '#444444',
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  listMarker: {
    width: 18,
    color: '#555555',
  },
  listContent: {
    flex: 1,
  },
  bold: {
    fontWeight: 500,
  },
  emphasis: {
    fontWeight: 500,
  },
  code: {
    fontFamily: 'DieGroteskB',
    fontSize: NORMAL_SIZE,
    backgroundColor: '#F0F0F0',
  },
  link: {
    color: '#333333',
    textDecoration: 'underline',
  },
  callout: {
    marginTop: 12,
    marginBottom: 14,
    padding: 13,
    borderWidth: 0.75,
    borderColor: '#CFCFCF',
    borderRadius: 3,
    backgroundColor: '#F7F7F7',
  },
  calloutTitle: {
    marginBottom: 5,
    fontSize: NORMAL_SIZE,
    fontWeight: 500,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  formula: {
    marginTop: 12,
    marginBottom: 14,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 0.75,
    borderBottomWidth: 0.75,
    borderColor: '#CCCCCC',
  },
  formulaLabel: {
    marginBottom: 7,
    fontSize: NORMAL_SIZE,
    textTransform: 'uppercase',
    color: '#666666',
  },
  formulaText: {
    fontFamily: 'DieGroteskB',
    fontSize: NORMAL_SIZE,
  },
  note: {
    marginTop: 6,
    fontSize: NORMAL_SIZE,
    color: '#666666',
  },
  checklistTitle: {
    marginBottom: 8,
    fontSize: NORMAL_SIZE,
    fontWeight: 500,
  },
  checklistItem: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  checkbox: {
    width: 18,
  },
  quote: {
    marginTop: 18,
    marginBottom: 18,
    fontFamily: 'DieGroteskC',
    fontSize: HEADING_SIZE,
    lineHeight: 1.04,
    fontWeight: 300,
  },
  attribution: {
    marginTop: 8,
    fontSize: NORMAL_SIZE,
    color: '#666666',
  },
  metric: {
    marginTop: 8,
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#DDDDDD',
  },
  metricValue: {
    fontFamily: 'DieGroteskC',
    fontSize: HEADING_SIZE,
    fontWeight: 300,
    lineHeight: 1.04,
  },
  metricLabel: {
    marginTop: 2,
    fontSize: NORMAL_SIZE,
  },
  metricNote: {
    marginTop: 3,
    fontSize: NORMAL_SIZE,
    color: '#666666',
  },
  packageReference: {
    marginTop: 12,
    marginBottom: 14,
    padding: 12,
    borderWidth: 0.75,
    borderColor: '#CFCFCF',
    backgroundColor: '#F7F7F7',
  },
  table: {
    marginTop: 12,
    marginBottom: 14,
    borderTopWidth: 0.75,
    borderLeftWidth: 0.75,
    borderColor: '#CCCCCC',
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableCell: {
    flex: 1,
    minHeight: 28,
    padding: 6,
    borderRightWidth: 0.75,
    borderBottomWidth: 0.75,
    borderColor: '#CCCCCC',
    fontSize: NORMAL_SIZE,
  },
  tableHeaderCell: {
    backgroundColor: '#EFEFEF',
    fontWeight: 500,
  },
  caption: {
    marginTop: 6,
    fontSize: NORMAL_SIZE,
    color: '#777777',
  },
  image: {
    width: '100%',
    maxHeight: 430,
    objectFit: 'contain',
    marginTop: 12,
  },
  divider: {
    marginTop: 18,
    marginBottom: 18,
    borderTopWidth: 0.75,
    borderTopColor: '#CCCCCC',
  },
  legalNote: {
    marginTop: 26,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#DDDDDD',
    fontSize: NORMAL_SIZE,
    lineHeight: 1.5,
    color: '#777777',
  },
})

function validHexColor(value?: string): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#111111'
}

function renderSpan(
  span: PortableSpan,
  markDefs: MarkDefinition[],
  index: number,
): ReactNode {
  const marks = span.marks ?? []
  const textStyles = []

  if (marks.includes('strong')) textStyles.push(styles.bold)
  if (marks.includes('em')) textStyles.push(styles.emphasis)
  if (marks.includes('code')) textStyles.push(styles.code)

  const annotation = markDefs.find((definition) =>
    marks.includes(definition._key),
  )

  const href =
    annotation?._type === 'link'
      ? annotation.href
      : annotation?._type === 'internalLink' && annotation.slug
        ? `/${annotation.slug}`
        : undefined

  if (href) {
    return (
      <Link
        key={span._key ?? index}
        src={href}
        style={[styles.link, ...textStyles]}
      >
        {span.text}
      </Link>
    )
  }

  if (annotation?._type === 'packageSpecValue') {
    const resolved = resolvePackageSpecValue(
      annotation.packageSpecification,
      annotation.valuePath,
    )

    return (
      <Text
        key={span._key ?? index}
        style={[styles.bold, ...textStyles]}
      >
        {resolved || span.text}
      </Text>
    )
  }

  return (
    <Text
      key={span._key ?? index}
      style={textStyles.length ? textStyles : undefined}
    >
      {span.text}
    </Text>
  )
}

function renderTextBlock(
  block: PortableTextBlock,
  orderedIndex: number,
): ReactNode {
  const children = block.children ?? []
  const markDefs = block.markDefs ?? []

  const content = children.map((span, index) =>
    renderSpan(span, markDefs, index),
  )

  if (block.listItem) {
    const level = Math.max(block.level ?? 1, 1)
    const marker =
      block.listItem === 'number' ? `${orderedIndex}.` : '\u2022'

    return (
      <View
        key={block._key}
        style={[
          styles.listItem,
          {
            marginLeft: (level - 1) * 14,
          },
        ]}
      >
        <Text style={styles.listMarker}>{marker}</Text>
        <Text style={styles.listContent}>{content}</Text>
      </View>
    )
  }

  if (block.style === 'h2') {
    return (
      <Text key={block._key} style={styles.heading2} minPresenceAhead={28}>
        {content}
      </Text>
    )
  }

  if (block.style === 'h3') {
    return (
      <Text key={block._key} style={styles.heading3} minPresenceAhead={24}>
        {content}
      </Text>
    )
  }

  if (block.style === 'blockquote') {
    return (
      <Text key={block._key} style={styles.blockquote}>
        {content}
      </Text>
    )
  }

  return (
    <Text key={block._key} style={styles.paragraph}>
      {content}
    </Text>
  )
}

function PdfPortableText({value}: {value: PortableTextBlock[]}) {
  let orderedIndex = 0

  return (
    <>
      {value.map((block) => {
        if (block._type === 'block') {
          if (block.listItem === 'number') {
            orderedIndex += 1
          } else if (!block.listItem) {
            orderedIndex = 0
          }
          return renderTextBlock(block, orderedIndex)
        }

        orderedIndex = 0

        switch (block._type) {
          case 'calloutBlock':
            return (
              <View key={block._key} style={styles.callout} wrap={false}>
                {block.title ? (
                  <Text style={styles.calloutTitle}>{block.title}</Text>
                ) : null}
                {block.body?.length ? (
                  <PdfPortableText value={block.body} />
                ) : (
                  <Text>{block.text}</Text>
                )}
              </View>
            )

          case 'formulaBlock':
            return (
              <View key={block._key} style={styles.formula} wrap={false}>
                {block.label ? (
                  <Text style={styles.formulaLabel}>{block.label}</Text>
                ) : null}
                <Text style={styles.formulaText}>{block.expression}</Text>
                {block.note ? (
                  <Text style={styles.note}>{block.note}</Text>
                ) : null}
              </View>
            )

          case 'checklistBlock':
            return (
              <View key={block._key} style={{marginBottom: 14}}>
                {block.title ? (
                  <Text style={styles.checklistTitle}>{block.title}</Text>
                ) : null}
                {block.items?.map((item, index) => (
                  <View
                    key={item._key ?? index}
                    style={styles.checklistItem}
                  >
                    <Text style={styles.checkbox}>
                      {item.checked ? '\u25A0' : '\u25A1'}
                    </Text>
                    <Text style={{flex: 1}}>{item.text}</Text>
                  </View>
                ))}
              </View>
            )

          case 'quoteBlock':
            return (
              <View key={block._key} style={styles.quote}>
                <Text>&ldquo;{block.quote}&rdquo;</Text>
                {block.attribution ? (
                  <Text style={styles.attribution}>
                    {block.attribution}
                  </Text>
                ) : null}
              </View>
            )

          case 'metricGridBlock':
            return (
              <View key={block._key} style={{marginBottom: 14}}>
                {block.title ? (
                  <Text style={styles.checklistTitle}>{block.title}</Text>
                ) : null}
                {block.items?.map((item, index) => (
                  <View key={item._key ?? index} style={styles.metric}>
                    <Text style={styles.metricValue}>{item.value}</Text>
                    <Text style={styles.metricLabel}>{item.label}</Text>
                    {item.note ? (
                      <Text style={styles.metricNote}>{item.note}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )

          case 'packageSpecReferenceBlock': {
            const resolved = resolvePackageSpecValue(
              block.packageSpecification,
              block.valuePath,
            )

            return (
              <View key={block._key} style={styles.packageReference} wrap={false}>
                {block.title ? (
                  <Text style={styles.checklistTitle}>{block.title}</Text>
                ) : null}
                <Text style={styles.metricLabel}>
                  {block.label || block.packageSpecification?.name}
                </Text>
                <Text style={styles.metricValue}>
                  {resolved || block.packageSpecification?.name}
                </Text>
                {block.note ? (
                  <Text style={styles.metricNote}>{block.note}</Text>
                ) : null}
              </View>
            )
          }

          case 'dataTableBlock':
            return (
              <View key={block._key} style={{marginBottom: 14}} wrap={false}>
                {block.title ? (
                  <Text style={styles.checklistTitle}>{block.title}</Text>
                ) : null}
                <View style={styles.table}>
                  {block.rows?.map((row, rowIndex) => (
                    <View
                      key={row._key ?? rowIndex}
                      style={styles.tableRow}
                      wrap={false}
                    >
                      {row.cells.map((cell, cellIndex) => (
                        <Text
                          key={`${rowIndex}-${cellIndex}`}
                          style={[
                            styles.tableCell,
                            block.hasHeader && rowIndex === 0
                              ? styles.tableHeaderCell
                              : {},
                          ]}
                        >
                          {cell}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
                {block.caption ? (
                  <Text style={styles.caption}>{block.caption}</Text>
                ) : null}
              </View>
            )

          case 'figureBlock':
            return (
              <View key={block._key} style={{marginBottom: 14}}>
                {block.imageUrl ? (
                  <Image src={block.imageUrl} style={styles.image} />
                ) : null}
                {block.caption ? (
                  <Text style={styles.caption}>{block.caption}</Text>
                ) : null}
              </View>
            )

          case 'dividerBlock':
            return (block as {style?: string}).style === 'space' ? (
              <View key={block._key} style={{height: 24}} />
            ) : (
              <View key={block._key} style={styles.divider} />
            )

          default:
            return null
        }
      })}
    </>
  )
}

function PdfSection({
  section,
  accent,
}: {
  section: DocumentSection
  accent: string
}) {
  return (
    <View
      id={section.anchor}
      style={styles.section}
      break={section.pdfOptions?.startOnNewPage}
      wrap={!section.pdfOptions?.keepTogether}
    >
      {section.eyebrow ? (
        <Text style={[styles.sectionEyebrow, {color: accent}]}>
          {section.eyebrow}
        </Text>
      ) : null}

      <Text style={styles.sectionTitle} minPresenceAhead={40}>
        {section.title}
      </Text>

      {section.summary ? (
        <Text style={styles.sectionSummary}>{section.summary}</Text>
      ) : null}

      <PdfPortableText value={section.body} />
    </View>
  )
}

function PdfHeader({
  document,
  pdf,
}: {
  document: ResourceDocument
  pdf: NonNullable<ResourceDocument['pdf']>
}) {
  return (
    <View style={styles.header} fixed>
      <Text>{pdf.headerText || document.shortTitle || document.title}</Text>
      <Text>{document.publisher || 'portals'}</Text>
    </View>
  )
}

function PdfFooter({
  document,
  pdf,
}: {
  document: ResourceDocument
  pdf: NonNullable<ResourceDocument['pdf']>
}) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        {pdf.footerText || `Published by ${document.publisher || 'portals'}`}
      </Text>
      {pdf.showPageNumbers !== false ? (
        <Text render={({pageNumber}) => String(pageNumber)} />
      ) : (
        <Text />
      )}
    </View>
  )
}

export type ResourcePdfAssets = {
  coverBackgroundImage?: string
}

export function ResourcePdfDocument({
  document,
  assets,
}: {
  document: ResourceDocument
  assets?: ResourcePdfAssets
}) {
  const pdf = document.pdf ?? {}
  const accent = validHexColor(pdf.accentColor)
  const pageSize = pdf.pageSize ?? 'LETTER'
  const coverStyle = pdf.coverStyle ?? 'standard'
  const coverBackgroundImage =
    pdf.coverBackgroundImageUrl || assets?.coverBackgroundImage

  const pdfSections = document.sections.filter(
    (section) => section.surfaces?.pdf !== false,
  )

  const tocSections = pdfSections.filter(
    (section) => section.surfaces?.tableOfContents !== false,
  )

  const publicationDate = document.publishedAt
    ? new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(document.publishedAt))
    : undefined

  const authorNames =
    document.authors?.map((author) => author.name).join(', ') ||
    document.publisher ||
    'portals'

  return (
    <Document
      title={pdf.titleOverride || document.title}
      author={authorNames}
      subject={document.abstract}
      keywords={document.seo?.keywords?.join(', ')}
      creator={document.publisher || 'Portals'}
      producer="Portals"
    >
      {pdf.includeCover !== false &&
      coverStyle === 'fullPageArtwork' &&
      coverBackgroundImage ? (
        <Page size={pageSize} style={styles.heroCover}>
          <Image src={coverBackgroundImage} style={styles.heroBackground} />
        </Page>
      ) : null}

      {pdf.includeCover !== false ? (
        <Page size={pageSize} style={styles.cover}>
          <View style={[styles.coverRule, {backgroundColor: accent}]} />

          <Text style={styles.coverTitle}>
            {document.landingPage?.headline ||
              pdf.titleOverride ||
              document.title}
          </Text>

          {pdf.subtitleOverride || document.subtitle ? (
            <Text style={styles.coverSubtitle}>
              {pdf.subtitleOverride || document.subtitle}
            </Text>
          ) : null}

          <Text style={styles.coverAbstract}>{document.abstract}</Text>

          {pdf.includeDocumentCoverImage !== false &&
          document.coverImageUrl ? (
            <Image
              src={document.coverImageUrl}
              style={[styles.image, {marginTop: 34, maxHeight: 260}]}
            />
          ) : null}

          <View style={styles.coverMeta}>
            <Text>
              {[document.publisher, publicationDate, document.edition]
                .filter(Boolean)
                .join('  \u2022  ')}
            </Text>
            {document.audience?.length ? (
              <Text style={{marginTop: 7}}>
                For: {document.audience.join(', ')}
              </Text>
            ) : null}
          </View>
        </Page>
      ) : null}

      {pdf.includeTableOfContents !== false && tocSections.length ? (
        <Page size={pageSize} style={styles.page} wrap>
          <PdfHeader document={document} pdf={pdf} />
          <View style={styles.toc}>
            <Text style={styles.tocTitle}>Contents</Text>
            {tocSections.map((section) =>
              section.anchor ? (
                <Link
                  key={section._key}
                  src={`#${section.anchor}`}
                  style={styles.tocItem}
                >
                  {section.title}
                </Link>
              ) : (
                <Text key={section._key} style={styles.tocItem}>
                  {section.title}
                </Text>
              ),
            )}
          </View>
          <PdfFooter document={document} pdf={pdf} />
        </Page>
      ) : null}

      {pdfSections.map((section) => (
        <Page key={section._key} size={pageSize} style={styles.page} wrap>
          <PdfHeader document={document} pdf={pdf} />
          <PdfSection section={section} accent={accent} />
          <PdfFooter document={document} pdf={pdf} />
        </Page>
      ))}

      {pdf.legalNote ? (
        <Page size={pageSize} style={styles.page} wrap>
          <PdfHeader document={document} pdf={pdf} />
          <Text style={styles.legalNote}>{pdf.legalNote}</Text>
          <PdfFooter document={document} pdf={pdf} />
        </Page>
      ) : null}
    </Document>
  )
}

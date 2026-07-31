import React, {type ReactNode} from 'react'
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'
import type {
  DocumentSection,
  PortableTextBlock,
  ResourceDocument,
} from '@/types/resource'

const FONT_ROOT = new URL('../../../public/fonts/', import.meta.url)

Font.register({
  family: 'DieGroteskB',
  fonts: [
    {
      src: new URL('pdf/DieGroteskB-Regular.ttf', FONT_ROOT).pathname,
      fontWeight: 400,
    },
    {
      src: new URL('pdf/DieGroteskB-Medium.ttf', FONT_ROOT).pathname,
      fontWeight: 500,
    },
  ],
})

Font.register({
  family: 'DieGroteskC',
  fonts: [
    {
      src: new URL('pdf/DieGroteskC-Light.ttf', FONT_ROOT).pathname,
      fontWeight: 300,
    },
  ],
})

const colors = {
  ink: '#07112C',
  blue: '#2F66B5',
  lightBlue: '#79C7DA',
  paleBlue: '#EAF6FA',
  white: '#FFFFFF',
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingRight: 44,
    paddingBottom: 38,
    paddingLeft: 44,
    backgroundColor: colors.white,
    color: colors.ink,
    fontFamily: 'DieGroteskB',
    fontSize: 8.5,
    lineHeight: 1.24,
  },
  coverPage: {
    backgroundColor: colors.ink,
    color: colors.white,
  },
  wash: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 240,
    backgroundColor: colors.blue,
  },
  lightWash: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 84,
    backgroundColor: colors.lightBlue,
  },
  wordmark: {
    fontFamily: 'DieGroteskB',
    fontSize: 11,
    fontWeight: 500,
  },
  title: {
    width: 400,
    marginTop: 52,
    fontFamily: 'DieGroteskC',
    fontSize: 30,
    fontWeight: 300,
    lineHeight: 1.02,
  },
  subtitle: {
    width: 360,
    marginTop: 14,
    fontFamily: 'DieGroteskC',
    fontSize: 17,
    fontWeight: 300,
    lineHeight: 1.08,
    color: colors.lightBlue,
  },
  abstract: {
    width: 365,
    marginTop: 18,
    fontSize: 9.2,
    lineHeight: 1.3,
  },
  metrics: {
    width: 365,
    marginTop: 22,
    flexDirection: 'row',
    gap: 10,
  },
  metric: {
    width: 84,
    minHeight: 47,
    padding: 8,
    backgroundColor: '#17264A',
  },
  metricValue: {
    fontFamily: 'DieGroteskC',
    fontSize: 15,
    fontWeight: 300,
    color: colors.lightBlue,
  },
  metricLabel: {
    marginTop: 3,
    fontSize: 7.4,
  },
  coverGrid: {
    width: 365,
    marginTop: 24,
    flexDirection: 'row',
    gap: 20,
  },
  coverColumn: {
    width: 172,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 26,
  },
  pageHeaderTitle: {
    fontSize: 8.5,
    fontWeight: 500,
  },
  pageNumber: {
    fontSize: 8.5,
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    marginBottom: 6,
    fontFamily: 'DieGroteskC',
    fontSize: 17,
    fontWeight: 300,
    lineHeight: 1.05,
  },
  sectionSummary: {
    marginBottom: 6,
    fontSize: 8.7,
    fontWeight: 500,
  },
  paragraph: {
    marginBottom: 5,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 3.5,
  },
  bullet: {
    width: 12,
    color: colors.blue,
  },
  listText: {
    flex: 1,
  },
  pageTwoGrid: {
    flexDirection: 'row',
    gap: 24,
  },
  pageTwoColumn: {
    width: 250,
  },
  commercial: {
    marginBottom: 18,
    padding: 14,
    backgroundColor: colors.paleBlue,
  },
  commercialValue: {
    marginBottom: 6,
    fontFamily: 'DieGroteskC',
    fontSize: 23,
    fontWeight: 300,
    color: colors.blue,
  },
  outcome: {
    marginTop: 4,
    padding: 14,
    backgroundColor: colors.ink,
    color: colors.white,
  },
  outcomeTitle: {
    marginBottom: 6,
    fontFamily: 'DieGroteskC',
    fontSize: 17,
    fontWeight: 300,
    color: colors.lightBlue,
  },
  legal: {
    position: 'absolute',
    left: 44,
    right: 44,
    bottom: 22,
    fontSize: 6.8,
    lineHeight: 1.25,
    color: '#40506E',
  },
})

function sectionByAnchor(
  document: ResourceDocument,
  anchor: string,
): DocumentSection {
  const section = document.sections.find((item) => item.anchor === anchor)

  if (!section) {
    throw new Error(`Missing paid pilot PDF section: ${anchor}`)
  }

  return section
}

function plainText(block: PortableTextBlock): string {
  return block.children?.map((child) => child.text).join('') ?? ''
}

function SectionContent({section}: {section: DocumentSection}) {
  return (
    <>
      {section.body.map((block) => {
        const text = plainText(block)
        if (!text) return null

        if (block.listItem) {
          return (
            <View key={block._key} style={styles.listItem}>
              <Text style={styles.bullet}>{'\u2022'}</Text>
              <Text style={styles.listText}>{text}</Text>
            </View>
          )
        }

        return (
          <Text key={block._key} style={styles.paragraph}>
            {text}
          </Text>
        )
      })}
    </>
  )
}

function Section({
  section,
  compact = false,
}: {
  section: DocumentSection
  compact?: boolean
}) {
  return (
    <View style={[styles.section, compact ? {marginBottom: 12} : {}]}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      {section.summary ? (
        <Text style={styles.sectionSummary}>{section.summary}</Text>
      ) : null}
      <SectionContent section={section} />
    </View>
  )
}

function PageHeader({
  document,
  pageNumber,
}: {
  document: ResourceDocument
  pageNumber: number
}) {
  return (
    <View style={styles.pageHeader}>
      <Text style={styles.pageHeaderTitle}>
        {document.pdf?.headerText || document.shortTitle || document.title}
      </Text>
      <Text style={styles.pageNumber}>{pageNumber}</Text>
    </View>
  )
}

export function PaidPilotPdfDocument({
  document,
}: {
  document: ResourceDocument
}): ReactNode {
  const objective = sectionByAnchor(document, 'objective')
  const scope = sectionByAnchor(document, 'scope')
  const firstValue = sectionByAnchor(document, 'first-value')
  const successCriteria = sectionByAnchor(document, 'success-criteria')
  const commercialTerms = sectionByAnchor(document, 'commercial-terms')
  const portalsResponsibilities = sectionByAnchor(
    document,
    'portals-responsibilities',
  )
  const customerResponsibilities = sectionByAnchor(
    document,
    'customer-responsibilities',
  )
  const finalReview = sectionByAnchor(document, 'final-review')
  const intendedOutcome = sectionByAnchor(document, 'intended-outcome')

  return (
    <Document
      title={document.pdf?.titleOverride || document.title}
      author={document.publisher || 'portals'}
      subject={document.abstract}
      keywords={document.seo?.keywords?.join(', ')}
      creator={document.publisher || 'portals'}
      producer="portals"
    >
      <Page size="LETTER" style={[styles.page, styles.coverPage]}>
        <View style={styles.wash} />
        <View style={styles.lightWash} />
        <Text style={styles.wordmark}>portals</Text>
        <Text style={styles.title}>{document.title}</Text>
        <Text style={styles.subtitle}>
          {document.pdf?.subtitleOverride || document.subtitle}
        </Text>
        <Text style={styles.abstract}>{document.abstract}</Text>

        <View style={styles.metrics}>
          {[
            ['21 days', 'pilot period'],
            ['$5,000', 'upfront'],
            ['48 hours', 'first value'],
            ['10 users', 'up to'],
          ].map(([value, label]) => (
            <View key={label} style={styles.metric}>
              <Text style={styles.metricValue}>{value}</Text>
              <Text style={styles.metricLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.coverGrid}>
          <View style={styles.coverColumn}>
            <Section section={objective} compact />
            <Section section={scope} compact />
          </View>
          <View style={styles.coverColumn}>
            <Section section={firstValue} compact />
            <Section section={successCriteria} compact />
          </View>
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <PageHeader document={document} pageNumber={2} />

        <View style={styles.commercial}>
          <Text style={styles.commercialValue}>$5,000 upfront</Text>
          <Text style={styles.sectionTitle}>{commercialTerms.title}</Text>
          <Text style={styles.sectionSummary}>{commercialTerms.summary}</Text>
          <SectionContent section={commercialTerms} />
        </View>

        <View style={styles.pageTwoGrid}>
          <View style={styles.pageTwoColumn}>
            <Section section={portalsResponsibilities} compact />
            <Section section={finalReview} compact />
          </View>
          <View style={styles.pageTwoColumn}>
            <Section section={customerResponsibilities} compact />
            <View style={styles.outcome}>
              <Text style={styles.outcomeTitle}>{intendedOutcome.title}</Text>
              <Text style={styles.sectionSummary}>
                {intendedOutcome.summary}
              </Text>
              <SectionContent section={intendedOutcome} />
            </View>
          </View>
        </View>

        {document.pdf?.legalNote ? (
          <Text style={styles.legal}>{document.pdf.legalNote}</Text>
        ) : null}
      </Page>
    </Document>
  )
}

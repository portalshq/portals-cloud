import {getCliClient} from 'sanity/cli'

const client = getCliClient({apiVersion: '2026-07-01'})

let keyIndex = 0

function key(prefix) {
  keyIndex += 1
  return `${prefix}-${String(keyIndex).padStart(3, '0')}`
}

function block(text, options = {}) {
  return {
    _key: key('block'),
    _type: 'block',
    style: options.style || 'normal',
    ...(options.listItem
      ? {listItem: options.listItem, level: options.level || 1}
      : {}),
    markDefs: [],
    children: [
      {
        _key: key('span'),
        _type: 'span',
        marks: options.marks || [],
        text,
      },
    ],
  }
}

function section({
  anchor,
  title,
  status,
  summary,
  paragraphs = [],
  bullets = [],
  landing = 'summary',
}) {
  return {
    _key: key('section'),
    _type: 'documentSection',
    sectionType: status === 'PLANNED' ? 'evaluation' : 'standard',
    anchor: {_type: 'slug', current: anchor},
    eyebrow: status,
    title,
    summary,
    landingExcerpt: summary,
    surfaces: {
      landing,
      pdf: true,
      tableOfContents: true,
    },
    pdfOptions: {
      startOnNewPage: false,
      keepTogether: false,
    },
    body: [
      ...paragraphs.map((text) => block(text)),
      ...bullets.map((text) => block(text, {listItem: 'bullet'})),
    ],
  }
}

const sections = [
  section({
    anchor: 'scope-and-security-posture',
    title: 'Scope and security posture',
    status: 'CURRENT POSITION',
    summary:
      'Portals treats production assets, generation context, lineage, approvals, and creative decisions as sensitive operational data.',
    paragraphs: [
      'Portals is a production repository for AI-native creative organizations. This brief describes the current product architecture, operating positions, customer-data policies, limitations, and planned security work as of July 31, 2026.',
      'Portals is not represented as SOC 2 certified, ISO 27001 certified, HIPAA compliant, PCI compliant, or certified under another formal framework. Formal controls apply only when confirmed by a current certification document or signed agreement.',
    ],
    bullets: [
      'Customer production assets should remain logically isolated by organization.',
      'Access should be governed by explicit user, team, and repository permissions.',
      'Creative history should be recoverable, auditable, and exportable.',
      'Customer production data is not training material without explicit written permission.',
    ],
  }),
  section({
    anchor: 'data-storage-and-isolation',
    title: 'Data storage and isolation',
    status: 'CURRENT ARCHITECTURE',
    summary:
      'Customer records are associated with organization and repository boundaries; dedicated single-tenant infrastructure is not a standard commitment.',
    paragraphs: [
      'Portals is designed around logical tenant isolation. Assets, users, repositories, metadata, permissions, and production history are associated with an organization or workspace, and application authorization checks are expected at access boundaries.',
      'Portals does not intentionally expose one customer workspace to another. Deployment-specific storage paths, identifiers, policies, and infrastructure are confirmed during a security review.',
    ],
    bullets: [
      'Standard service: logical tenant isolation.',
      'Not currently claimed as standard: dedicated environments, private cloud, region-specific storage, or customer-controlled infrastructure.',
      'Enhanced isolation may be evaluated through a separate commercial and technical review.',
    ],
  }),
  section({
    anchor: 'encryption',
    title: 'Encryption',
    status: 'CURRENT ARCHITECTURE',
    summary:
      'The production architecture requires encrypted transport and infrastructure-supported encryption at rest; customer-managed keys are not currently claimed.',
    paragraphs: [
      'Production web, API, authentication, upload, retrieval, and integration traffic is expected to use HTTPS/TLS. Stored assets, metadata, backups, and operational records rely on the encryption capabilities configured in the underlying storage and database infrastructure.',
      'Encryption details can vary by deployment. Portals does not claim customer-managed keys, bring-your-own-key support, or a dedicated customer key hierarchy unless separately confirmed in writing.',
    ],
  }),
  section({
    anchor: 'authentication',
    title: 'Authentication',
    status: 'CURRENT ARCHITECTURE',
    summary:
      'Users must authenticate before accessing protected production records; enterprise SSO and MFA support are not represented as universal current features.',
    paragraphs: [
      'Authentication may use email, password, OAuth, identity-provider, or session-based mechanisms according to the deployed product configuration. Each person should use a unique account, and shared credentials should not be used.',
      'Customers are responsible for protecting identity-provider accounts and promptly removing departed users. SSO, SAML, OIDC, and provider-enforced multi-factor authentication are available only where implemented and explicitly confirmed.',
    ],
  }),
  section({
    anchor: 'permissions',
    title: 'Permissions and access control',
    status: 'CURRENT ARCHITECTURE',
    summary:
      'Portals is designed for organization and repository permissions with least-privilege access for owners, contributors, reviewers, and viewers.',
    paragraphs: [
      'Access is intended to follow organization, repository, project, and supported asset boundaries. Administrative users manage workspace settings and membership; contributors, reviewers, and viewers receive narrower access according to their work.',
      'Customers remain responsible for role assignment, periodic access review, contractor access, and removal of users who no longer require access.',
    ],
  }),
  section({
    anchor: 'backup-and-recovery',
    title: 'Backup and recovery',
    status: 'CURRENT OPERATING POSITION',
    summary:
      'Recovery design combines infrastructure durability, backups, and product version history; no fixed RPO, RTO, or restoration guarantee is claimed.',
    paragraphs: [
      'Product version history and infrastructure recovery serve different purposes. Version history helps recover or inspect earlier production states; infrastructure backups and provider durability features support recovery from service or data-loss events.',
      'Backup coverage, retention, and recovery steps depend on the deployment and plan. Exact recovery point objectives, recovery time objectives, and restoration timelines require a signed agreement.',
    ],
  }),
  section({
    anchor: 'retention',
    title: 'Retention',
    status: 'CURRENT POLICY',
    summary:
      'Retention follows the active plan, workspace settings, applicable terms, and written agreements; custom windows require review.',
    paragraphs: [
      'Assets, version history, metadata, approvals, comments, user records, and related production context may remain available while an account is active and in good standing.',
      'Some security, billing, fraud-prevention, legal, and operational records may remain after account closure where required. Custom retention, legal hold, shortened retention, and archival arrangements require an enterprise agreement.',
    ],
  }),
  section({
    anchor: 'deletion',
    title: 'Deletion',
    status: 'CURRENT POLICY',
    summary:
      'Customers may request deletion subject to their agreement and law; backup copies age out through normal retention cycles.',
    paragraphs: [
      'Deletion can apply to assets, repositories, users, metadata, version history, or an organization workspace. Removing access, deleting active records, and purging backup copies are separate operations.',
      'Active-system deletion may occur before backup or log deletion. Limited records may be retained for legal, accounting, security, fraud-prevention, or repository-integrity reasons.',
    ],
  }),
  section({
    anchor: 'model-training-policy',
    title: 'Model-training policy',
    status: 'CURRENT POLICY',
    summary:
      'Portals does not use private customer assets or production context to train shared AI models without explicit written permission.',
    paragraphs: [
      'Customer assets, prompts, source media, version history, private repositories, and proprietary production context are private customer data, not training material. Portals does not sell that data to model providers.',
      'Any customer-authorized training, fine-tuning, evaluation, or dataset work requires separate written terms identifying the data, systems, retention, output ownership, revocation, export, and deletion treatment.',
    ],
  }),
  section({
    anchor: 'subprocessors',
    title: 'Subprocessors',
    status: 'CURRENT DISCLOSURE',
    summary:
      'Portals uses service providers only as operationally necessary; the current provider list is supplied during security review, and a public list is planned.',
    paragraphs: [
      'Subprocessor categories may include cloud infrastructure, databases, object storage, authentication, email, billing, observability, support, analytics, integrations, and optional AI-processing providers.',
      'Website lead operations use a managed marketing-intake PostgreSQL database, Tally for workflow-assessment collection, Attio for customer-relationship records, Resend for requested email delivery and notifications, and Mixpanel for consented website analytics. Free-text form answers are not sent to Mixpanel.',
      'The exact list depends on the deployed service and enabled features. Portals will not identify a provider as active unless it is actually used. Customers may request the current list, purpose, data categories, region information where available, and status during vendor review.',
    ],
  }),
  section({
    anchor: 'audit-logging',
    title: 'Audit logging',
    status: 'CURRENT AND EVOLVING',
    summary:
      'Security-relevant and production-relevant events are part of the audit model; log coverage, retention, and exportability vary by plan and feature.',
    paragraphs: [
      'Relevant events can include authentication, invitations, role changes, repository changes, asset versions, approvals, deletions, exports, administrative settings, integrations, and API credentials where supported.',
      'Expanded customer-facing audit export, configurable retention, SIEM integration, and custom reports are planned or enterprise-scoped capabilities, not universal current commitments.',
    ],
  }),
  section({
    anchor: 'availability-commitments',
    title: 'Availability commitments',
    status: 'CURRENT COMMITMENT',
    summary:
      'Portals uses commercially reasonable efforts to maintain reliable service; no formal uptime guarantee, service credit, or enterprise SLA is claimed by default.',
    paragraphs: [
      'Managed infrastructure, monitoring, operational review, backup procedures, and recovery planning support service reliability.',
      'Formal uptime targets, support hours, service credits, recovery objectives, data-region terms, and dedicated infrastructure apply only when explicitly included in a signed agreement.',
    ],
  }),
  section({
    anchor: 'export-process',
    title: 'Export process',
    status: 'CURRENT POSITION',
    summary:
      'Customers should have a practical route to retrieve production assets and context, subject to permissions, plan limits, scale, and technical feasibility.',
    paragraphs: [
      'Exports may include original assets, approved versions, version history, metadata, prompts, generation context, references, decisions, approvals, lineage, repository structure, and available audit data.',
      'Delivery may use direct downloads, APIs, structured archives, manifest files, or a supported bulk-export workflow. Large or sensitive exports can require identity verification, administrative approval, and processing time.',
    ],
  }),
  section({
    anchor: 'incident-response',
    title: 'Incident response',
    status: 'CURRENT OPERATING MODEL',
    summary:
      'The incident process covers detection, triage, containment, investigation, remediation, required notification, and post-incident review.',
    paragraphs: [
      'Portals evaluates security, privacy, availability, and data-integrity events by severity, affected systems and customers, data categories, and containment needs. Response may include restricting access, revoking credentials, disabling integrations, restoring service, rotating secrets, and closing control gaps.',
      'Affected customers are notified when required by law, agreement, or the nature of the incident. Portals does not promise a specific notification window unless it is operationally supported and contractually agreed.',
    ],
  }),
  section({
    anchor: 'current-certifications',
    title: 'Current certifications',
    status: 'CURRENT STATUS',
    summary:
      'No formal third-party security certification is claimed in this brief.',
    paragraphs: [
      'As of July 31, 2026, Portals does not claim SOC 2 Type I, SOC 2 Type II, ISO 27001, ISO 27701, HIPAA, PCI DSS, FedRAMP, GDPR certification, or CSA STAR certification.',
      'This statement is deliberately narrow. A certification or compliance claim should be relied on only when supported by a current certificate, audit report, or signed agreement.',
    ],
  }),
  section({
    anchor: 'planned-certifications',
    title: 'Planned certifications and security roadmap',
    status: 'PLANNED',
    summary:
      'The following work is planned or under evaluation. It is not complete, certified, scheduled, or contractually committed.',
    bullets: [
      'SOC 2 readiness assessment, followed by Type I and Type II evaluation as operational maturity allows.',
      'Formal vendor-risk management and a published subprocessor list.',
      'Expanded audit-log export, retention controls, and administrative export controls.',
      'Enterprise SSO/SAML/OIDC support where not already available.',
      'A security questionnaire package, data-processing addendum, and published incident-response summary.',
      'Annual penetration-testing evaluation and a vulnerability-disclosure policy.',
      'Formal business-continuity and disaster-recovery documentation.',
      'Dedicated infrastructure and customer-managed encryption-key evaluation.',
    ],
  }),
]

const document = {
  _type: 'resourceDocument',
  status: 'published',
  resourceKind: 'brief',
  title: 'Portals Security and Architecture Brief',
  shortTitle: 'Security and Architecture',
  slug: {_type: 'slug', current: 'security-and-architecture'},
  subtitle:
    'Current positions, explicit limitations, and planned security work for valuable production assets.',
  abstract:
    'A concise account of how Portals approaches customer-data isolation, encryption, identity, permissions, resilience, data use, portability, incident response, and assurance. Current controls and policies are separated from planned work.',
  audience: [
    'Security and IT leaders',
    'Procurement teams',
    'Creative operations leaders',
    'Enterprise customers',
  ],
  publisher: 'Portals',
  authors: [
    {
      _key: key('author'),
      _type: 'object',
      name: 'Portals',
      role: 'Security and Architecture',
    },
  ],
  publishedAt: '2026-07-31T12:00:00.000Z',
  edition: 'Version 1.0',
  seo: {
    _type: 'seoSettings',
    metaTitle: 'Security and Architecture | Portals',
    metaDescription:
      'Review Portals data isolation, encryption, access, recovery, retention, model-training, incident response, certifications, and security roadmap.',
    keywords: [
      'Portals security',
      'AI production security',
      'data isolation',
      'model training policy',
      'security architecture',
    ],
    shareTitle: 'Portals Security and Architecture Brief',
    shareDescription:
      'Current security positions, explicit limitations, and planned controls for valuable AI production assets.',
    canonicalPath: '/security-and-architecture',
    noIndex: false,
  },
  landingPage: {
    _type: 'landingPageSettings',
    enabled: true,
    eyebrow: 'SECURITY AND ARCHITECTURE / VERSION 1.0',
    headline: 'Security for production memory',
    description:
      'A direct account of how Portals approaches valuable production assets: what is current, what depends on deployment or agreement, and what remains planned.',
    primaryCta: {
      _type: 'cta',
      label: 'Download the security brief',
      action: 'downloadPdf',
      style: 'primary',
      openInNewTab: true,
    },
    secondaryCta: {
      _type: 'cta',
      label: 'Start a security review',
      action: 'external',
      href: 'mailto:sales@portals.works?subject=Portals%20security%20review',
      style: 'secondary',
    },
    showPublicationMeta: true,
    showSectionNavigation: true,
  },
  pdf: {
    _type: 'pdfSettings',
    enabled: true,
    fileName: 'portals-security-architecture-brief.pdf',
    titleOverride: 'Portals Security and Architecture Brief',
    subtitleOverride:
      'Current positions, explicit limitations, and planned security work',
    pageSize: 'LETTER',
    coverStyle: 'standard',
    includeDocumentCoverImage: false,
    includeCover: true,
    includeTableOfContents: true,
    showPageNumbers: true,
    headerText: 'Portals Security and Architecture Brief',
    footerText: 'Portals / Version 1.0 / July 2026',
    accentColor: '#D89431',
    legalNote:
      'This brief is informational and reflects Portals positions as of July 31, 2026. It is not a certification, audit report, service-level agreement, warranty, or substitute for signed contractual terms. Planned items are not current controls or commitments.',
  },
  sections,
  finalCta: {
    _type: 'finalCtaBlock',
    eyebrow: 'SECURITY REVIEW',
    headline: 'Evaluate Portals against the assets you cannot afford to lose.',
    description:
      'Bring your data, access, retention, export, and procurement requirements. Portals will identify what is supported now, what requires agreement, and what is not yet available.',
    primaryCta: {
      _type: 'cta',
      label: 'Start a security review',
      action: 'internal',
      href: '/contact?intent=security-review',
      style: 'primary',
    },
  },
}

const existing = await client.fetch(
  '*[_type == "resourceDocument" && slug.current == $slug][0]{_id}',
  {slug: document.slug.current},
)

if (existing?._id) {
  const {_type, ...patchData} = document
  const result = await client
    .patch(existing._id)
    .set(patchData)
    .commit()
  console.log(`Updated ${result._id}`)
} else {
  const result = await client.create(document)
  console.log(`Created ${result._id}`)
}

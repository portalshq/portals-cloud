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
    ...(options.listItem ? {listItem: options.listItem, level: options.level || 1} : {}),
    markDefs: [],
    children: [
      {
        _key: key('span'),
        _type: 'span',
        marks: [],
        text,
      },
    ],
  }
}

function section(title, anchor, entries) {
  return {
    _key: key('section'),
    _type: 'legalDocumentSection',
    anchor: {_type: 'slug', current: anchor},
    title,
    body: entries.map((entry) =>
      typeof entry === 'string'
        ? block(entry)
        : block(entry.text, {listItem: entry.listItem}),
    ),
  }
}

const privacyPolicy = {
  _type: 'legalDocument',
  status: 'published',
  documentType: 'privacyPolicy',
  title: 'Privacy Policy',
  slug: {_type: 'slug', current: 'privacy-policy'},
  summary:
    'This policy explains what Portals collects, how customer production data is handled, when data may be processed by service providers, and how customers can request access, export, correction, or deletion.',
  effectiveDate: '2026-07-31',
  contactEmail: 'privacy@portals.works',
  seo: {
    _type: 'seoSettings',
    metaTitle: 'Privacy Policy | Portals',
    metaDescription:
      'Read the Portals Privacy Policy covering account data, production assets, AI processing, retention, deletion, security, and contact rights.',
    canonicalPath: '/privacy-policy',
    noIndex: false,
  },
  sections: [
    section('Scope', 'scope', [
      'This Privacy Policy describes how Portals collects, uses, discloses, and protects personal information and customer production data in connection with the Portals website, applications, hosted services, pilots, support, and related communications.',
      'Portals is designed for creative production teams. Customer assets, prompts, source media, version history, approvals, comments, lineage, metadata, and repository context may contain confidential business information. We treat that material as customer data, not as public content.',
      'This policy is informational and may be supplemented by a signed order form, data-processing addendum, enterprise agreement, security review, or other written terms.',
    ]),
    section('Information we collect', 'information-we-collect', [
      'We may collect account and identity information such as name, email address, organization, role, authentication identifiers, workspace membership, and billing or procurement contacts.',
      'We may collect customer content submitted to or generated in the service, including production assets, files, prompts, instructions, references, outputs, comments, approvals, repository structure, version history, and related metadata.',
      'We may collect operational information such as device and browser data, IP address, timestamps, logs, feature usage, support messages, error reports, security events, and integration configuration.',
      'We may collect payment, contract, and invoicing information through billing providers, but we do not intentionally store full payment card numbers in the Portals application.',
    ]),
    section('How we use information', 'how-we-use-information', [
      'We use information to provide, secure, maintain, troubleshoot, improve, and support the service; authenticate users; manage accounts and permissions; process transactions; communicate about the service; and comply with legal obligations.',
      'We use customer production data to operate requested product features, preserve production history, support collaboration, process assets, generate or manage outputs, provide support when authorized, and perform security or integrity checks.',
      'We do not sell private customer production data. We do not use private customer assets, prompts, source media, version history, private repositories, or proprietary production context to train shared AI models without explicit written permission.',
    ]),
    section('AI processing and third-party providers', 'ai-processing-and-third-party-providers', [
      'Some features may send customer-selected content, prompts, files, metadata, or instructions to AI providers, cloud infrastructure, object storage, databases, authentication providers, email services, billing providers, observability tools, support tools, analytics tools, or integration providers as needed to deliver the service.',
      'Provider use depends on the deployed service, enabled integrations, customer configuration, and plan. Portals will not identify a provider as active unless it is actually used.',
      'Where available and applicable, Portals seeks provider settings that limit provider use of customer data for training. Deployment-specific provider lists, data categories, and region details may be supplied during vendor or security review.',
    ]),
    section('Cookies and similar technologies', 'cookies-and-similar-technologies', [
      'The website and application may use cookies, local storage, session storage, and similar technologies for authentication, security, preferences, analytics, performance, and product operation.',
      'You may control cookies through browser settings. Some service features may not work correctly if required authentication or security cookies are blocked.',
    ]),
    section('Security', 'security', [
      'Portals uses commercially reasonable administrative, technical, and organizational measures designed to protect information. Current product architecture expects encrypted transport through HTTPS/TLS and infrastructure-supported encryption at rest.',
      'Customer data is intended to be logically isolated by organization, workspace, repository, and permission boundaries. Dedicated environments, private cloud, customer-managed keys, specific recovery objectives, or formal certifications apply only when separately confirmed in writing.',
      'As of July 31, 2026, Portals does not claim SOC 2, ISO 27001, HIPAA, PCI DSS, FedRAMP, GDPR certification, or another formal third-party security certification.',
    ]),
    section('Retention, export, and deletion', 'retention-export-and-deletion', [
      'We retain account records, customer content, production history, metadata, logs, support records, billing records, and security records as needed to provide the service, comply with law, resolve disputes, enforce agreements, maintain integrity, and support security.',
      'Customers may request export or deletion of customer data subject to account permissions, plan limits, technical feasibility, applicable agreements, and legal requirements. Active-system deletion may occur before backup, archive, or log expiration.',
      'Certain records may be retained where required for legal, accounting, fraud-prevention, security, dispute-resolution, or repository-integrity purposes.',
    ]),
    section('Your choices and rights', 'your-choices-and-rights', [
      'Depending on your location and relationship with Portals, you may have rights to request access, correction, deletion, portability, restriction, or objection regarding personal information.',
      'Workspace administrators may manage many user and repository records directly. For requests that require Portals support, contact us at privacy@portals.works.',
      'We may need to verify your identity, authority, and workspace relationship before fulfilling a request.',
    ]),
    section('Children', 'children', [
      'Portals is not directed to children under 13 and is not intended for personal use by children. We do not knowingly collect personal information from children under 13.',
    ]),
    section('International transfers', 'international-transfers', [
      'Portals and its providers may process information in the United States and other countries where we or our providers operate. Data protection laws may differ from those in your location.',
      'Enterprise transfer mechanisms or data-region commitments apply only when included in a signed agreement.',
    ]),
    section('Changes and contact', 'changes-and-contact', [
      'We may update this Privacy Policy from time to time. The effective date above identifies the current version.',
      'Questions or requests may be sent to privacy@portals.works.',
    ]),
  ],
}

const termsOfService = {
  _type: 'legalDocument',
  status: 'published',
  documentType: 'termsOfService',
  title: 'Terms of Service',
  slug: {_type: 'slug', current: 'terms-of-service'},
  summary:
    'These terms describe permitted use of Portals, account responsibilities, customer content ownership, AI outputs, acceptable use, service limitations, security posture, and termination basics.',
  effectiveDate: '2026-07-31',
  contactEmail: 'legal@portals.works',
  seo: {
    _type: 'seoSettings',
    metaTitle: 'Terms of Service | Portals',
    metaDescription:
      'Read the Portals Terms of Service covering use, accounts, customer content, AI outputs, acceptable use, availability, providers, and liability.',
    canonicalPath: '/terms-of-service',
    noIndex: false,
  },
  sections: [
    section('Agreement to these terms', 'agreement-to-these-terms', [
      'These Terms of Service govern access to and use of Portals websites, applications, hosted services, pilots, support, and related offerings. By using Portals, you agree to these terms.',
      'If you use Portals for an organization, you represent that you have authority to bind that organization. A signed order form, enterprise agreement, data-processing addendum, or other written agreement controls if it conflicts with these terms.',
      'These terms are a minimum viable public version and do not replace negotiated enterprise terms where those exist.',
    ]),
    section('The service', 'the-service', [
      'Portals provides repository, versioning, collaboration, production-memory, AI-production, asset-management, and related workflow capabilities for creative production teams.',
      'Features may vary by plan, pilot, deployment, workspace configuration, integrations, and availability. Beta, experimental, preview, or pilot features may change or end at any time.',
    ]),
    section('Accounts and administration', 'accounts-and-administration', [
      'You are responsible for maintaining accurate account information, protecting credentials, configuring workspace access, assigning roles, reviewing permissions, and removing users who no longer need access.',
      'Each user should use a unique account. Shared credentials, credential resale, and unauthorized access are prohibited.',
      'Customers are responsible for identity-provider security and for activity under their accounts, except to the extent caused by Portals breach of these terms.',
    ]),
    section('Customer content and ownership', 'customer-content-and-ownership', [
      'As between you and Portals, you retain ownership of customer content you submit to the service, including production assets, source media, prompts, instructions, references, outputs, approvals, comments, repository structure, version history, and related metadata.',
      'You grant Portals a limited license to host, process, transmit, display, reproduce, modify, and otherwise use customer content as needed to provide, secure, support, and improve the service and as otherwise permitted by your agreement.',
      'You represent that you have the rights and permissions needed to submit customer content and to authorize Portals to process it.',
    ]),
    section('AI features and outputs', 'ai-features-and-outputs', [
      'AI-enabled features may process customer content, prompts, files, metadata, or instructions through Portals systems and third-party AI providers. You are responsible for reviewing outputs before relying on or publishing them.',
      'AI outputs may be inaccurate, incomplete, similar to third-party materials, or unsuitable for a particular use. Portals does not guarantee uniqueness, ownership availability, non-infringement, legal clearance, or commercial fitness of AI-generated outputs.',
      'Portals does not use private customer assets or production context to train shared AI models without explicit written permission.',
    ]),
    section('Acceptable use', 'acceptable-use', [
      'You may not use the service to violate law, infringe rights, upload malicious code, interfere with service operation, probe or bypass security controls, access another customer workspace, scrape the service, or misrepresent outputs as human-created where disclosure is required.',
      'You may not use Portals to create, store, or distribute content that is unlawful, abusive, exploitative, deceptive, or otherwise prohibited by applicable law or written Portals policy.',
      'Portals may suspend or restrict access to protect the service, customers, users, providers, or the public.',
    ]),
    section('Security and privacy posture', 'security-and-privacy-posture', [
      'Portals takes commercially reasonable measures to secure the service and expects encrypted transport, infrastructure-supported encryption at rest, logical organization isolation, permission boundaries, and operational security review.',
      'Portals does not claim SOC 2, ISO 27001, HIPAA, PCI DSS, FedRAMP, GDPR certification, dedicated environments, private cloud, customer-managed keys, or fixed recovery objectives unless confirmed in a current written agreement or certification document.',
      'The Portals Privacy Policy explains how personal information and customer production data are handled.',
    ]),
    section('Third-party services and integrations', 'third-party-services-and-integrations', [
      'The service may interoperate with third-party services such as cloud infrastructure, storage, authentication, AI providers, email, billing, analytics, observability, support tools, and customer-enabled integrations.',
      'Third-party services may have their own terms and privacy practices. Portals is not responsible for third-party services outside its control.',
      'You authorize Portals to exchange information with third-party services you enable or that are required to provide the service.',
    ]),
    section('Fees and payment', 'fees-and-payment', [
      'Fees, billing terms, taxes, renewal rules, usage limits, and cancellation rights are stated in the applicable order form, checkout flow, invoice, or written agreement.',
      'Unless otherwise stated in writing, fees are non-refundable except where required by law.',
    ]),
    section('Availability and changes', 'availability-and-changes', [
      'Portals uses commercially reasonable efforts to maintain reliable service, but does not guarantee uninterrupted or error-free operation.',
      'Formal uptime targets, support hours, service credits, recovery objectives, retention commitments, and data-region commitments apply only when included in a signed agreement.',
      'Portals may modify, suspend, or discontinue features where needed for security, reliability, legal compliance, provider changes, or product evolution.',
    ]),
    section('Export, deletion, and termination', 'export-deletion-and-termination', [
      'Customers may request export or deletion subject to account permissions, plan limits, technical feasibility, applicable agreements, and legal requirements.',
      'Either party may terminate access according to the applicable order form or written agreement. Portals may suspend or terminate access for material breach, security risk, unlawful use, non-payment, or misuse.',
      'Certain records may be retained after termination for legal, accounting, fraud-prevention, security, backup, dispute-resolution, or repository-integrity purposes.',
    ]),
    section('Disclaimers', 'disclaimers', [
      'Except as expressly stated in a written agreement, the service is provided as is and as available. Portals disclaims warranties of merchantability, fitness for a particular purpose, non-infringement, availability, accuracy, and uninterrupted operation to the maximum extent permitted by law.',
      'You are responsible for validating outputs, maintaining appropriate backups where required, and determining whether the service meets your legal, regulatory, security, and production requirements.',
    ]),
    section('Limitation of liability', 'limitation-of-liability', [
      'To the maximum extent permitted by law, Portals will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenues, goodwill, data, or business opportunities.',
      'Except for amounts that cannot be limited by law or a signed agreement, Portals aggregate liability for claims relating to the service will not exceed the amounts paid to Portals for the service giving rise to the claim during the twelve months before the event giving rise to liability.',
    ]),
    section('Governing law and contact', 'governing-law-and-contact', [
      'Unless a signed agreement states otherwise, these terms are governed by the laws of the State of Delaware, without regard to conflict-of-law rules.',
      'Legal notices and questions may be sent to legal@portals.works.',
    ]),
  ],
}

for (const document of [privacyPolicy, termsOfService]) {
  const existing = await client.fetch(
    '*[_type == "legalDocument" && documentType == $documentType][0]{_id}',
    {documentType: document.documentType},
  )

  if (existing?._id) {
    const {_type, ...patchData} = document
    const result = await client.patch(existing._id).set(patchData).commit()
    console.log(`Updated ${result._id}`)
  } else {
    const result = await client.create(document)
    console.log(`Created ${result._id}`)
  }
}

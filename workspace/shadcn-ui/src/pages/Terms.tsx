import React from 'react'
import { Navbar } from '@/components/layout/Navbar'
import { Badge } from '@/components/ui/badge'

const sections = [
  {
    title: 'Acceptance of Terms',
    body: [
      'By accessing or using findyourhatch.com and any related services (the “Site”), you agree to these Terms and Conditions and acknowledge our Privacy Policy. If you do not agree, do not use the Site.',
    ],
  },
  {
    title: 'Eligibility',
    body: [
      'You must be at least 18 years old to use the Site. If you access the Site on behalf of a company or organization, you represent that you are authorized to bind that entity to these Terms.',
    ],
  },
  {
    title: 'Accounts',
    body: [
      'You are responsible for safeguarding your account credentials and for all activity under your account. Notify us promptly of any unauthorized access or suspected compromise.',
    ],
  },
  {
    title: 'Use of the Site',
    body: ['You agree not to engage in conduct that could harm Hatch Technologies Group LLC, other users, or the Site, including:'],
    bullets: [
      'Violating applicable laws or regulations.',
      'Infringing intellectual property, privacy, or other rights.',
      'Uploading malicious code or attempting to bypass security controls.',
      'Interfering with or disrupting the Site, services, or networks.',
      'Scraping, rate-limiting evasion, or unauthorized commercial use of the Site.',
    ],
  },
  {
    title: 'Content',
    body: [
      'Your Content: You retain ownership of content you submit. You grant Hatch Technologies Group LLC a non-exclusive, worldwide, royalty-free license to use, host, reproduce, modify, and display your content solely to operate and improve the Site.',
      'Our Content: The Site and its materials (including text, graphics, logos, code, and designs) are owned by Hatch Technologies Group LLC or its licensors and are protected by intellectual property laws. You may not copy, distribute, or create derivative works without permission.',
    ],
  },
  {
    title: 'Payments & Refunds',
    body: [
      'Certain features are paid. Fees and billing terms are presented at purchase. Billing recurs monthly unless otherwise stated. Taxes are calculated automatically based on the ZIP code provided at checkout.',
      'Payments are non-refundable except for a one-week refund window from the date of purchase or as required by law. Canceling stops future billing but does not retroactively refund prior charges outside that window.',
    ],
  },
  {
    title: 'Third-Party Links & Services',
    body: [
      'The Site may link to or rely on third-party sites, products, or services. We do not control or endorse them and are not responsible for their content, practices, or availability. Your use of third-party services is at your own risk.',
    ],
  },
  {
    title: 'Disclaimers',
    body: [
      'The Site is provided “as is” and “as available.” To the fullest extent permitted by law, Hatch Technologies Group LLC disclaims all warranties, express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the Site will be uninterrupted, secure, or error-free.',
    ],
  },
  {
    title: 'Limitation of Liability',
    body: [
      'To the maximum extent permitted by law, Hatch Technologies Group LLC is not liable for indirect, incidental, consequential, special, or punitive damages, or for lost profits, revenue, data, or business opportunities arising from or related to your use of the Site. Our total liability for any claim is limited to the greater of (a) amounts you paid for the Site in the three months before the claim, or (b) $100.',
    ],
  },
  {
    title: 'Indemnification',
    body: [
      'You agree to indemnify and hold harmless Hatch Technologies Group LLC and its affiliates, officers, employees, and agents from any claims, damages, losses, liabilities, and expenses (including attorneys’ fees) arising from your use of the Site or violation of these Terms.',
    ],
  },
  {
    title: 'Termination',
    body: [
      'We may suspend or terminate your access at any time, including if we believe you have violated these Terms. Upon termination, your right to use the Site ends immediately. Sections relating to ownership, disclaimers, limitations of liability, and indemnification survive termination.',
    ],
  },
  {
    title: 'Changes to These Terms',
    body: [
      'We may update these Terms periodically. Changes take effect when posted on the Site. Continued use after changes are posted constitutes acceptance of the updated Terms.',
    ],
  },
  {
    title: 'Governing Law & Dispute Resolution',
    body: [
      'These Terms are governed by the laws of the State of Florida, without regard to its conflict of laws rules. Disputes will be resolved in the state or federal courts located in Florida, unless applicable law requires a different venue.',
    ],
  },
  {
    title: 'Export & Compliance',
    body: [
      'You agree to comply with all applicable export, sanctions, and compliance laws and not to use the Site in prohibited jurisdictions or for prohibited purposes.',
    ],
  },
]

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-ink-50 via-white to-brand-blue-500/15">
      <Navbar />
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <header className="space-y-3">
          <Badge
            variant="outline"
            className="border border-brand-blue-500/20 bg-white/90 text-brand-blue-700 shadow-sm shadow-brand-blue-500/10"
          >
            Legal
          </Badge>
          <h1 className="text-4xl font-semibold text-ink-900">Terms &amp; Conditions</h1>
          <p className="max-w-3xl text-lg leading-relaxed text-ink-600">
            These Terms govern your use of findyourhatch.com and services provided by Hatch Technologies Group LLC.
          </p>
          <p className="text-sm text-ink-500">Last updated: December 8, 2025</p>
        </header>

        <div className="space-y-5">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-2xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-brand-blue-500/5 backdrop-blur"
            >
              <h2 className="text-xl font-semibold text-ink-900">{section.title}</h2>
              {section.body.map((paragraph, index) => (
                <p key={`${section.title}-${index}`} className="mt-3 leading-relaxed text-ink-700">
                  {paragraph}
                </p>
              ))}
              {section.bullets && (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
                  {section.bullets.map((item, index) => (
                    <li key={`${section.title}-bullet-${index}`} className="leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <section className="rounded-2xl border border-brand-blue-500/25 bg-brand-blue-500/5 p-6 shadow-inner shadow-brand-blue-600/10">
          <h2 className="text-lg font-semibold text-brand-blue-700">Questions?</h2>
          <p className="mt-2 max-w-3xl leading-relaxed text-ink-700">
            Contact Hatch Technologies Group LLC at{' '}
            <a href="mailto:findyourhatch@gmail.com" className="text-brand-blue-700 underline">
              findyourhatch@gmail.com
            </a>{' '}
            or mail: 3309 Prince Edward Island Ci, Apt 2, Fort Myers, FL 33907.
          </p>
        </section>
      </main>
    </div>
  )
}

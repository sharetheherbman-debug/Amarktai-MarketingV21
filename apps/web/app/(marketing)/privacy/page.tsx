import { MARKETING_BRAND_NAME } from '@/lib/branding';

export default function PrivacyPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.15),transparent)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-36">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Privacy Policy
            </h1>
            <p className="mt-4 text-sm text-zinc-500">
              Last updated: January 15, 2026
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="prose prose-invert prose-zinc max-w-none">
            <div className="space-y-12 text-sm leading-relaxed text-zinc-400">
              <div>
                <p>
                  {MARKETING_BRAND_NAME} (&quot;we,&quot; &quot;our,&quot; or
                  &quot;us&quot;) is committed to protecting your privacy. This
                  Privacy Policy explains how we collect, use, disclose, and
                  safeguard your information when you use our platform and
                  services.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-bold text-white">
                  1. Information We Collect
                </h2>
                <div className="mt-4 space-y-4">
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      Account Information
                    </h3>
                    <p className="mt-2">
                      When you create an account, we collect your name, email
                      address, company name, and billing information. This
                      information is necessary to provide our services and
                      communicate with you.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      Usage Data
                    </h3>
                    <p className="mt-2">
                      We automatically collect information about how you interact
                      with our platform, including pages visited, features used,
                      actions taken, and time spent. This helps us improve our
                      services and user experience.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      Marketing Data
                    </h3>
                    <p className="mt-2">
                      When you connect third-party services (social media
                      accounts, email platforms, etc.), we access data necessary
                      to perform the marketing functions you configure. This may
                      include audience data, content performance metrics, and
                      campaign data.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      AI-Generated Content
                    </h3>
                    <p className="mt-2">
                      Content created by our AI agents is stored in your account
                      to provide our services. You retain full ownership of all
                      AI-generated content.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      Device and Log Data
                    </h3>
                    <p className="mt-2">
                      We collect device information (browser type, operating
                      system, IP address) and log data (access times, pages
                      viewed) for security and service improvement purposes.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold text-white">
                  2. How We Use Your Information
                </h2>
                <div className="mt-4 space-y-2">
                  <p>We use the information we collect to:</p>
                  <ul className="list-inside list-disc space-y-2">
                    <li>
                      Provide, maintain, and improve our AI marketing services
                    </li>
                    <li>
                      Process transactions and send related information including
                      confirmations and invoices
                    </li>
                    <li>
                      Send administrative messages, updates, and security alerts
                    </li>
                    <li>
                      Respond to your comments, questions, and customer service
                      requests
                    </li>
                    <li>
                      Monitor and analyze trends, usage, and activities in
                      connection with our services
                    </li>
                    <li>
                      Detect, investigate, and prevent fraudulent transactions
                      and other illegal activities
                    </li>
                    <li>
                      Personalize and improve your experience with our platform
                    </li>
                    <li>
                      Train and improve our AI models (only with your explicit
                      consent and using anonymized data)
                    </li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold text-white">
                  3. Data Sharing and Disclosure
                </h2>
                <div className="mt-4 space-y-4">
                  <p>
                    We do not sell your personal information. We may share your
                    information only in the following circumstances:
                  </p>
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      Service Providers
                    </h3>
                    <p className="mt-2">
                      We share data with third-party vendors who perform services
                      on our behalf, such as payment processing, data analytics,
                      email delivery, and hosting. These providers are
                      contractually obligated to protect your data.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      AI Providers
                    </h3>
                    <p className="mt-2">
                      To provide AI-powered marketing services, we process
                      certain data through GenX, the sole supported AI generation
                      provider for this release. Data sent to GenX is processed
                      in accordance with the applicable privacy terms and data
                      processing agreement.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      Legal Requirements
                    </h3>
                    <p className="mt-2">
                      We may disclose your information if required to do so by law
                      or in response to valid requests by public authorities.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      Business Transfers
                    </h3>
                    <p className="mt-2">
                      If we are involved in a merger, acquisition, or sale of
                      assets, your information may be transferred as part of that
                      transaction.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold text-white">
                  4. Data Security
                </h2>
                <p className="mt-4">
                  We implement industry-standard security measures to protect
                  your information, including:
                </p>
                <ul className="mt-4 list-inside list-disc space-y-2">
                  <li>
                    AES-256 encryption for data at rest and TLS 1.3 for data in
                    transit
                  </li>
                  <li>
                    Regular security audits and penetration testing
                  </li>
                  <li>
                    Role-based access controls and multi-factor authentication
                  </li>
                  <li>
                    SOC 2 Type II compliance (in progress)
                  </li>
                  <li>
                    Regular backups with geographic redundancy
                  </li>
                </ul>
                <p className="mt-4">
                  While we strive to protect your data, no method of transmission
                  over the Internet is 100% secure. We cannot guarantee absolute
                  security.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-bold text-white">
                  5. Your Rights
                </h2>
                <p className="mt-4">
                  Depending on your location, you may have the following rights
                  regarding your personal data:
                </p>
                <ul className="mt-4 list-inside list-disc space-y-2">
                  <li>
                    <strong className="text-white">Access:</strong> Request a
                    copy of your personal data
                  </li>
                  <li>
                    <strong className="text-white">Correction:</strong> Request
                    correction of inaccurate data
                  </li>
                  <li>
                    <strong className="text-white">Deletion:</strong> Request
                    deletion of your personal data
                  </li>
                  <li>
                    <strong className="text-white">Portability:</strong> Request
                    transfer of your data to another service
                  </li>
                  <li>
                    <strong className="text-white">Objection:</strong> Object to
                    processing of your personal data
                  </li>
                  <li>
                    <strong className="text-white">Restriction:</strong> Request
                    restriction of processing
                  </li>
                </ul>
                <p className="mt-4">
                  To exercise these rights, contact us at{' '}
                  <a
                    href="mailto:privacy@marketing.amarktai.co.za"
                    className="text-brand-400 hover:text-brand-300"
                  >
                    privacy@marketing.amarktai.co.za
                  </a>
                  .
                </p>
              </div>

              <div>
                <h2 className="text-xl font-bold text-white">
                  6. Cookies and Tracking
                </h2>
                <p className="mt-4">
                  We use cookies and similar tracking technologies to track
                  activity on our platform and hold certain information. You can
                  instruct your browser to refuse all cookies or indicate when a
                  cookie is being sent. For more details, see our{' '}
                  <a href="/cookies" className="text-brand-400 hover:text-brand-300">
                    Cookie Policy
                  </a>
                  .
                </p>
              </div>

              <div>
                <h2 className="text-xl font-bold text-white">
                  7. Children&apos;s Privacy
                </h2>
                <p className="mt-4">
                  Our services are not intended for individuals under the age of
                  18. We do not knowingly collect personal information from
                  children under 18. If we become aware that we have collected
                  personal information from a child under 18, we will take steps
                  to delete such information.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-bold text-white">
                  8. Changes to This Policy
                </h2>
                <p className="mt-4">
                  We may update this Privacy Policy from time to time. We will
                  notify you of any changes by posting the new Privacy Policy on
                  this page and updating the &quot;Last updated&quot; date. You
                  are advised to review this Privacy Policy periodically for any
                  changes.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-bold text-white">9. Contact Us</h2>
                <p className="mt-4">
                  If you have any questions about this Privacy Policy, please
                  contact us:
                </p>
                <div className="mt-4 rounded-xl border border-white/[0.06] bg-surface-100 p-4">
                  <p>
                    <strong className="text-white">Email:</strong>{' '}
                    <a
                      href="mailto:privacy@marketing.amarktai.co.za"
                      className="text-brand-400 hover:text-brand-300"
                    >
                      privacy@marketing.amarktai.co.za
                    </a>
                  </p>
                  <p className="mt-2">
                    <strong className="text-white">Address:</strong> Cape Town,
                    South Africa (Remote-first company)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

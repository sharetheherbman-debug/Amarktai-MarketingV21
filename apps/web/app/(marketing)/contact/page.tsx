'use client';

import { useState } from 'react';

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.15),transparent)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-36">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Get in <span className="text-gradient">Touch</span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-zinc-400 sm:text-xl">
              Have a question, feedback, or need help? We&apos;d love to hear
              from you.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Form & Info */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2">
            {/* Contact Form */}
            <div>
              <h2 className="text-2xl font-bold text-white">Send us a message</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Fill out the form below and we&apos;ll get back to you within
                24 hours.
              </p>
              {submitted ? (
                <div className="mt-8 rounded-2xl border border-brand-500/30 bg-brand-500/10 p-8 text-center">
                  <svg
                    className="mx-auto h-12 w-12 text-brand-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <h3 className="mt-4 text-lg font-semibold text-white">
                    Message Sent!
                  </h3>
                  <p className="mt-2 text-sm text-zinc-400">
                    Thank you for reaching out. We&apos;ll get back to you
                    within 24 hours.
                  </p>
                </div>
              ) : (
                <form
                  className="mt-8 space-y-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSubmitted(true);
                  }}
                >
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="name"
                        className="block text-sm font-medium text-zinc-300"
                      >
                        Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        required
                        className="mt-2 block h-11 w-full rounded-lg border border-white/[0.06] bg-surface-100 px-4 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="email"
                        className="block text-sm font-medium text-zinc-300"
                      >
                        Email
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        className="mt-2 block h-11 w-full rounded-lg border border-white/[0.06] bg-surface-100 px-4 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        placeholder="you@company.com"
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="subject"
                      className="block text-sm font-medium text-zinc-300"
                    >
                      Subject
                    </label>
                    <select
                      id="subject"
                      name="subject"
                      className="mt-2 block h-11 w-full rounded-lg border border-white/[0.06] bg-surface-100 px-4 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="">Select a subject</option>
                      <option value="general">General Inquiry</option>
                      <option value="support">Technical Support</option>
                      <option value="sales">Sales & Enterprise</option>
                      <option value="partnership">Partnership</option>
                      <option value="feedback">Feedback</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="message"
                      className="block text-sm font-medium text-zinc-300"
                    >
                      Message
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      rows={5}
                      required
                      className="mt-2 block w-full rounded-lg border border-white/[0.06] bg-surface-100 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="How can we help?"
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-8 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
                  >
                    Send Message
                  </button>
                </form>
              )}
            </div>

            {/* Contact Info */}
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  Contact Information
                </h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Reach out through any of these channels.
                </p>
              </div>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400">
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-white">Email</h3>
                    <a
                      href="mailto:hello@marketing.amarktai.co.za"
                      className="mt-1 text-sm text-zinc-400 transition-colors hover:text-brand-400"
                    >
                      hello@marketing.amarktai.co.za
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400">
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-white">Address</h3>
                    <p className="mt-1 text-sm text-zinc-400">
                      Cape Town, South Africa
                    </p>
                    <p className="text-sm text-zinc-500">
                      (Remote-first company)
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400">
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 003 12c0-1.605.42-3.113 1.157-4.418"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-white">Social</h3>
                    <div className="mt-2 flex gap-3">
                      <a
                        href="#"
                        className="text-zinc-500 transition-colors hover:text-white"
                        aria-label="Twitter"
                      >
                        <svg
                          className="h-5 w-5"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      </a>
                      <a
                        href="#"
                        className="text-zinc-500 transition-colors hover:text-white"
                        aria-label="LinkedIn"
                      >
                        <svg
                          className="h-5 w-5"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                        </svg>
                      </a>
                      <a
                        href="#"
                        className="text-zinc-500 transition-colors hover:text-white"
                        aria-label="GitHub"
                      >
                        <svg
                          className="h-5 w-5"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Enterprise */}
              <div className="rounded-2xl border border-white/[0.06] bg-surface-100 p-6">
                <h3 className="text-lg font-semibold text-white">
                  Enterprise Inquiries
                </h3>
                <p className="mt-2 text-sm text-zinc-400">
                  Looking for a custom solution? Our enterprise team can help
                  with custom integrations, dedicated support, SLA guarantees,
                  and on-premise deployments.
                </p>
                <a
                  href="mailto:enterprise@marketing.amarktai.co.za"
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-400 transition-colors hover:text-brand-300"
                >
                  enterprise@marketing.amarktai.co.za
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                    />
                  </svg>
                </a>
              </div>

              {/* Support */}
              <div className="rounded-2xl border border-white/[0.06] bg-surface-100 p-6">
                <h3 className="text-lg font-semibold text-white">Support</h3>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-brand-400" />
                    <span className="text-sm text-zinc-300">
                      <strong className="text-white">Starter:</strong> Email
                      support within 24 hours
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-brand-400" />
                    <span className="text-sm text-zinc-300">
                      <strong className="text-white">Professional:</strong>{' '}
                      Priority support within 4 hours
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-brand-400" />
                    <span className="text-sm text-zinc-300">
                      <strong className="text-white">Enterprise:</strong>{' '}
                      Dedicated support with SLA
                    </span>
                  </div>
                </div>
                <a
                  href="mailto:support@marketing.amarktai.co.za"
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-400 transition-colors hover:text-brand-300"
                >
                  support@marketing.amarktai.co.za
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                    />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

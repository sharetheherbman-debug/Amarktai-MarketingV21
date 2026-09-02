import type { CSSProperties } from 'react';
import type { Metadata, Viewport } from 'next';
import {
  MARKETING_BRAND_ACCENT_COLOR,
  MARKETING_BRAND_DESCRIPTION,
  MARKETING_BRAND_NAME,
  MARKETING_BRAND_PRIMARY_COLOR,
  MARKETING_PUBLIC_URL,
} from '@/lib/branding';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(MARKETING_PUBLIC_URL),
  title: MARKETING_BRAND_NAME,
  description: MARKETING_BRAND_DESCRIPTION,
  keywords: ['AI marketing', 'marketing automation', 'campaign management', 'analytics'],
  authors: [{ name: MARKETING_BRAND_NAME }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: MARKETING_BRAND_NAME,
    title: MARKETING_BRAND_NAME,
    description: MARKETING_BRAND_DESCRIPTION,
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: MARKETING_BRAND_NAME,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: MARKETING_BRAND_NAME,
    description: MARKETING_BRAND_DESCRIPTION,
    images: ['/og-image.png'],
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: MARKETING_BRAND_PRIMARY_COLOR,
  width: 'device-width',
  initialScale: 1,
};

const themeScript = `
  (function() {
    try {
      var stored = JSON.parse(localStorage.getItem('ui-storage'));
      var theme = stored?.state?.theme || 'dark';
      var root = document.documentElement;
      if (theme === 'system') {
        var sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.classList.add(sys);
      } else {
        root.classList.add(theme);
      }
    } catch(e) {
      document.documentElement.classList.add('dark');
    }
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className="font-sans antialiased bg-[var(--color-bg)] text-[var(--color-text)]"
        style={{
          '--ep-navy': MARKETING_BRAND_PRIMARY_COLOR,
          '--ep-blue': MARKETING_BRAND_ACCENT_COLOR,
        } as CSSProperties}
      >
        {children}
      </body>
    </html>
  );
}

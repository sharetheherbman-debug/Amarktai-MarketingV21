import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'AmarktAI Marketing - AI Marketing Operating System',
  description:
    'Transform your marketing with AI-powered automation, analytics, and campaign management. The complete marketing operating system for modern businesses.',
  keywords: ['AI marketing', 'marketing automation', 'campaign management', 'analytics'],
  authors: [{ name: 'AmarktAI' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://marketing.amarktai.co.za',
    siteName: 'AmarktAI Marketing',
    title: 'AmarktAI Marketing - AI Marketing Operating System',
    description:
      'Transform your marketing with AI-powered automation, analytics, and campaign management.',
    images: [
      {
        url: 'https://marketing.amarktai.co.za/og-image.png',
        width: 1200,
        height: 630,
        alt: 'AmarktAI Marketing',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AmarktAI Marketing - AI Marketing Operating System',
    description:
      'Transform your marketing with AI-powered automation, analytics, and campaign management.',
    images: ['https://marketing.amarktai.co.za/og-image.png'],
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#050505',
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
        className={`${inter.variable} font-sans antialiased bg-[var(--color-bg)] text-[var(--color-text)]`}
      >
        {children}
      </body>
    </html>
  );
}

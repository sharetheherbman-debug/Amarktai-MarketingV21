import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EquiProfile Marketing',
  description:
    'Transform your marketing with AI-powered automation, analytics, and campaign management. The complete marketing operating system for modern businesses.',
  keywords: ['AI marketing', 'marketing automation', 'campaign management', 'analytics'],
  authors: [{ name: 'EquiProfile' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://marketing.equiprofile.online',
    siteName: 'EquiProfile Marketing',
    title: 'EquiProfile Marketing',
    description:
      'Transform your marketing with AI-powered automation, analytics, and campaign management.',
    images: [
      {
        url: 'https://marketing.equiprofile.online/og-image.png',
        width: 1200,
        height: 630,
        alt: 'EquiProfile Marketing',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EquiProfile Marketing',
    description:
      'Transform your marketing with AI-powered automation, analytics, and campaign management.',
    images: ['https://marketing.equiprofile.online/og-image.png'],
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#f8f6f3',
  width: 'device-width',
  initialScale: 1,
};

const themeScript = `
  (function() {
    try {
      var stored = JSON.parse(localStorage.getItem('ui-storage'));
      var theme = stored?.state?.theme || 'light';
      var root = document.documentElement;
      if (theme === 'system') {
        var sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.classList.add(sys);
      } else {
        root.classList.add(theme);
      }
    } catch(e) {
      document.documentElement.classList.add('light');
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
      >
        {children}
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import './globals.css';

const BRAND_ICON = 'https://equiprofile.online/favicon.svg';

export const metadata: Metadata = {
  title: {
    default: 'EquiProfile Marketing',
    template: '%s · EquiProfile Marketing',
  },
  description: 'EquiProfile Marketing — business intelligence, campaign strategy, content production, publishing and optimisation in one governed marketing workspace.',
  authors: [{ name: 'EquiProfile' }],
  openGraph: {
    type: 'website',
    locale: 'en_ZA',
    url: 'https://marketing.equiprofile.online',
    siteName: 'EquiProfile Marketing',
    title: 'EquiProfile Marketing',
    description: 'The EquiProfile marketing operating system for planning, creating, governing, publishing and improving customer marketing.',
  },
  icons: {
    icon: [{ url: BRAND_ICON, type: 'image/svg+xml' }],
    shortcut: BRAND_ICON,
    apple: BRAND_ICON,
  },
};

export const viewport: Viewport = {
  themeColor: '#052b57',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body className="font-sans antialiased bg-[var(--ep-page)] text-[var(--ep-text)]">
        {children}
      </body>
    </html>
  );
}

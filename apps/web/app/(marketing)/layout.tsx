import type { Metadata } from 'next';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: {
    default: 'AmarktAI Marketing - AI Marketing Operating System',
    template: '%s | AmarktAI Marketing',
  },
  description:
    'Deploy an autonomous AI workforce that creates content, manages campaigns, optimizes SEO, and grows your business — all from one platform.',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'AmarktAI Marketing',
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}

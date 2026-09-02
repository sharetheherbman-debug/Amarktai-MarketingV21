import type { Metadata } from 'next';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MARKETING_BRAND_DESCRIPTION, MARKETING_BRAND_NAME } from '@/lib/branding';

export const metadata: Metadata = {
  title: {
    default: `${MARKETING_BRAND_NAME} - Autonomous Growth Operating System`,
    template: `%s | ${MARKETING_BRAND_NAME}`,
  },
  description: MARKETING_BRAND_DESCRIPTION,
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: MARKETING_BRAND_NAME,
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

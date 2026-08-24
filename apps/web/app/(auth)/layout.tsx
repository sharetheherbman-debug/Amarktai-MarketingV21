import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MARKETING_BRAND_DESCRIPTION,
  MARKETING_BRAND_LOGO_URL,
  MARKETING_BRAND_NAME,
  MARKETING_HOST_APPLICATION_NAME,
} from '@/lib/branding';

export const metadata: Metadata = {
  title: {
    default: MARKETING_BRAND_NAME,
    template: `%s | ${MARKETING_BRAND_NAME}`,
  },
  description: `Secure access to ${MARKETING_BRAND_NAME}. ${MARKETING_BRAND_DESCRIPTION}`,
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#050505] px-4 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.12),transparent)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="relative z-10 w-full max-w-[440px]">
        <div className="mb-8 flex justify-center">
          <Link href="/login" className="flex items-center gap-2">
            <img src={MARKETING_BRAND_LOGO_URL} alt="" className="h-10 w-10 rounded-lg object-contain" />
            <span className="text-xl font-bold text-white">{MARKETING_BRAND_NAME}</span>
          </Link>
        </div>
        {children}
        <p className="mt-6 text-center text-xs text-zinc-600">
          {MARKETING_BRAND_NAME} · Connected to {MARKETING_HOST_APPLICATION_NAME}
        </p>
      </div>
    </div>
  );
}

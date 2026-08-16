import { redirect } from 'next/navigation';

/** Phase 1 owners are provisioned by the signed host-application connector. */
export default function OnboardingPage() {
  redirect('/login');
}

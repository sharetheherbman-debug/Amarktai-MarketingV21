import { redirect } from 'next/navigation';

/**
 * Legacy customer onboarding entrypoint.
 *
 * Infrastructure/bootstrap onboarding remains API-internal. Customer business
 * onboarding now lives in the authenticated Business Brain workspace.
 */
export default function OnboardingPage() {
  redirect('/business-brain');
}

import { redirect } from 'next/navigation';

/** Legacy internal/customer URL. Connections is now the single customer route. */
export default function LegacyIntegrationsPage() {
  redirect('/connections');
}

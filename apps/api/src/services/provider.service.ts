import { providerRouter } from '../providers/provider-router';
import type { ProviderHealth } from '../types';

/**
 * Read-only GenX runtime facade.
 * Provider credentials and selection are environment-owned and cannot be
 * created, updated, toggled, tested with browser keys, or deleted through the
 * application service layer.
 */
export async function healthCheck(): Promise<ProviderHealth[]> {
  return providerRouter.getHealthStatus();
}

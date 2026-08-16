import { StripeEvent } from './stripe-client.service';
import { processMarketplaceStripeEvent } from './marketplace-payment.service';
import { processGenerationCreditStripeEvent } from './generation-credit-stripe.service';
import {
  claimStripeEvent,
  completeStripeEvent,
  failStripeEvent,
  processBillingStripeEvent,
} from './billing-stripe.service';

export async function processStripeEvent(event: StripeEvent): Promise<void> {
  if (!await claimStripeEvent(event)) return;
  try {
    await processMarketplaceStripeEvent(event);
    await processGenerationCreditStripeEvent(event);
    await processBillingStripeEvent(event);
    await completeStripeEvent(event.id);
  } catch (error) {
    await failStripeEvent(event.id, error);
    throw error;
  }
}

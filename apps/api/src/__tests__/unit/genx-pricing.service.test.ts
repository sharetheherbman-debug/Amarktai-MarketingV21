jest.mock('../../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));

import { query } from '../../config/database';
import {
  extractPriceComponents,
  quoteGeneration,
  retailFromWholesale,
  tokenQuantityForBillingUnit,
} from '../../services/genx-pricing.service';
import type { GenXModel } from '../../services/genx-model-registry.service';

const mockedQuery = query as jest.MockedFunction<typeof query>;

describe('GenX pricing service', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  test('prefers explicit agent-tier image pricing', () => {
    const model: GenXModel = {
      id: 'image-model',
      name: 'Image model',
      category: 'image',
      operations: ['text_to_image'],
      raw_metadata: {
        currency: 'USD',
        agent_tier: true,
        agent_price_per_image: 0.06,
        price_per_image: 0.10,
      },
    };

    expect(extractPriceComponents(model)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'text_to_image',
        billableUnit: 'image',
        sourceCurrency: 'USD',
        sourceUnitCost: 0.06,
        agentTierApplied: true,
      }),
    ]));
  });

  test('extracts separate input and output token prices', () => {
    const model: GenXModel = {
      id: 'text-model',
      name: 'Text model',
      category: 'text',
      operations: ['text_generation'],
      raw_metadata: {
        pricing: {
          currency: 'USD',
          unit: 'million_tokens',
          input: 0.20,
          output: 0.80,
        },
      },
    };

    const prices = extractPriceComponents(model);
    expect(prices).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: 'text_input', billableUnit: 'million_tokens', sourceUnitCost: 0.20 }),
      expect.objectContaining({ operation: 'text_output', billableUnit: 'million_tokens', sourceUnitCost: 0.80 }),
    ]));
  });

  test('rejects ambiguous metadata that has no billable unit', () => {
    const model: GenXModel = {
      id: 'ambiguous-model',
      name: 'Ambiguous model',
      category: 'video',
      operations: ['text_to_video'],
      raw_metadata: { pricing: { amount: 1.25, currency: 'USD' } },
    };

    expect(extractPriceComponents(model)).toEqual([]);
  });

  test('calculates a true 40 percent gross margin', () => {
    const retail = retailFromWholesale(0.60, 4000);
    expect(retail).toBeCloseTo(1.00, 8);
    expect((retail - 0.60) / retail).toBeCloseTo(0.40, 8);
  });

  test('normalizes raw token usage to the provider catalogue billing unit', () => {
    expect(tokenQuantityForBillingUnit(2_500, 'thousand_tokens')).toBe(2.5);
    expect(tokenQuantityForBillingUnit(250_000, 'million_tokens')).toBe(0.25);
    expect(tokenQuantityForBillingUnit(100, 'request')).toBe(1);
    expect(() => tokenQuantityForBillingUnit(100, 'mystery_unit')).toThrow('Unsupported text billing unit');
  });

  test('uses the last authenticated pricing sync for freshness without rotating an unchanged snapshot', async () => {
    const oldEffectiveFrom = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const freshSync = new Date();
    mockedQuery.mockResolvedValueOnce({
      rows: [{
        id: '00000000-0000-0000-0000-000000000001',
        model_id: 'image-model',
        operation: 'text_to_image',
        billable_unit: 'image',
        wholesale_unit_cost_gbp: 0.10,
        retail_unit_cost_gbp: 0.20,
        target_margin_bps: 4000,
        effective_from: oldEffectiveFrom,
        retail_enabled: true,
        pricing_status: 'priced',
        pricing_last_synced_at: freshSync,
      }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    } as any);

    const quote = await quoteGeneration({
      modelId: 'image-model',
      operation: 'text_to_image',
      quantity: 1,
    });

    expect(quote.model_id).toBe('image-model');
    expect(quote.price_effective_from).toBe(oldEffectiveFrom.toISOString());
    expect(quote.reservation_credits).toBeGreaterThan(0);
  });
});
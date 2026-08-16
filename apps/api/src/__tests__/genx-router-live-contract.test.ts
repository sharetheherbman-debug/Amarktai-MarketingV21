import { GenXMultimodalProvider } from '../providers/genx-multimodal.provider';
import { extractAccountPriceComponents } from '../services/genx-pricing.service';
import type { GenXModel } from '../services/genx-model-registry.service';

describe('GenX Router live contract', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('string catalogue IDs are enriched from model detail responses', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(['genxlm-pro-v1-img']), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        model: 'genxlm-pro-v1-img',
        name: 'GenX LM Pro v1 IMG',
        category: 'image',
        provider: 'genx-pro',
        is_active: 1,
        retired_at: null,
      }), { status: 200 }));

    const provider = new GenXMultimodalProvider();
    const models = await provider.listModels('image');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: 'genxlm-pro-v1-img',
      name: 'GenX LM Pro v1 IMG',
      category: 'image',
      vendor: 'genx-pro',
      available: true,
      deprecated: false,
    });
  });

  test('inactive Router detail records are not offered as available', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(['retired-image-model']), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        model: 'retired-image-model',
        name: 'Retired Image Model',
        category: 'image',
        provider: 'example',
        is_active: 0,
        retired_at: '2026-08-01T00:00:00Z',
      }), { status: 200 }));

    const provider = new GenXMultimodalProvider();
    const models = await provider.listModels('image');

    expect(models[0].available).toBe(false);
    expect(models[0].deprecated).toBe(true);
  });

  test('authenticated account pricing keeps credits and mcredits intact', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify([
      {
        model: 'genxlm-pro-v1-img',
        name: 'GenX LM Pro v1 IMG',
        category: 'image',
        provider: 'genx-pro',
        billing_mode: 'usage',
        pricing: [
          { metric: 'image', unit_quantity: 1, credits: 11.7, mcredits: 11700 },
        ],
      },
    ]), { status: 200 }));

    const provider = new GenXMultimodalProvider();
    const pricing = await provider.listAccountPricing('image');

    expect(pricing).toHaveLength(1);
    expect(pricing[0].model).toBe('genxlm-pro-v1-img');
    expect(pricing[0].pricing[0]).toEqual({
      metric: 'image',
      unit_quantity: 1,
      credits: 11.7,
      mcredits: 11700,
    });
  });

  test('account rate-card credits convert to USD wholesale units before GBP conversion', () => {
    const model: GenXModel = {
      id: 'claude-fable-5',
      name: 'Claude Fable 5',
      category: 'text',
      operations: ['text_generation'],
    };
    const components = extractAccountPriceComponents(model, {
      model: 'claude-fable-5',
      name: 'Claude Fable 5',
      category: 'text',
      provider: 'anthropic',
      billing_mode: 'usage',
      pricing: [
        { metric: 'input_tokens', unit_quantity: 1_000_000, credits: 1170, mcredits: 1_170_000 },
        { metric: 'output_tokens', unit_quantity: 1_000_000, credits: 5850, mcredits: 5_850_000 },
      ],
      raw: {},
    });

    expect(components).toHaveLength(2);
    expect(components[0]).toMatchObject({
      operation: 'text_input',
      billableUnit: 'million_tokens',
      sourceCurrency: 'USD',
      sourceUnitCost: 11.7,
    });
    expect(components[1]).toMatchObject({
      operation: 'text_output',
      billableUnit: 'million_tokens',
      sourceCurrency: 'USD',
      sourceUnitCost: 58.5,
    });
  });

  test('inconsistent credits and mcredits are rejected instead of guessed', () => {
    const model: GenXModel = {
      id: 'example-image',
      name: 'Example Image',
      category: 'image',
      operations: ['text_to_image'],
    };

    expect(() => extractAccountPriceComponents(model, {
      model: 'example-image',
      name: 'Example Image',
      category: 'image',
      provider: 'example',
      pricing: [
        { metric: 'image', unit_quantity: 1, credits: 10, mcredits: 9999 },
      ],
      raw: {},
    })).toThrow('GenX credits and mcredits disagree');
  });

  test('unknown pricing metrics remain unpriced rather than being guessed', () => {
    const model: GenXModel = {
      id: 'future-model',
      name: 'Future Model',
      category: 'video',
      operations: ['text_to_video'],
    };
    const components = extractAccountPriceComponents(model, {
      model: 'future-model',
      name: 'Future Model',
      category: 'video',
      pricing: [
        { metric: 'future_unknown_metric', unit_quantity: 1, credits: 10, mcredits: 10000 },
      ],
      raw: {},
    });

    expect(components).toEqual([]);
  });
});

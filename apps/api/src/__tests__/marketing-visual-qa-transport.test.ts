import os from 'os';
import path from 'path';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { assessMarketingIngredient } from '../services/marketing-visual-qa.service';

const accepted = {
  subject_relevance: 90, campaign_relevance: 90, commercial_usability: 90,
  composition_quality: 80, subject_integrity: 90, negative_space_usability: 80,
  unexpected_text: false, unexpected_logo: false, watermark: false,
  obvious_ai_artifacts: false, wrong_product: false, wrong_subject: false,
  brand_safety: true, rejection_reasons: [], repair_instructions: [],
};

const inputFor = (ingredientPath: string) => ({
  ingredientPath,
  brief: { objective: 'Promote professional horse care', audience: 'Owners', cta: 'Explore' },
  technicalQa: { format: 'png', width: 1080, height: 1920 },
});

function genxResponse(assessment: Record<string, unknown> = accepted) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify({
      choices: [{ message: { content: JSON.stringify(assessment) } }],
    }),
  } as Response;
}

describe('Marketing visual QA GenX multimodal chat transport', () => {
  let directory: string;
  let ingredientPath: string;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'marketing-visual-qa-'));
    ingredientPath = path.join(directory, 'ingredient.png');
    await writeFile(ingredientPath, 'fixture-image-bytes');
    delete process.env.MARKETING_VISUAL_QA_MODE;
    process.env.MARKETING_VISUAL_QA_MODEL = 'gemini-3-flash';
    jest.restoreAllMocks();
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    delete process.env.MARKETING_VISUAL_QA_MODEL;
    await rm(directory, { recursive: true, force: true });
  });

  it('sends a trusted local ingredient directly to GenX multimodal chat and never uses the document file boundary', async () => {
    const fetchMock = jest.fn().mockResolvedValue(genxResponse());
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(assessMarketingIngredient(inputFor(ingredientPath)))
      .resolves.toMatchObject({ accepted: true, review_mode: 'genx_multimodal' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/chat/completions');
    expect(url).not.toContain('/api/v1/files');

    const body = JSON.parse(String(options.body || '{}'));
    expect(body.model).toBe('gemini-3-flash');
    expect(body.stream).toBe(false);
    expect(body.messages).toHaveLength(2);
    const imagePart = body.messages[1].content.find((part: Record<string, unknown>) => part.type === 'image_url');
    expect(String(imagePart?.image_url?.url || '')).toMatch(/^data:image\/png;base64,/);
    expect(JSON.stringify(body)).not.toContain('file://');
    expect(JSON.stringify(body)).not.toContain('/api/v1/studio/assets/');
  });

  it('returns accepted and rejected semantic outcomes from the same strict validated contract', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(genxResponse())
      .mockResolvedValueOnce(genxResponse({
        ...accepted,
        wrong_subject: true,
        rejection_reasons: ['wrong subject'],
        repair_instructions: ['Use the approved horse-care subject.'],
      }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(assessMarketingIngredient(inputFor(ingredientPath)))
      .resolves.toMatchObject({ accepted: true });
    await expect(assessMarketingIngredient(inputFor(ingredientPath)))
      .resolves.toMatchObject({ accepted: false, rejection_reasons: expect.arrayContaining(['wrong subject']) });
  });

  it('fails closed and never marks a provider or parsing failure as accepted', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Unavailable',
      text: async () => JSON.stringify({ error: { message: 'provider unavailable' } }),
    } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(assessMarketingIngredient(inputFor(ingredientPath)))
      .rejects.toMatchObject({ code: 'MATERIAL_VISUAL_QA_PROVIDER_UNAVAILABLE' });
  });

  it('retains fixture mode without calling GenX', async () => {
    process.env.MARKETING_VISUAL_QA_MODE = 'fixture';
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(assessMarketingIngredient(inputFor(ingredientPath)))
      .resolves.toMatchObject({ accepted: true, review_mode: 'fixture_contract' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

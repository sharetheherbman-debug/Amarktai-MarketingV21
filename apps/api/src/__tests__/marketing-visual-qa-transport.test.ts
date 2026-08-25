import os from 'os';
import path from 'path';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { assessMarketingIngredient } from '../services/marketing-visual-qa.service';
import { genxMultimodalProvider } from '../providers/genx-multimodal.provider';

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

describe('Marketing visual QA provider file transport', () => {
  let directory: string;
  let ingredientPath: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'marketing-visual-qa-'));
    ingredientPath = path.join(directory, 'ingredient.png');
    await writeFile(ingredientPath, 'fixture-image-bytes');
    delete process.env.MARKETING_VISUAL_QA_MODE;
    jest.restoreAllMocks();
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('uploads a trusted local ingredient, assesses by temporary file ID, and cleans it up', async () => {
    const upload = jest.spyOn(genxMultimodalProvider, 'uploadFile').mockResolvedValue({
      id: 'temporary-provider-file', filename: 'ingredient.png', mime_type: 'image/png', size: 20, created_at: new Date().toISOString(),
    });
    const assess = jest.spyOn(genxMultimodalProvider, 'assessVisual').mockResolvedValue(accepted);
    const cleanup = jest.spyOn(genxMultimodalProvider, 'deleteFile').mockResolvedValue();

    await expect(assessMarketingIngredient(inputFor(ingredientPath))).resolves.toMatchObject({ accepted: true, review_mode: 'genx_multimodal' });
    expect(upload).toHaveBeenCalledWith(ingredientPath, expect.stringContaining('marketing-qa-ingredient.png'), 'image/png');
    expect(assess).toHaveBeenCalledWith(expect.objectContaining({ file_id: 'temporary-provider-file' }));
    expect(JSON.stringify(assess.mock.calls[0][0])).not.toContain('file://');
    expect(JSON.stringify(assess.mock.calls[0][0])).not.toContain('/api/v1/studio/assets/');
    expect(cleanup).toHaveBeenCalledWith('temporary-provider-file');
  });

  it('returns accepted and rejected semantic outcomes from the validated provider contract', async () => {
    jest.spyOn(genxMultimodalProvider, 'uploadFile').mockResolvedValue({ id: 'temp-file', filename: 'x.png', mime_type: 'image/png', size: 1, created_at: '' });
    jest.spyOn(genxMultimodalProvider, 'deleteFile').mockResolvedValue();
    jest.spyOn(genxMultimodalProvider, 'assessVisual').mockResolvedValueOnce(accepted).mockResolvedValueOnce({
      ...accepted, wrong_subject: true, rejection_reasons: ['wrong subject'], repair_instructions: ['Use the approved horse-care subject.'],
    });

    await expect(assessMarketingIngredient(inputFor(ingredientPath))).resolves.toMatchObject({ accepted: true });
    await expect(assessMarketingIngredient(inputFor(ingredientPath))).resolves.toMatchObject({ accepted: false, rejection_reasons: expect.arrayContaining(['wrong subject']) });
  });

  it('fails closed and never marks a provider failure as accepted', async () => {
    jest.spyOn(genxMultimodalProvider, 'uploadFile').mockRejectedValue(new Error('provider unavailable'));
    await expect(assessMarketingIngredient(inputFor(ingredientPath))).rejects.toMatchObject({ code: 'MATERIAL_VISUAL_QA_PROVIDER_UNAVAILABLE' });
  });

  it('retains fixture mode without calling the provider file transport', async () => {
    process.env.MARKETING_VISUAL_QA_MODE = 'fixture';
    const upload = jest.spyOn(genxMultimodalProvider, 'uploadFile');
    await expect(assessMarketingIngredient(inputFor(ingredientPath))).resolves.toMatchObject({ accepted: true, review_mode: 'fixture_contract' });
    expect(upload).not.toHaveBeenCalled();
  });
});

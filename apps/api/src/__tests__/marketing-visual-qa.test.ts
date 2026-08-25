import { validateMarketingVisualQa } from '../services/marketing-visual-qa.service';

const accepted = {
  subject_relevance: 90,
  campaign_relevance: 90,
  commercial_usability: 88,
  composition_quality: 85,
  subject_integrity: 92,
  negative_space_usability: 78,
  unexpected_text: false,
  unexpected_logo: false,
  watermark: false,
  obvious_ai_artifacts: false,
  wrong_product: false,
  wrong_subject: false,
  brand_safety: true,
  rejection_reasons: [],
  repair_instructions: [],
};

describe('Marketing multimodal visual QA contract', () => {
  it('accepts a complete threshold-compliant assessment', () => {
    expect(validateMarketingVisualQa(accepted)).toMatchObject({
      accepted: true,
      review_mode: 'genx_multimodal',
      rejection_reasons: [],
    });
  });

  it('fails a technically well-formed but commercially unsafe assessment with repair guidance', () => {
    const qa = validateMarketingVisualQa({
      ...accepted,
      campaign_relevance: 62,
      unexpected_text: true,
      rejection_reasons: ['rendered gibberish text'],
      repair_instructions: ['Regenerate without any rendered text and use a horse-care setting relevant to the approved offer.'],
    });
    expect(qa.accepted).toBe(false);
    expect(qa.rejection_reasons).toEqual(expect.arrayContaining([
      'rendered gibberish text',
      'campaign_relevance below 80',
      'unexpected generated text',
    ]));
    expect(qa.repair_instructions[0]).toContain('Regenerate without any rendered text');
  });

  it('fails closed when the provider omits a structured required field', () => {
    const malformed = { ...accepted } as Record<string, unknown>;
    delete malformed.subject_integrity;
    expect(() => validateMarketingVisualQa(malformed)).toThrow('invalid subject_integrity score');
  });

  it('fails closed for non-boolean critical flags', () => {
    expect(() => validateMarketingVisualQa({ ...accepted, watermark: 'false' })).toThrow('invalid watermark flag');
  });
});

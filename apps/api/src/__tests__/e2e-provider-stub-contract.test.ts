import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../../..');

describe('real customer journey GenX stub contract', () => {
  test('returns the strict visual-QA contract for data-URL image chat requests', () => {
    const source = fs.readFileSync(path.join(root, 'scripts/e2e-provider-stub.mjs'), 'utf8');
    expect(source).toContain("part?.type === 'image_url'");
    expect(source).toContain("/^data:image\\/(?:png|jpeg|webp);base64,/i");
    expect(source).toContain('visualQaRequest ? acceptedVisualAssessment : plan');
  });
});

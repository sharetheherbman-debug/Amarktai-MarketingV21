import fs from 'fs';
import path from 'path';

describe('long-form storyboard provider boundary', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../routes/longform-production.ts'),
    'utf8',
  );

  test('uses GenX and never substitutes fabricated storyboard output', () => {
    expect(source).toContain('genxMultimodalProvider.generate');
    expect(source).toContain("code: 'AI_PROVIDER_UNAVAILABLE'");
    expect(source).toContain('The project was not changed');
    expect(source).not.toContain('fallbackStoryboard');
    expect(source).not.toContain('deterministic_fallback');
  });
});

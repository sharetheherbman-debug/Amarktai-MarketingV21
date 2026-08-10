import fs from 'fs';
import path from 'path';

const repositoryRoot = path.resolve(__dirname, '..', '..', '..', '..');
const preflight = fs.readFileSync(
  path.resolve(repositoryRoot, 'scripts/vps-preflight.sh'),
  'utf8'
);

describe('GenX VPS preflight pricing contract', () => {
  test('catalogued models with no account pricing remain disabled instead of aborting the whole category', () => {
    expect(preflight).toContain("if prices is None or prices == []:");
    expect(preflight).toContain('unpriced_models.append(model_id)');
    expect(preflight).toContain('will remain retail-disabled');
    expect(preflight).not.toContain('account pricing contains a model without pricing rows');
  });

  test('preflight still rejects a category with no safely billable models', () => {
    expect(preflight).toContain('if priced_models == 0 or price_count == 0:');
    expect(preflight).toContain('account pricing contains no safely billable models');
  });

  test('populated price rows remain strictly validated', () => {
    expect(preflight).toContain('account pricing contains a row without metric');
    expect(preflight).toContain('account pricing contains invalid numeric values');
    expect(preflight).toContain('account pricing credits/mcredits mismatch');
    expect(preflight).toContain('non-array pricing contract');
  });
});

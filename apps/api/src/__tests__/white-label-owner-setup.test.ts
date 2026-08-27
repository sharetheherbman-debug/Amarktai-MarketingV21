import fs from 'fs';
import path from 'path';
import { resolveBrandIdentityFromConfig } from '../services/marketing-material-compositor.service';

describe('owner white-label setup contract', () => {
  const root = path.resolve(__dirname, '../../../..');
  const page = fs.readFileSync(path.join(root, 'apps/web/app/(dashboard)/settings/page.tsx'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'apps/api/src/services/white-label.service.ts'), 'utf8');
  const material = fs.readFileSync(path.join(root, 'apps/api/src/services/marketing-material-compositor.service.ts'), 'utf8');

  it('offers one previewable owner workflow for identity, logo, colours, typography and domain state', () => {
    for (const text of ['Brand name','Support email','Brand logo','Primary colour','Accent colour','Brand typography','Preview before save','DNS:','SSL:']) {
      expect(page).toContain(text);
    }
    expect(page).toContain('Explicit workspace settings take priority, then Business Brain Brand DNA');
    expect(page).toContain('resolveBrandAssetUrl(brandLogo)');
    expect(page).toContain("value.slice('/api/v1'.length)");
  });

  it('validates logo ownership/public URL safety and never performs an unscoped tenant asset lookup', () => {
    expect(service).toContain('validatePublicHttpUrl');
    expect(service).toContain('safeFetch');
    expect(service).toContain('id=$1 AND organization_id=$2');
    expect(service).not.toMatch(/SELECT 1 FROM studio_assets WHERE id=\$1\s+AND deleted_at/);
  });

  it('uses explicit white-label values before Brand DNA without EquiProfile hard-coding', () => {
    expect(material).toContain('whiteLabelConfig.brand_name || dna?.company_name');
    expect(material).toContain('whiteLabelConfig.brand_logo || dna?.logo_url');
    expect(material).not.toContain('EquiProfile');
  });

  it('resolves AmarktAI, EquiProfile and a third tenant distinctly from the same engine', () => {
    const tenants = [
      { name: 'AmarktAI Marketing', logo: '/api/v1/studio/assets/10000000-0000-4000-8000-000000000001', primary: '#0A1B3F', accent: '#5AA469', font: 'Inter' },
      { name: 'EquiProfile Marketing', logo: '/api/v1/studio/assets/20000000-0000-4000-8000-000000000002', primary: '#2456A6', accent: '#D4A72C', font: 'Georgia' },
      { name: 'Northstar Growth', logo: '/api/v1/studio/assets/30000000-0000-4000-8000-000000000003', primary: '#6B2D5C', accent: '#2AA198', font: 'Arial' },
    ].map((tenant) => resolveBrandIdentityFromConfig({
      brand_name: tenant.name,
      brand_logo: tenant.logo,
      brand_colors: { primary: tenant.primary, accent: tenant.accent },
      brand_font: tenant.font,
    }, { company_name: 'Brand DNA fallback', logo_url: '/fallback.svg', colors: { primary: '#111111' } }));

    expect(new Set(tenants.map((tenant) => JSON.stringify([tenant.name, tenant.logoUrl, tenant.primary, tenant.accent, tenant.font]))).size).toBe(3);
    expect(tenants.map((tenant) => tenant.name)).toEqual(['AmarktAI Marketing', 'EquiProfile Marketing', 'Northstar Growth']);
  });
});

import fs from 'fs';import path from 'path';
const root=path.resolve(__dirname,'../../../..');const read=(file:string)=>fs.readFileSync(path.join(root,file),'utf8');

describe('Marketing Library integration and tenant boundary contract',()=>{
  const library=read('apps/api/src/services/marketing-library.service.ts');
  const content=read('apps/api/src/services/content-engine.service.ts');
  const production=read('apps/api/src/services/campaign-production.service.ts');
  const compositor=read('apps/api/src/services/marketing-material-compositor.service.ts');
  const route=read('apps/api/src/routes/marketing-library.ts');
  const e2e=read('tests/e2e/customer-journey.spec.ts');
  test('server-side tenant scoping and EquiProfile-family restrictions fail closed',()=>{
    expect(route).toContain("requireOrganizationRole('owner','admin')");
    expect(library).toContain('organization_id=$1');
    expect(library).toContain('LIBRARY_PACK_TENANT_FAMILY_MISMATCH');
    expect(library).toContain("COALESCE(pack.metadata->>'tenant_family','')<>'equiprofile'");
    expect(e2e).toContain("white-label-owner.e2e@example.test");
    expect(e2e).toContain("getByText('0 available')");
    expect(e2e).toContain("getByText('332 available')");
  });
  test('approved content templates actually enter the canonical Content Engine prompt',()=>{
    expect(content).toContain('APPROVED MARKETING LIBRARY STRUCTURE');
    expect(content).toContain('LIBRARY_TEMPLATE_NOT_USABLE');
    expect(content).toContain("recordLibraryUsage(orgId,String(libraryTemplate.id)");
  });
  test('layouts and video recipes flow into deterministic compositors',()=>{
    expect(production).toContain('library_layout: requestedLibraryItem');
    expect(production).toContain('library_video_recipe: requestedLibraryItem');
    expect(compositor).toContain('generationOptions.library_layout');
    expect(compositor).toContain('libraryLayout.canvas');
    expect(compositor).toContain('generationOptions.library_video_recipe');
    expect(compositor).toContain('libraryVideoRecipe.scenes');
  });
  test('approved reusable tenant assets are selected before a new generation job',()=>{
    const reuse=production.indexOf('findReusableStudioAsset');
    const create=production.indexOf('studioService.createGeneration',reuse);
    expect(reuse).toBeGreaterThan(0);expect(create).toBeGreaterThan(reuse);
    expect(production).toContain('library_reused:true');
  });
  test('pack lifecycle includes structured import/export, duplicate, activation and versioned install',()=>{
    for(const marker of ['exportPack','importPack','duplicatePack','setPackStatus','installed_version=EXCLUDED.installed_version'])expect(library).toContain(marker);
  });
});

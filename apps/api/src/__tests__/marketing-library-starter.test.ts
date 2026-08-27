import { buildEquiprofileStarterPackItems, EQUIPROFILE_STARTER_EXPECTATIONS, EQUIPROFILE_STARTER_ITEM_COUNT } from '../library/equiprofile-starter-pack';
import { assertLibraryItemKind } from '../services/marketing-library.service';

describe('EquiProfile Marketing starter pack',()=>{
  const items=buildEquiprofileStarterPackItems();
  test('ships the complete 332-item minimum without filler kinds',()=>{
    expect(EQUIPROFILE_STARTER_ITEM_COUNT).toBe(332);
    expect(items).toHaveLength(Object.values(EQUIPROFILE_STARTER_EXPECTATIONS).reduce((sum,count)=>sum+count,0));
    expect(new Set(items.map((item)=>item.itemKey)).size).toBe(332);
    for(const item of items) expect(assertLibraryItemKind(item.kind)).toBe(item.kind);
    expect(()=>assertLibraryItemKind('unknown_kind')).toThrow('Unknown Marketing Library item type');
  });
  test('keeps all copy grounded and promotional packs review-only',()=>{
    expect(JSON.stringify(items)).not.toMatch(/guaranteed results|#1|clinically proven/i);
    for(const item of items){
      expect(item.description).toMatch(/verified tenant facts and owner-supplied claims only/i);
      if(item.kind==='campaign_pack') expect(item.definition).toMatchObject({approval_required:true,publish_automatically:false});
    }
  });
  test('provides compatible multi-size layouts and economical scene recipes',()=>{
    const layouts=items.filter((item)=>item.kind.endsWith('_layout'));
    expect(layouts.length).toBeGreaterThanOrEqual(70);
    for(const item of layouts){
      const definition=item.definition as any;
      expect(definition.schema).toMatch(/marketing_layout_v1/);
      expect(definition.variants.length).toBeGreaterThanOrEqual(5);
      expect(definition.slots.logo.required).toBe(true);
    }
    for(const item of items.filter((entry)=>entry.kind==='video_recipe')){
      const recipe=item.definition as any;
      expect(recipe.production_mode).toBe('economical_short_form_video');
      expect(recipe.premium_text_to_video_default).toBe(false);
      expect(recipe.scenes.length).toBeGreaterThanOrEqual(2);
      expect(recipe.scenes.length).toBeLessThanOrEqual(5);
      expect(recipe.scenes.every((scene:any)=>scene.asset_selection.approved_only&&scene.asset_selection.tenant_only)).toBe(true);
    }
  });
});

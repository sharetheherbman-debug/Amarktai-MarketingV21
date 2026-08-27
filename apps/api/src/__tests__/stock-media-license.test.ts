import { commercialLicensePolicy, createStockSaveToken, deduplicateStockResults, verifyStockSaveToken, type StockResult } from '../services/stock-media.service';

const item:StockResult={provider:'openverse',providerAssetId:'asset-1',mediaType:'photo',title:'Horse portrait',previewUrl:'https://example.com/preview.jpg',sourceFileUrl:'https://example.com/file.jpg',providerPageUrl:'https://example.com/work',creatorName:'Creator',creatorUrl:'https://example.com/creator',licenseIdentifier:'by',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',commercialUseAllowed:true,derivativesAllowed:true,attributionRequired:true,attributionText:'Horse portrait by Creator, CC BY',originalMetadata:{}};

describe('stock media license guard',()=>{
  test.each([['cc0',true],['pdm',true],['by',true],['by-sa',true],['CC BY-SA 4.0',true],['Public domain',true],['CC BY-NC 4.0',false],['by-nc',false],['by-nd',false],['unknown',false]])('%s commercial eligibility',(license,allowed)=>expect(commercialLicensePolicy(license).commercialUseAllowed).toBe(allowed));
  test('deduplicates exact source/title/aspect matches',()=>expect(deduplicateStockResults([item,{...item,providerAssetId:'asset-2'}])).toHaveLength(1));
  test('uses a server-signed, tamper-evident save receipt',()=>{
    const token=createStockSaveToken(item);
    expect(verifyStockSaveToken(token)).toMatchObject({provider:'openverse',providerAssetId:'asset-1'});
    expect(()=>verifyStockSaveToken(`${token.slice(0,-1)}x`)).toThrow('Invalid stock selection token');
  });
});

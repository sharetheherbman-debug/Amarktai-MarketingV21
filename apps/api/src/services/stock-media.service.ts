import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { env } from '../config/env';
import { query, transaction } from '../config/database';
import { safeFetch } from '../utils/safe-fetch';
import { AppError } from '../middleware/errorHandler';
import * as studioService from './studio.service';

export type StockProvider = 'pexels' | 'pixabay' | 'unsplash' | 'openverse' | 'wikimedia';
export type StockProviderState = 'AVAILABLE' | 'EXTERNAL_CONFIGURATION_REQUIRED' | 'RATE_LIMITED' | 'PROVIDER_UNAVAILABLE';
export type StockMediaType = 'photo' | 'video';

export type StockResult = {
  provider: StockProvider;
  providerAssetId: string;
  mediaType: StockMediaType;
  title: string;
  previewUrl: string;
  sourceFileUrl: string;
  providerPageUrl: string;
  creatorName: string;
  creatorUrl: string;
  width?: number;
  height?: number;
  duration?: number;
  orientation?: string;
  licenseIdentifier: string;
  licenseUrl?: string;
  commercialUseAllowed: boolean;
  derivativesAllowed: boolean;
  attributionRequired: boolean;
  attributionText: string;
  downloadTrackingUrl?: string;
  originalMetadata: Record<string, unknown>;
  score?: number;
};

export type StockSearchResponse = { provider: StockProvider; state: StockProviderState; results: StockResult[]; message?: string };

const COMMERCIAL_OPEN_LICENSES = new Set(['cc0','pdm','by','by-sa']);

export function commercialLicensePolicy(identifier: unknown): { commercialUseAllowed: boolean; derivativesAllowed: boolean; attributionRequired: boolean } {
  const normalized = String(identifier || '').toLowerCase().replace(/^cc-/,'').replace(/_/g,'-').trim();
  const restricted = /(?:^|[-\s])(?:nc|nd)(?:[-\s]|$)/.test(normalized);
  const openCommons = /public domain|\bpdm\b|\bcc0\b|\bcc by(?:-sa)?(?:\s|$)/.test(normalized);
  const commercialUseAllowed = !restricted && (COMMERCIAL_OPEN_LICENSES.has(normalized) || openCommons
    || normalized === 'pexels' || normalized === 'pixabay-content-license' || normalized === 'unsplash');
  const derivativesAllowed = commercialUseAllowed && !restricted;
  return { commercialUseAllowed, derivativesAllowed, attributionRequired: !(/public domain|\bpdm\b|\bcc0\b/.test(normalized)) };
}

function orientation(width?: number, height?: number): string | undefined {
  if (!width || !height) return undefined;
  if (width === height) return 'square';
  return width > height ? 'landscape' : 'portrait';
}

function stripHtml(value: unknown): string {
  return String(value || '').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
}

function providerState(provider: StockProvider): StockProviderState {
  if (provider === 'pexels') return env.PEXELS_API_KEY ? 'AVAILABLE' : 'EXTERNAL_CONFIGURATION_REQUIRED';
  if (provider === 'pixabay') return env.PIXABAY_API_KEY ? 'AVAILABLE' : 'EXTERNAL_CONFIGURATION_REQUIRED';
  if (provider === 'unsplash') return env.UNSPLASH_ACCESS_KEY ? 'AVAILABLE' : 'EXTERNAL_CONFIGURATION_REQUIRED';
  return 'AVAILABLE';
}

export function getStockProviderStates(): Array<{ provider: StockProvider; state: StockProviderState }> {
  return (['pexels','pixabay','unsplash','openverse','wikimedia'] as StockProvider[])
    .map((provider) => ({ provider, state: providerState(provider) }));
}

async function responseOrState(provider: StockProvider, url: string, options: RequestInit = {}) {
  try {
    const response = await safeFetch(url, { ...options, timeoutMs: 15000, maxResponseBytes: 3 * 1024 * 1024 });
    if (response.status === 429) return { state: 'RATE_LIMITED' as const };
    if (!response.ok) return { state: 'PROVIDER_UNAVAILABLE' as const };
    return { state: 'AVAILABLE' as const, data: await response.json<Record<string, any>>() };
  } catch {
    return { state: 'PROVIDER_UNAVAILABLE' as const };
  }
}

function qurl(base: string, values: Record<string,string|number|undefined>) {
  const url = new URL(base);
  for (const [key,value] of Object.entries(values)) if (value !== undefined && value !== '') url.searchParams.set(key,String(value));
  return url.toString();
}

async function searchPexels(text: string, type: StockMediaType, requestedOrientation?: string): Promise<StockSearchResponse> {
  if (!env.PEXELS_API_KEY) return { provider:'pexels',state:'EXTERNAL_CONFIGURATION_REQUIRED',results:[] };
  const base = type === 'photo' ? 'https://api.pexels.com/v1/search' : 'https://api.pexels.com/v1/videos/search';
  const response = await responseOrState('pexels',qurl(base,{ query:text,orientation:requestedOrientation,per_page:30 }),{ headers:{ Authorization:env.PEXELS_API_KEY } });
  if (!response.data) return { provider:'pexels',state:response.state,results:[] };
  const rows = type === 'photo' ? response.data.photos || [] : response.data.videos || [];
  const results: StockResult[] = rows.map((row: any) => {
    const file = type === 'photo' ? row.src || {} : [...(row.video_files || [])].sort((a,b)=>(b.width || 0)-(a.width || 0))[0] || {};
    const creatorName = String(row.photographer || row.user?.name || 'Pexels contributor');
    const page = String(row.url || 'https://www.pexels.com');
    return {
      provider:'pexels',providerAssetId:String(row.id),mediaType:type,title:String(row.alt || `Pexels ${type}`),
      previewUrl:String(type === 'photo' ? file.medium || file.large : row.image || ''),
      sourceFileUrl:String(type === 'photo' ? file.large2x || file.original : file.link || ''),providerPageUrl:page,
      creatorName,creatorUrl:String(row.photographer_url || row.user?.url || page),width:Number(row.width || file.width || 0),height:Number(row.height || file.height || 0),
      duration:type === 'video' ? Number(row.duration || 0) : undefined,orientation:orientation(row.width,file.height || row.height),
      licenseIdentifier:'Pexels',licenseUrl:'https://www.pexels.com/license/',commercialUseAllowed:true,derivativesAllowed:true,
      attributionRequired:true,attributionText:`${type === 'photo' ? 'Photo' : 'Video'} by ${creatorName} on Pexels`,originalMetadata:row,
    };
  });
  return { provider:'pexels',state:'AVAILABLE',results };
}

async function searchPixabay(text: string, type: StockMediaType, requestedOrientation?: string): Promise<StockSearchResponse> {
  if (!env.PIXABAY_API_KEY) return { provider:'pixabay',state:'EXTERNAL_CONFIGURATION_REQUIRED',results:[] };
  const base = type === 'photo' ? 'https://pixabay.com/api/' : 'https://pixabay.com/api/videos/';
  const pixabayOrientation=requestedOrientation==='landscape'?'horizontal':requestedOrientation==='portrait'?'vertical':undefined;
  const response = await responseOrState('pixabay',qurl(base,{ key:env.PIXABAY_API_KEY,q:text,orientation:pixabayOrientation,image_type:type === 'photo' ? 'photo' : undefined,safesearch:'true',per_page:30 }));
  if (!response.data) return { provider:'pixabay',state:response.state,results:[] };
  const results: StockResult[] = (response.data.hits || []).map((row: any) => {
    const file = type === 'photo' ? {} : row.videos?.large || row.videos?.medium || row.videos?.small || {};
    const creatorName = String(row.user || 'Pixabay contributor');
    return {
      provider:'pixabay',providerAssetId:String(row.id),mediaType:type,title:String(row.tags || `Pixabay ${type}`),
      previewUrl:String(type === 'photo' ? row.webformatURL : row.picture_id ? `https://i.vimeocdn.com/video/${row.picture_id}_640x360.jpg` : ''),
      sourceFileUrl:String(type === 'photo' ? row.largeImageURL || row.webformatURL : file.url || ''),providerPageUrl:String(row.pageURL || 'https://pixabay.com'),
      creatorName,creatorUrl:`https://pixabay.com/users/${encodeURIComponent(String(row.user || ''))}-${row.user_id || ''}/`,
      width:Number(type === 'photo' ? row.imageWidth : file.width || 0),height:Number(type === 'photo' ? row.imageHeight : file.height || 0),duration:type === 'video' ? Number(row.duration || 0) : undefined,
      orientation:orientation(type === 'photo' ? row.imageWidth : file.width,type === 'photo' ? row.imageHeight : file.height),
      licenseIdentifier:'Pixabay-Content-License',licenseUrl:'https://pixabay.com/service/license-summary/',commercialUseAllowed:true,derivativesAllowed:true,
      attributionRequired:true,attributionText:`${type === 'photo' ? 'Image' : 'Video'} by ${creatorName} from Pixabay`,originalMetadata:row,
    };
  });
  return { provider:'pixabay',state:'AVAILABLE',results };
}

async function searchUnsplash(text: string, type: StockMediaType, requestedOrientation?: string): Promise<StockSearchResponse> {
  if (!env.UNSPLASH_ACCESS_KEY) return { provider:'unsplash',state:'EXTERNAL_CONFIGURATION_REQUIRED',results:[] };
  if (type === 'video') return { provider:'unsplash',state:'AVAILABLE',results:[],message:'Unsplash integration supports photos only.' };
  const response = await responseOrState('unsplash',qurl('https://api.unsplash.com/search/photos',{ query:text,orientation:requestedOrientation === 'square' ? 'squarish' : requestedOrientation,per_page:30,content_filter:'high' }),{
    headers:{ Authorization:`Client-ID ${env.UNSPLASH_ACCESS_KEY}`,'Accept-Version':'v1' },
  });
  if (!response.data) return { provider:'unsplash',state:response.state,results:[] };
  return { provider:'unsplash',state:'AVAILABLE',results:(response.data.results || []).map((row:any)=>{
    const creatorName=String(row.user?.name || 'Unsplash contributor');
    return { provider:'unsplash',providerAssetId:String(row.id),mediaType:'photo',title:String(row.alt_description || row.description || 'Unsplash photo'),
      previewUrl:String(row.urls?.small || ''),sourceFileUrl:String(row.urls?.regular || row.urls?.full || ''),providerPageUrl:String(row.links?.html || ''),
      creatorName,creatorUrl:String(row.user?.links?.html || ''),width:Number(row.width || 0),height:Number(row.height || 0),orientation:orientation(row.width,row.height),
      licenseIdentifier:'Unsplash',licenseUrl:'https://unsplash.com/license',commercialUseAllowed:true,derivativesAllowed:true,attributionRequired:true,
      attributionText:`Photo by ${creatorName} on Unsplash`,downloadTrackingUrl:String(row.links?.download_location || ''),originalMetadata:row } as StockResult;
  }) };
}

let openverseToken: { value:string; expiresAt:number } | null = null;
async function getOpenverseToken(): Promise<string | undefined> {
  if (!env.OPENVERSE_CLIENT_ID || !env.OPENVERSE_CLIENT_SECRET) return undefined;
  if (openverseToken && openverseToken.expiresAt > Date.now() + 60_000) return openverseToken.value;
  const response = await responseOrState('openverse','https://api.openverse.org/v1/auth_tokens/token/',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'client_credentials',client_id:env.OPENVERSE_CLIENT_ID,client_secret:env.OPENVERSE_CLIENT_SECRET}),
  });
  const token = String(response.data?.access_token || '');
  if (!token) return undefined;
  openverseToken={value:token,expiresAt:Date.now()+Number(response.data?.expires_in || 3600)*1000};
  return token;
}

async function searchOpenverse(text: string, type: StockMediaType, requestedOrientation?: string): Promise<StockSearchResponse> {
  if (type === 'video') return { provider:'openverse',state:'AVAILABLE',results:[],message:'Openverse gateway currently permits image media only.' };
  const token = await getOpenverseToken();
  const response = await responseOrState('openverse',qurl('https://api.openverse.org/v1/images/',{q:text,license:'cc0,pdm,by,by-sa',page_size:30}),token?{headers:{Authorization:`Bearer ${token}`}}:{});
  if (!response.data) return { provider:'openverse',state:response.state,results:[] };
  const results: StockResult[] = (response.data.results || []).map((row:any)=>{
    const policy=commercialLicensePolicy(row.license);
    return { provider:'openverse',providerAssetId:String(row.id),mediaType:'photo',title:String(row.title || 'Openverse image'),previewUrl:String(row.thumbnail || row.url || ''),
      sourceFileUrl:String(row.url || ''),providerPageUrl:String(row.foreign_landing_url || row.detail_url || ''),creatorName:String(row.creator || 'Unknown creator'),creatorUrl:String(row.creator_url || ''),
      width:Number(row.width || 0),height:Number(row.height || 0),orientation:orientation(row.width,row.height),licenseIdentifier:String(row.license || ''),licenseUrl:String(row.license_url || row.meta_data?.license_url || ''),
      ...policy,attributionText:String(row.attribution || `${row.title || 'Work'} by ${row.creator || 'Unknown creator'} (${row.license || 'license'})`),originalMetadata:row } as StockResult;
  }).filter((item:StockResult)=>item.commercialUseAllowed && item.derivativesAllowed && (!requestedOrientation || item.orientation === requestedOrientation));
  return { provider:'openverse',state:'AVAILABLE',results };
}

async function searchWikimedia(text: string, type: StockMediaType, requestedOrientation?: string): Promise<StockSearchResponse> {
  if (type === 'video') return { provider:'wikimedia',state:'AVAILABLE',results:[],message:'Wikimedia gateway currently permits image media only.' };
  const response=await responseOrState('wikimedia',qurl('https://commons.wikimedia.org/w/api.php',{
    action:'query',format:'json',generator:'search',gsrsearch:`${text} filetype:bitmap`,gsrnamespace:6,gsrlimit:20,
    prop:'imageinfo',iiprop:'url|size|extmetadata',iiurlwidth:640,origin:'*',
  }));
  if (!response.data) return {provider:'wikimedia',state:response.state,results:[]};
  const pages=Object.values(response.data.query?.pages || {}) as any[];
  const results: StockResult[]=pages.map((row:any)=>{
    const info=row.imageinfo?.[0] || {}; const meta=info.extmetadata || {};
    const license=stripHtml(meta.LicenseShortName?.value || ''); const policy=commercialLicensePolicy(license);
    const creator=stripHtml(meta.Artist?.value || info.user || 'Wikimedia Commons contributor');
    return {provider:'wikimedia',providerAssetId:String(row.pageid || row.title),mediaType:'photo',title:String(row.title || '').replace(/^File:/,''),previewUrl:String(info.thumburl || info.url || ''),
      sourceFileUrl:String(info.url || ''),providerPageUrl:String(info.descriptionurl || ''),creatorName:creator,creatorUrl:String(info.descriptionshorturl || info.descriptionurl || ''),width:Number(info.width || 0),height:Number(info.height || 0),orientation:orientation(info.width,info.height),
      licenseIdentifier:license,licenseUrl:stripHtml(meta.LicenseUrl?.value || ''),...policy,attributionText:stripHtml(meta.Attribution?.value || `${row.title} by ${creator}, ${license}`),originalMetadata:row} as StockResult;
  }).filter((item)=>item.commercialUseAllowed && item.derivativesAllowed && (!requestedOrientation || item.orientation===requestedOrientation));
  return {provider:'wikimedia',state:'AVAILABLE',results};
}

const SEARCHERS: Record<StockProvider,(text:string,type:StockMediaType,orientation?:string)=>Promise<StockSearchResponse>> = {
  pexels:searchPexels,pixabay:searchPixabay,unsplash:searchUnsplash,openverse:searchOpenverse,wikimedia:searchWikimedia,
};

export function deduplicateStockResults(results: StockResult[]): StockResult[] {
  const seen=new Set<string>();
  return results.filter((item)=>{
    const ratio=item.width&&item.height?Math.round((item.width/item.height)*20):0;
    const signature=`${item.sourceFileUrl.replace(/[?#].*$/,'').toLowerCase()}|${item.title.toLowerCase().replace(/\W+/g,' ').trim()}|${ratio}`;
    const hash=crypto.createHash('sha256').update(signature).digest('hex');
    if(seen.has(hash)) return false; seen.add(hash); return true;
  });
}

export function createStockSaveToken(item: StockResult): string {
  const payload = Buffer.from(JSON.stringify({ item, expiresAt: Date.now() + 30 * 60_000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', env.JWT_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyStockSaveToken(token: string): StockResult {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) throw new AppError(400,'Invalid stock selection token','STOCK_SELECTION_INVALID');
  const expected = crypto.createHmac('sha256', env.JWT_SECRET).update(payload).digest('base64url');
  const left = Buffer.from(signature); const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left,right)) throw new AppError(400,'Invalid stock selection token','STOCK_SELECTION_INVALID');
  let decoded: { item: StockResult; expiresAt: number };
  try { decoded = JSON.parse(Buffer.from(payload,'base64url').toString('utf8')) as { item: StockResult; expiresAt: number }; }
  catch { throw new AppError(400,'Invalid stock selection token','STOCK_SELECTION_INVALID'); }
  if (decoded.expiresAt < Date.now()) throw new AppError(410,'Stock selection token expired; search again','STOCK_SELECTION_EXPIRED');
  if (!decoded.item?.providerAssetId || !decoded.item?.provider || !decoded.item?.sourceFileUrl) throw new AppError(400,'Incomplete stock selection','STOCK_SELECTION_INVALID');
  return decoded.item;
}

async function cached(provider: StockProvider,key:string,ttlMinutes:number,producer:()=>Promise<StockSearchResponse>):Promise<StockSearchResponse>{
  const hash=crypto.createHash('sha256').update(key).digest('hex');
  const existing=await query('SELECT response FROM stock_search_cache WHERE provider=$1 AND cache_key=$2 AND expires_at>NOW()',[provider,hash]);
  if(existing.rows[0]) return existing.rows[0].response as StockSearchResponse;
  const response=await producer();
  if(response.state==='AVAILABLE') await query(
    `INSERT INTO stock_search_cache (provider,cache_key,response,expires_at) VALUES ($1,$2,$3,NOW()+($4 || ' minutes')::interval)
     ON CONFLICT (provider,cache_key) DO UPDATE SET response=EXCLUDED.response,expires_at=EXCLUDED.expires_at,created_at=NOW()`,
    [provider,hash,JSON.stringify(response),ttlMinutes]
  );
  return response;
}

export async function searchStock(input:{providers?:StockProvider[];query:string;mediaType?:StockMediaType;orientation?:string}){
  const providers=input.providers?.length?input.providers:['pexels','pixabay','unsplash','openverse','wikimedia'] as StockProvider[];
  const type=input.mediaType || 'photo';
  const responses:StockSearchResponse[]=[];
  for(const provider of providers){
    if(!SEARCHERS[provider]) throw new AppError(400,'Unknown stock provider','STOCK_PROVIDER_UNSUPPORTED');
    if(providerState(provider)==='EXTERNAL_CONFIGURATION_REQUIRED'){responses.push({provider,state:'EXTERNAL_CONFIGURATION_REQUIRED',results:[]});continue;}
    responses.push(await cached(provider,JSON.stringify({q:input.query,type,orientation:input.orientation}),provider==='pixabay'?1440:15,()=>SEARCHERS[provider](input.query,type,input.orientation)));
  }
  const priority:Record<StockProvider,number>={pexels:3,pixabay:4,unsplash:5,openverse:6,wikimedia:7};
  const results=deduplicateStockResults(responses.flatMap((response)=>response.results).filter((item)=>item.commercialUseAllowed&&item.derivativesAllowed))
    .map((item)=>({...item,score:100-priority[item.provider]*5+(item.width&&item.width>=1600?5:0)})).sort((a,b)=>(b.score||0)-(a.score||0));
  return {providers:responses.map(({provider,state,message})=>({provider,state,message})),results:results.map((item)=>({...item,saveToken:createStockSaveToken(item)}))};
}

export async function saveStockReference(organizationId:string,userId:string,item:StockResult){
  if(!item.commercialUseAllowed||!item.derivativesAllowed) throw new AppError(409,'Stock asset is not eligible for safe commercial creative use','STOCK_LICENSE_NOT_ALLOWED');
  if(item.provider==='unsplash'&&item.downloadTrackingUrl){
    const tracked=await responseOrState('unsplash',item.downloadTrackingUrl,{headers:{Authorization:`Client-ID ${env.UNSPLASH_ACCESS_KEY}`,'Accept-Version':'v1'}});
    if(tracked.state!=='AVAILABLE') throw new AppError(503,'Unsplash download tracking could not be completed','STOCK_DOWNLOAD_TRACKING_REQUIRED');
  }
  let selectedAsset: Awaited<ReturnType<typeof studioService.createAsset>> | null = null;
  if(item.provider !== 'unsplash') {
    const response = await safeFetch(item.sourceFileUrl,{timeoutMs:30000,maxResponseBytes:25*1024*1024,maxRedirects:5});
    const mimeType=String(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
    const extensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'};
    const extension=extensions[mimeType];
    if(!response.ok||!extension) throw new AppError(422,'Selected stock media did not return a supported image or video','STOCK_MEDIA_FORMAT_UNSUPPORTED');
    const bytes=await response.bytes();
    const filename=`${item.provider}-${item.providerAssetId.replace(/[^a-z0-9_-]/gi,'-').slice(0,100)}-${crypto.randomUUID()}.${extension}`;
    const directory=path.join(process.cwd(),'uploads','stock-media',organizationId);
    await fs.mkdir(directory,{recursive:true});
    const storagePath=path.join(directory,filename);
    await fs.writeFile(storagePath,bytes);
    selectedAsset=await studioService.createAsset(organizationId,userId,{filename,originalName:item.title.slice(0,255),mimeType,size:bytes.byteLength,path:storagePath});
  }
  try { return await transaction(async(client)=>{
    const provenance=await client.query(
      `INSERT INTO asset_provenance_ledger
        (organization_id,provider,provider_asset_id,provider_page_url,source_file_url,creator_name,creator_url,
         license_identifier,license_url,commercial_use_allowed,derivatives_allowed,attribution_required,attribution_text,downloaded_at,original_metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (organization_id,provider,provider_asset_id) DO UPDATE SET provider_page_url=EXCLUDED.provider_page_url,
         source_file_url=EXCLUDED.source_file_url,creator_name=EXCLUDED.creator_name,creator_url=EXCLUDED.creator_url,
         license_identifier=EXCLUDED.license_identifier,license_url=EXCLUDED.license_url,
        commercial_use_allowed=EXCLUDED.commercial_use_allowed,derivatives_allowed=EXCLUDED.derivatives_allowed,downloaded_at=EXCLUDED.downloaded_at,
         attribution_required=EXCLUDED.attribution_required,attribution_text=EXCLUDED.attribution_text,
         original_metadata=EXCLUDED.original_metadata,retrieved_at=NOW(),updated_at=NOW() RETURNING id`,
      [organizationId,item.provider,item.providerAssetId,item.providerPageUrl,item.sourceFileUrl,item.creatorName,item.creatorUrl,
        item.licenseIdentifier,item.licenseUrl||null,item.commercialUseAllowed,item.derivativesAllowed,item.attributionRequired,item.attributionText,selectedAsset?new Date():null,JSON.stringify(item.originalMetadata)]
    );
    const library=await client.query(
      `INSERT INTO marketing_library_items
        (organization_id,provenance_id,studio_asset_id,item_key,kind,category,name,description,tags,platforms,aspect_ratio,dimensions,
         definition,preview,source_kind,approval_status,is_editable,is_brandable,created_by)
       VALUES ($1,$2,$3,$4,$5,'stock-media',$6,$7,$8,'[]'::jsonb,$9,$10,$11,$12,'stock_provider','pending_owner_review',FALSE,TRUE,$13)
       ON CONFLICT (organization_id,item_key) DO UPDATE SET provenance_id=EXCLUDED.provenance_id,studio_asset_id=COALESCE(EXCLUDED.studio_asset_id,marketing_library_items.studio_asset_id),preview=EXCLUDED.preview,updated_at=NOW(),deleted_at=NULL RETURNING *`,
      [organizationId,provenance.rows[0].id,selectedAsset?.id||null,`stock:${item.provider}:${item.providerAssetId}`,item.mediaType==='photo'?'stock_photo_reference':'stock_video_reference',item.title,
        item.attributionText,JSON.stringify([item.provider,'stock',item.mediaType]),item.orientation||null,item.width&&item.height?`${item.width}x${item.height}`:null,
        JSON.stringify({source_file_url:item.sourceFileUrl,commercial_use_allowed:true,derivatives_allowed:true}),JSON.stringify({url:selectedAsset?.url||item.previewUrl,attribution:item.attributionText}),userId]
    );
    return library.rows[0];
  }); } catch(error) {
    if(selectedAsset) await studioService.deleteAsset(selectedAsset.id,organizationId).catch(()=>undefined);
    throw error;
  }
}

import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { query, transaction } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { safeFetch } from '../utils/safe-fetch';
import { createPack, addPackItem, installPack } from './marketing-library.service';
import * as brandDnaService from './brand-dna.service';
import * as knowledgeService from './knowledge.service';
import * as studioService from './studio.service';
import { searchStock } from './stock-media.service';
import { collectWebsiteDocuments } from './knowledge-ingestion.service';

export type FactState = 'VERIFIED_FIRST_PARTY' | 'OWNER_SUPPLIED' | 'INFERRED' | 'UNVERIFIED' | 'DISALLOWED';
export type BootstrapFact = { key: string; value: unknown; state: FactState; sourceUrl?: string; evidence?: Record<string, unknown> };
export type WebsitePage = { url: string; html: string };

const CLAIM_PATTERN = /\b(guarantee(?:d)?|best\s+in\s+the\s+world|number\s*1|#1|clinically\s+proven|risk[- ]free|always|never\s+fails)\b/i;

function decode(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function matches(html: string, expression: RegExp): string[] {
  return [...html.matchAll(expression)].map((match) => decode(match[1] || '')).filter(Boolean);
}

function unique(values: string[], limit = 30): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}

function absoluteUrl(value: string, base: string): string | null {
  try {
    const url = new URL(value, base);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
}

export function extractWebsiteIntelligence(pages: WebsitePage[], ownerOverrides: Record<string, unknown> = {}): BootstrapFact[] {
  const facts: BootstrapFact[] = [];
  const add = (key: string, value: unknown, state: FactState, sourceUrl?: string, evidence: Record<string, unknown> = {}) => {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return;
    facts.push({ key, value, state, sourceUrl, evidence });
  };
  for (const page of pages) {
    const html = page.html;
    const title = matches(html, /<title[^>]*>([\s\S]*?)<\/title>/gi)[0];
    const headings = unique(matches(html, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi));
    const descriptions = matches(html, /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["'][^>]*>/gi);
    const logos = unique([...html.matchAll(/<(?:img|link)[^>]+(?:src|href)=["']([^"']+)["'][^>]*(?:logo|icon)|<(?:img|link)[^>]*(?:logo|icon)[^>]+(?:src|href)=["']([^"']+)["']/gi)]
      .map((match) => absoluteUrl(match[1] || match[2], page.url)).filter((value): value is string => Boolean(value)));
    const colors = unique([...html.matchAll(/#[0-9a-f]{6}\b/gi)].map((match) => match[0].toUpperCase()), 12);
    const fonts = unique([...html.matchAll(/font-family\s*:\s*([^;}]+)/gi)].flatMap((match) => match[1].split(',')).map((font) => font.replace(/["']/g, '').trim()), 12);
    const social = unique([...html.matchAll(/href=["'](https?:\/\/(?:www\.)?(?:facebook|instagram|linkedin|youtube|tiktok|x|twitter)\.com\/[^"']+)["']/gi)].map((match) => match[1]), 20);
    const contacts = unique([
      ...[...html.matchAll(/href=["']mailto:([^"'?]+)[^"']*["']/gi)].map((match) => match[1]),
      ...[...html.matchAll(/href=["']tel:([^"']+)["']/gi)].map((match) => match[1]),
    ], 20);
    const prices = unique([...html.matchAll(/(?:R|\$|€|£)\s?\d[\d.,]*(?:\s?(?:per|\/)[a-z]+)?/gi)].map((match) => match[0]), 20);
    const ctas = unique(matches(html, /<(?:a|button)[^>]*>([\s\S]*?)<\/(?:a|button)>/gi).filter((value) => /book|buy|shop|start|contact|learn|discover|join|request|get|try/i.test(value)), 20);
    const ownedImages=unique([...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((match)=>absoluteUrl(match[1],page.url)).filter((value):value is string=>Boolean(value)&&new URL(value!).origin===new URL(page.url).origin),30);
    const openGraphImages=unique([
      ...[...html.matchAll(/<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/gi)].map((match)=>absoluteUrl(match[1],page.url)),
      ...[...html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/gi)].map((match)=>absoluteUrl(match[1],page.url)),
    ].filter((value):value is string=>Boolean(value)&&new URL(value!).origin===new URL(page.url).origin),10);
    add('page_title', title, 'VERIFIED_FIRST_PARTY', page.url, { selector: 'title' });
    add('description', descriptions[0], 'VERIFIED_FIRST_PARTY', page.url, { selector: 'meta description' });
    add('topics', headings, 'VERIFIED_FIRST_PARTY', page.url, { selector: 'h1,h2,h3' });
    add('logos', logos, 'VERIFIED_FIRST_PARTY', page.url, { selector: 'logo/icon elements' });
    add('colors', colors, 'VERIFIED_FIRST_PARTY', page.url, { selector: 'CSS color tokens' });
    add('fonts', fonts, 'VERIFIED_FIRST_PARTY', page.url, { selector: 'font-family declarations' });
    add('social_links', social, 'VERIFIED_FIRST_PARTY', page.url);
    add('contacts', contacts, 'VERIFIED_FIRST_PARTY', page.url);
    add('published_prices', prices, 'VERIFIED_FIRST_PARTY', page.url);
    add('calls_to_action', ctas, 'VERIFIED_FIRST_PARTY', page.url);
    add('owned_images',ownedImages,'VERIFIED_FIRST_PARTY',page.url,{selector:'first-party img[src]'});
    add('opengraph_images',openGraphImages,'VERIFIED_FIRST_PARTY',page.url,{selector:'meta[property="og:image"]'});
    for(const script of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
      try{
        const parsed=JSON.parse(script[1]);const records=(Array.isArray(parsed)?parsed:[parsed]).flatMap((entry:any)=>Array.isArray(entry?.['@graph'])?entry['@graph']:[entry]);
        for(const record of records){
          const type=String(record?.['@type']||'').toLowerCase();
          if(record?.name)add(type.includes('product')?'products':type.includes('service')?'services':'structured_business_name',record.name,'VERIFIED_FIRST_PARTY',page.url,{source:'JSON-LD'});
          if(record?.address)add('locations',record.address,'VERIFIED_FIRST_PARTY',page.url,{source:'JSON-LD'});
          if(record?.offers)add('offers',record.offers,'VERIFIED_FIRST_PARTY',page.url,{source:'JSON-LD'});
          if(type.includes('faq')&&record?.mainEntity)add('faqs',record.mainEntity,'VERIFIED_FIRST_PARTY',page.url,{source:'JSON-LD'});
        }
      }catch{/* Invalid first-party structured data is ignored rather than promoted as fact. */}
    }
    for (const claim of unique(matches(html, /<(?:p|li)[^>]*>([\s\S]*?)<\/(?:p|li)>/gi).filter((value) => CLAIM_PATTERN.test(value)), 20)) {
      add('restricted_claim', claim, 'DISALLOWED', page.url, { reason: 'High-risk or absolute claim requires owner evidence and approval.' });
    }
  }
  for (const [key, value] of Object.entries(ownerOverrides)) add(key, value, 'OWNER_SUPPLIED', undefined, { supplied_by_owner: true });
  const text = pages.map((page) => decode(page.html)).join(' ').toLowerCase();
  add('inferred_tone', /luxury|premium|exclusive/.test(text) ? 'premium' : /friendly|welcome|community/.test(text) ? 'friendly' : 'professional', 'INFERRED', undefined, { reason: 'Language-pattern inference; excluded from automatic claims.' });
  return facts;
}

export function generationFacts(facts: BootstrapFact[]): BootstrapFact[] {
  return facts.filter((fact) => fact.state === 'VERIFIED_FIRST_PARTY' || fact.state === 'OWNER_SUPPLIED');
}

export function generateStockConcepts(facts: BootstrapFact[]): string[] {
  const allowed = generationFacts(facts);
  const topics = allowed.filter((fact) => fact.key === 'topics').flatMap((fact) => Array.isArray(fact.value) ? fact.value : [fact.value]);
  const name = String(allowed.find((fact) => fact.key === 'page_title')?.value || 'the brand');
  return unique([
    `${name} authentic customer context`, `${name} product or service in use`, `${name} team and workspace`,
    ...topics.slice(0, 5).map((topic) => `${String(topic)} natural editorial photography`),
  ], 8);
}

export function build30DayPlan(facts: BootstrapFact[], start = new Date()): Array<Record<string, unknown>> {
  const allowed = generationFacts(facts);
  const topics = unique(allowed.filter((fact) => fact.key === 'topics').flatMap((fact) => Array.isArray(fact.value) ? fact.value.map(String) : [String(fact.value)]), 15);
  const ctas = unique(allowed.filter((fact) => fact.key === 'calls_to_action').flatMap((fact) => Array.isArray(fact.value) ? fact.value.map(String) : [String(fact.value)]), 10);
  const prices = allowed.some((fact) => fact.key === 'published_prices');
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(start); date.setUTCDate(date.getUTCDate() + index);
    return {
      day: index + 1, date: date.toISOString().slice(0, 10), platform: ['instagram','facebook','linkedin'][index % 3],
      content_type: index % 7 === 0 ? 'article' : index % 3 === 0 ? 'carousel' : 'social',
      topic: topics[index % Math.max(1, topics.length)] || 'Owner-approved brand introduction',
      cta: ctas[index % Math.max(1, ctas.length)] || '{{preferred_cta}}', promotion_allowed: prices && index % 10 === 9,
      status: 'draft', approval_status: 'pending_owner_review', auto_publish: false,
    };
  });
}

export async function crawlFirstPartyWebsite(value: string): Promise<WebsitePage[]> {
  const documents = await collectWebsiteDocuments(value, { maxPages: 12 });
  const pages = documents.flatMap((document) => document.rawHtml && document.url
    ? [{ url: document.url, html: document.rawHtml }]
    : []);
  if (!pages.length) throw new AppError(422, 'We could not read useful public website pages.', 'BRAND_BOOTSTRAP_NO_PAGES');
  return pages;
}

export async function startBrandBootstrap(organizationId: string, userId: string, websiteUrl: string, ownerOverrides: Record<string, unknown> = {}) {
  const run = (await query(
    `INSERT INTO brand_bootstrap_runs (organization_id,website_url,created_by) VALUES ($1,$2,$3) RETURNING *`,
    [organizationId, websiteUrl, userId]
  )).rows[0];
  try {
    const pages = await crawlFirstPartyWebsite(websiteUrl);
    const facts = extractWebsiteIntelligence(pages, ownerOverrides);
    const allowed = generationFacts(facts);
    const stockConcepts = generateStockConcepts(facts);
    const stockSearches=stockConcepts[0]?await Promise.all([
      searchStock({query:stockConcepts[0],mediaType:'photo'}).catch(()=>({providers:[],results:[]})),
      searchStock({query:stockConcepts[0],mediaType:'video',providers:['pexels','pixabay']}).catch(()=>({providers:[],results:[]})),
    ]):[];
    const stockResearch={concepts:stockConcepts,providers:stockSearches.flatMap((result)=>result.providers),recommendations:stockSearches.flatMap((result)=>result.results).slice(0,12).map((item:any)=>({provider:item.provider,provider_asset_id:item.providerAssetId,title:item.title,preview_url:item.previewUrl,provider_page_url:item.providerPageUrl,creator:item.creatorName,license:item.licenseIdentifier,attribution:item.attributionText,commercial_use_allowed:item.commercialUseAllowed,derivatives_allowed:item.derivativesAllowed}))};
    const calendar = build30DayPlan(facts);
    const lookup = (key: string) => allowed.filter((fact) => fact.key === key).flatMap((fact) => Array.isArray(fact.value) ? fact.value : [fact.value]);
    const brandDna = { company_name: lookup('page_title')[0] || '', website_url: websiteUrl, descriptions: lookup('description'), colors: lookup('colors'), fonts: lookup('fonts'), logos: lookup('logos'), preferred_ctas: lookup('calls_to_action'), status: 'proposed' };
    const businessBrain = { topics: lookup('topics'), contacts: lookup('contacts'), social_links: lookup('social_links'), published_prices: lookup('published_prices'), source_urls: pages.map((page) => page.url), fact_policy: 'verified_first_party_or_owner_supplied_only' };
    await transaction(async (client) => {
      for (const fact of facts) await client.query(
        `INSERT INTO brand_bootstrap_facts (bootstrap_run_id,organization_id,fact_key,value,fact_state,source_url,evidence) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [run.id,organizationId,fact.key,JSON.stringify(fact.value),fact.state,fact.sourceUrl || null,JSON.stringify(fact.evidence || {})]
      );
      await client.query(
        `UPDATE brand_bootstrap_runs SET status='pending_owner_review',business_brain=$1,brand_dna=$2,stock_concepts=$3,starter_calendar=$4,completed_at=NOW(),updated_at=NOW() WHERE id=$5 AND organization_id=$6`,
        [JSON.stringify(businessBrain),JSON.stringify(brandDna),JSON.stringify(stockResearch),JSON.stringify(calendar),run.id,organizationId]
      );
    });
    return getBrandBootstrap(organizationId, run.id);
  } catch (error) {
    await query(`UPDATE brand_bootstrap_runs SET status='failed',error_message=$1,completed_at=NOW(),updated_at=NOW() WHERE id=$2 AND organization_id=$3`, [error instanceof Error ? error.message.slice(0,2000) : 'Bootstrap failed',run.id,organizationId]);
    throw error;
  }
}

export async function getBrandBootstrap(organizationId: string, runId: string) {
  const run = await query('SELECT * FROM brand_bootstrap_runs WHERE id=$1 AND organization_id=$2', [runId,organizationId]);
  if (!run.rows[0]) throw new NotFoundError('Brand bootstrap');
  const facts = await query('SELECT fact_key AS key,value,fact_state AS state,source_url,evidence FROM brand_bootstrap_facts WHERE bootstrap_run_id=$1 AND organization_id=$2 ORDER BY created_at', [runId,organizationId]);
  return { ...run.rows[0], facts: facts.rows };
}

export async function acceptBrandBootstrap(organizationId: string, userId: string, runId: string) {
  const run = await getBrandBootstrap(organizationId,runId);
  if (run.status !== 'pending_owner_review') throw new AppError(409,'Bootstrap is not awaiting owner review','BRAND_BOOTSTRAP_NOT_REVIEWABLE');
  const pack = await createPack(organizationId,userId,{ slug:`brand-bootstrap-${runId}`,name:'Website Brand Starter Pack',description:'Owner-reviewed first-party website starter materials',status:'draft',metadata:{bootstrap_run_id:runId,auto_publish:false} });
  const brand = run.brand_dna as Record<string,unknown>;
  await addPackItem(organizationId,pack.id,{
    itemKey:`bootstrap:${runId}:brand`,kind:'brand_asset',category:'brand-assets',name:'Website brand reference',description:'Verified first-party and owner-supplied brand reference.',tags:['brand','first-party'],platforms:[],definition:{...brand,approval_status:'owner_accepted',auto_publish:false},
  });
  for (const [index, item] of (run.starter_calendar as Array<Record<string,unknown>>).entries()) await addPackItem(organizationId,pack.id,{
    itemKey:`bootstrap:${runId}:day-${index+1}`,kind:'social_post_template',category:'30-day-plan',name:`Day ${index+1}: ${String(item.topic)}`,description:'Draft calendar idea; owner approval is still required before publishing.',tags:['bootstrap','calendar','draft'],platforms:[String(item.platform)],channel:String(item.platform),definition:{...item,auto_publish:false,approval_status:'pending_owner_review'},
  });
  const colors=Array.isArray(brand.colors)?brand.colors.map(String):[];
  const logos=Array.isArray(brand.logos)?brand.logos.map(String):[];
  const descriptions=Array.isArray(brand.descriptions)?brand.descriptions.map(String):[];
  const preferredCtas=Array.isArray(brand.preferred_ctas)?brand.preferred_ctas.map(String):[];
  if(logos[0]) await importFirstPartyBrandAsset(organizationId,userId,runId,String(run.website_url),logos[0],'Website brand logo');
  await brandDnaService.upsert(organizationId,{
    company_name:String(brand.company_name||'My Company'),company_description:descriptions[0]||undefined,website_url:String(brand.website_url||run.website_url),
    colors:{primary:colors[0],secondary:colors[1],accent:colors[2]},logo_url:logos[0]||undefined,preferred_ctas:preferredCtas,
  });
  const knowledge=await knowledgeService.create(organizationId,{name:`Website Bootstrap — ${String(brand.company_name||run.website_url)}`,type:'manual',url:String(run.website_url),config:{bootstrap_run_id:runId,verified_only:true}},userId);
  await knowledgeService.createItem(organizationId,knowledge.id,{title:'Owner-accepted first-party Business Brain',content:JSON.stringify(run.business_brain,null,2),content_type:'application/json',url:String(run.website_url),metadata:{bootstrap_run_id:runId,fact_policy:'verified_first_party_or_owner_supplied_only'}});
  await query(`UPDATE library_packs SET status='active',updated_at=NOW() WHERE id=$1 AND organization_id=$2`,[pack.id,organizationId]);
  await installPack(organizationId,pack.id,userId);
  await query(`UPDATE brand_bootstrap_runs SET proposed_pack_id=$1,status='accepted',updated_at=NOW() WHERE id=$2 AND organization_id=$3`,[pack.id,runId,organizationId]);
  return getBrandBootstrap(organizationId,runId);
}

export async function importFirstPartyBrandAsset(organizationId:string,userId:string,runId:string,websiteUrl:string,assetUrl:string,name:string){
  const website=new URL(websiteUrl);const source=new URL(assetUrl,website);
  if(source.origin!==website.origin) throw new AppError(400,'Brand Bootstrap assets must remain first-party','BRAND_ASSET_NOT_FIRST_PARTY');
  const response=await safeFetch(source.toString(),{timeoutMs:20000,maxRedirects:2,maxResponseBytes:5*1024*1024});
  const mime=String(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
  const extension:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg'};
  if(!response.ok||!extension[mime]) throw new AppError(422,'First-party brand asset format is not supported','BRAND_ASSET_FORMAT_UNSUPPORTED');
  const bytes=await response.bytes();const filename=`brand-bootstrap-${crypto.randomUUID()}.${extension[mime]}`;
  const directory=path.join(process.cwd(),'uploads','brand-bootstrap',organizationId);await fs.mkdir(directory,{recursive:true});const storagePath=path.join(directory,filename);await fs.writeFile(storagePath,bytes);
  const asset=await studioService.createAsset(organizationId,userId,{filename,originalName:name,mimeType:mime,size:bytes.byteLength,path:storagePath});
  try{return await transaction(async(client)=>{
    const provenance=await client.query(`INSERT INTO asset_provenance_ledger (organization_id,provider,provider_asset_id,provider_page_url,source_file_url,creator_name,license_identifier,commercial_use_allowed,derivatives_allowed,attribution_required,attribution_text,downloaded_at,original_metadata) VALUES ($1,'first_party_website',$2,$3,$3,$4,'owner-authorized-first-party',TRUE,TRUE,FALSE,$5,NOW(),$6) ON CONFLICT (organization_id,provider,provider_asset_id) DO UPDATE SET source_file_url=EXCLUDED.source_file_url,downloaded_at=NOW(),updated_at=NOW() RETURNING id`,[organizationId,crypto.createHash('sha256').update(source.toString()).digest('hex'),source.toString(),name,`First-party asset from ${website.hostname}`,JSON.stringify({bootstrap_run_id:runId})]);
    return (await client.query(`INSERT INTO marketing_library_items (organization_id,provenance_id,studio_asset_id,item_key,kind,category,name,description,tags,platforms,definition,preview,source_kind,approval_status,is_editable,is_brandable,created_by) VALUES ($1,$2,$3,$4,'brand_asset','brand-assets',$5,$6,'["first-party","brand"]','[]',$7,$8,'first_party','approved',TRUE,TRUE,$9) ON CONFLICT (organization_id,item_key) DO UPDATE SET studio_asset_id=EXCLUDED.studio_asset_id,provenance_id=EXCLUDED.provenance_id,preview=EXCLUDED.preview,deleted_at=NULL,updated_at=NOW() RETURNING *`,[organizationId,provenance.rows[0].id,asset.id,`bootstrap:${runId}:first-party:${crypto.createHash('sha256').update(source.toString()).digest('hex').slice(0,16)}`,name,'Owner-accepted first-party website asset.',JSON.stringify({bootstrap_run_id:runId,source_url:source.toString()}),JSON.stringify({url:asset.url}),userId])).rows[0];
  });}catch(error){await studioService.deleteAsset(asset.id,organizationId).catch(()=>undefined);throw error;}
}

export function bootstrapRunKey(organizationId: string, websiteUrl: string): string {
  return crypto.createHash('sha256').update(`${organizationId}|${websiteUrl}`).digest('hex');
}

#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const need=(name)=>{const value=String(process.env[name]||'').trim();if(!value)throw new Error(`${name} is required`);return value;};
const check=String(process.argv[2]||'').trim();
const report={command:'acceptance:provider',check,status:'FAIL',started_at:new Date().toISOString(),quote:null,provider:null,model:null,operation:null,generation_ids:[],project_ids:[],scene_ids:[],render_ids:[],asset_ids:[],asset_urls:[],media:[],credits:null,reason:null};
let tempDirectory;
const finish=(code)=>{if(tempDirectory)fs.rmSync(tempDirectory,{recursive:true,force:true});report.finished_at=new Date().toISOString();console.log(`PROVIDER_ACCEPTANCE_REPORT=${JSON.stringify(report)}`);process.exit(code);};

try {
  if(!['text','image','short-video','audio-voice','advert-30','longform-60'].includes(check))throw new Error('Check must be text, image, short-video, audio-voice, advert-30, or longform-60');
  const api=need('LIVE_API_URL').replace(/\/+$/,'').replace(/\/api$/,'/api/v1');
  const origin=new URL(api).origin;
  const organizationId=need('LIVE_ORGANIZATION_ID');
  const cookie=need('LIVE_SESSION_COOKIE');
  const ceiling=Number(need('LIVE_MAX_CREDITS'));
  if(!Number.isSafeInteger(ceiling)||ceiling<=0)throw new Error('LIVE_MAX_CREDITS must be a positive integer');
  const timeoutMs=Math.max(30_000,Number(process.env.LIVE_PROVIDER_TIMEOUT_MS||1_800_000));
  const pollMs=Math.max(1_000,Number(process.env.LIVE_PROVIDER_POLL_MS||5_000));
  const headers={'Content-Type':'application/json',Cookie:cookie,'X-Organization-Id':organizationId};
  const request=async(method,route,body)=>{const response=await fetch(`${api}${route}`,{method,headers,body:body===undefined?undefined:JSON.stringify({...body,organization_id:organizationId})});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`${response.status} ${payload?.error?.message||response.statusText}`);return payload.data;};
  const get=(route)=>request('GET',route);
  const post=(route,body={})=>request('POST',route,body);
  const acceptanceStartedAt=new Date().toISOString();
  const activityBefore=await get(`/generation-credits/activity?organization_id=${encodeURIComponent(organizationId)}&since=${encodeURIComponent(acceptanceStartedAt)}`);
  const idempotencyKey=String(process.env.LIVE_PROVIDER_IDEMPOTENCY_KEY||`provider-acceptance:${check}:${crypto.randomUUID()}`);
  let trackedJobIds=[];

  const waitFor=async(label,load,terminal,failed)=>{const deadline=Date.now()+timeoutMs;let current;while(Date.now()<deadline){current=await load();const state=String(current.status||'').toLowerCase();console.log(`${label}: ${state}${current.progress!==undefined?` ${current.progress}%`:''}`);if(failed.includes(state))throw new Error(`${label} failed: ${current.error_message||current.error||state}`);if(terminal.includes(state))return current;await new Promise(resolve=>setTimeout(resolve,pollMs));}throw new Error(`${label} timed out in ${String(current?.status||'unknown')} state`);};
  const verifyMedia=async(url,kind,expectedDuration)=>{const absolute=new URL(url,origin).toString();const sameOrigin=new URL(absolute).origin===origin;const response=await fetch(absolute,{headers:sameOrigin?{Cookie:cookie}:{}});if(!response.ok)throw new Error(`Durable media fetch failed ${response.status}: ${url}`);const bytes=Buffer.from(await response.arrayBuffer());const contentType=String(response.headers.get('content-type')||'').toLowerCase();if(bytes.byteLength<=0)throw new Error(`Durable media was empty: ${url}`);if(kind==='video'&&!contentType.startsWith('video/'))throw new Error(`Expected video content type, received ${contentType||'missing'}`);if(kind==='audio'&&!contentType.startsWith('audio/'))throw new Error(`Expected audio content type, received ${contentType||'missing'}`);const evidence={url,bytes:bytes.byteLength,content_type:contentType,ffprobe:null};if(['video','audio'].includes(kind)&&spawnSync('ffprobe',['-version'],{stdio:'ignore'}).status===0){tempDirectory ||= fs.mkdtempSync(path.join(os.tmpdir(),'amarktai-provider-'));const file=path.join(tempDirectory,`${crypto.randomUUID()}${kind==='video'?'.mp4':'.audio'}`);fs.writeFileSync(file,bytes);const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration,size,format_name:stream=codec_name,codec_type,width,height','-of','json',file],{encoding:'utf8'});if(probe.status!==0)throw new Error(`ffprobe rejected durable ${kind}`);evidence.ffprobe=JSON.parse(probe.stdout||'{}');const duration=Number(evidence.ffprobe?.format?.duration||0);if(expectedDuration&&Math.abs(duration-expectedDuration)>Math.max(2,expectedDuration*0.08))throw new Error(`Expected approximately ${expectedDuration}s, probed ${duration}s`);}report.media.push(evidence);};

  if(check==='longform-60'){
    const projectId=need('LIVE_LONGFORM_PROJECT_ID');report.project_ids.push(projectId);
    const quote=await post(`/longform-video/projects/${encodeURIComponent(projectId)}/quote`);report.quote=quote;report.operation='smart_hybrid_longform';report.provider='Amarktai Network';report.model=[...new Set((quote.scenes||[]).map(scene=>scene.model_id).filter(Boolean))];
    console.log(JSON.stringify({provider:report.provider,model:report.model,operation:report.operation,estimated_credits:quote.total_estimated_credits,estimated_value:quote.approximate_billing_value,quote},null,2));
    if(Number(quote.planned_duration_seconds)!==60)throw new Error('Long-form planned duration must be exactly 60 seconds');
    if(String(quote.strategy)!=='smart')throw new Error(`Long-form strategy must be smart, received ${quote.strategy}`);
    if(!quote.within_budget)throw new Error('Long-form quote is outside the persisted project budget');
    if(Number(quote.total_estimated_credits)>ceiling)throw new Error(`Quote exceeds LIVE_MAX_CREDITS (${ceiling})`);
    if(!quote.quoted_at||Date.now()-new Date(quote.quoted_at).getTime()>5*60_000)throw new Error('Long-form quote is not fresh');
    const maximumAgeMinutes=Number(process.env.LIVE_PRICE_MAX_AGE_MINUTES||720);const pricedPlans=[...(quote.scenes||[]),...Object.values(quote.audio||{}).filter(Boolean)];
    if(pricedPlans.length===0||pricedPlans.some(plan=>{const value=plan.pricing_last_synced_at||plan.pricingLastSyncedAt;const syncedAt=new Date(value);return !Number.isFinite(syncedAt.getTime())||Date.now()-syncedAt.getTime()>maximumAgeMinutes*60_000;}))throw new Error('One or more long-form model prices are missing or stale');
    if(process.env.LIVE_PROVIDER_ACCEPTANCE!=='I_ACCEPT_PAID_PROVIDER_COSTS')throw new Error('Paid submission requires LIVE_PROVIDER_ACCEPTANCE=I_ACCEPT_PAID_PROVIDER_COSTS');
    await post(`/longform-video/projects/${encodeURIComponent(projectId)}/generate`,{idempotency_key:idempotencyKey});
    const deadline=Date.now()+timeoutMs;let progress;while(Date.now()<deadline){progress=await get(`/longform-video/projects/${encodeURIComponent(projectId)}/progress?organization_id=${encodeURIComponent(organizationId)}`);console.log(`long-form scenes: ${progress.completed_scenes}/${progress.total_scenes}`);if(Number(progress.failed_scenes)>0)throw new Error('One or more long-form scenes failed');if(Number(progress.total_scenes)>0&&Number(progress.completed_scenes)===Number(progress.total_scenes))break;await new Promise(resolve=>setTimeout(resolve,pollMs));}if(Number(progress?.completed_scenes)!==Number(progress?.total_scenes))throw new Error('Long-form scene generation timed out');
    const scenes=await get(`/longform-video/projects/${encodeURIComponent(projectId)}/scenes?organization_id=${encodeURIComponent(organizationId)}`);report.scene_ids=scenes.map(scene=>String(scene.id));trackedJobIds=[...report.scene_ids];
    for(const scene of scenes){if(!scene.generated_clip_url)throw new Error(`Scene ${scene.id} has no persisted clip`);report.asset_urls.push(scene.generated_clip_url);for(const id of [scene.metadata?.still_asset_id,scene.metadata?.generated_clip_asset_id,scene.metadata?.continuity_output?.asset_id,scene.final_frame_asset_id,scene.generated_clip_url.match(/\/studio\/assets\/([0-9a-f-]{36})/i)?.[1]].filter(Boolean))report.asset_ids.push(String(id));await verifyMedia(scene.generated_clip_url,'video',Number(scene.duration_seconds||0)||undefined);}
    const render=await post(`/longform-video/projects/${encodeURIComponent(projectId)}/renders`,{idempotency_key:`${idempotencyKey}:render`});report.render_ids.push(String(render.id));
    const completed=await waitFor('final render',()=>get(`/longform-video/renders/${encodeURIComponent(render.id)}?organization_id=${encodeURIComponent(organizationId)}`),['completed'],['failed','cancelled']);
    if(!completed.output_url||!completed.thumbnail_url)throw new Error('Final render omitted MP4 or thumbnail');
    report.asset_urls.push(completed.output_url,completed.thumbnail_url);if(completed.output_asset_id)report.asset_ids.push(String(completed.output_asset_id));if(completed.thumbnail_asset_id)report.asset_ids.push(String(completed.thumbnail_asset_id));
    await verifyMedia(completed.output_url,'video',60);await verifyMedia(completed.thumbnail_url,'image');
    for(const id of [completed.render_config?.srt_asset_id,completed.render_config?.vtt_asset_id].filter(Boolean))report.asset_ids.push(String(id));
    for(const captions of [completed.render_config?.srt_url,completed.render_config?.vtt_url].filter(Boolean)){report.asset_urls.push(captions);await verifyMedia(captions,'text');}
    const persistedProject=await get(`/longform-video/projects/${encodeURIComponent(projectId)}?organization_id=${encodeURIComponent(organizationId)}`);const persistedRender=await get(`/longform-video/renders/${encodeURIComponent(render.id)}?organization_id=${encodeURIComponent(organizationId)}`);
    if(persistedProject.final_output_url!==completed.output_url||persistedRender.output_url!==completed.output_url)throw new Error('Final render did not persist across re-fetch');
    if(persistedProject.caption_settings?.enabled===true&&(!completed.render_config?.srt_url||!completed.render_config?.vtt_url))throw new Error('Requested captions were not persisted as SRT and VTT assets');
  }else{
    const model=need('LIVE_MODEL_ID');const operation=need('LIVE_OPERATION');const quantity=Number(need('LIVE_QUANTITY'));const payload=JSON.parse(need('LIVE_REQUEST_JSON'));
    const quote=await post('/admin/genx/pricing/quote',{model_id:model,operation,quantity});report.quote=quote;report.provider='Amarktai Network';report.model=quote.model_id;report.operation=quote.operation;
    console.log(JSON.stringify({provider:report.provider,model:report.model,operation:report.operation,pricing_last_synced_at:quote.pricing_last_synced_at,estimated_credits:quote.reservation_credits,estimated_value:{currency:quote.currency,gbp:quote.retail_charge_gbp}},null,2));
    const maximumAgeMinutes=Number(process.env.LIVE_PRICE_MAX_AGE_MINUTES||720);const syncedAt=new Date(quote.pricing_last_synced_at);
    if(!Number.isFinite(syncedAt.getTime())||Date.now()-syncedAt.getTime()>maximumAgeMinutes*60_000)throw new Error('Pricing freshness check failed');
    if(Number(quote.reservation_credits)>ceiling)throw new Error(`Quote exceeds LIVE_MAX_CREDITS (${ceiling})`);
    if(process.env.LIVE_PROVIDER_ACCEPTANCE!=='I_ACCEPT_PAID_PROVIDER_COSTS')throw new Error('Paid submission requires LIVE_PROVIDER_ACCEPTANCE=I_ACCEPT_PAID_PROVIDER_COSTS');
    payload.options={...(payload.options||{}),idempotency_key:idempotencyKey,quantity};payload.model=model;payload.type=payload.type||operation;
    const submitted=await post('/studio/generations',payload);report.generation_ids.push(String(submitted.id));trackedJobIds=[String(submitted.id)];
    const completed=await waitFor('generation',()=>get(`/studio/generations/${encodeURIComponent(submitted.id)}?organization_id=${encodeURIComponent(organizationId)}`),['completed'],['failed','cancelled']);
    if(!completed.provider_job_id)throw new Error('Completed generation has no provider job ID');
    const persisted=await get(`/studio/generations/${encodeURIComponent(submitted.id)}?organization_id=${encodeURIComponent(organizationId)}`);if(String(persisted.id)!==String(submitted.id)||persisted.status!=='completed')throw new Error('Completed generation did not persist');
    const urls=Array.isArray(persisted.output_urls)?persisted.output_urls:[];report.asset_urls.push(...urls);if(persisted.metadata?.studio_asset_id)report.asset_ids.push(String(persisted.metadata.studio_asset_id));for(const url of urls){const id=String(url).match(/\/studio\/assets\/([0-9a-f-]{36})/i)?.[1];if(id)report.asset_ids.push(id);}
    if(check==='text'){if(!persisted.metadata?.provider_result&&!urls.length)throw new Error('Text result has neither persisted provider result nor durable output');}
    else {if(!urls.length)throw new Error('Completed media generation has no durable Studio asset URL');const kind=check==='audio-voice'?'audio':check.includes('video')||check==='advert-30'?'video':'image';for(const url of urls)await verifyMedia(url,kind,check==='advert-30'?30:undefined);}
  }

  const activityAfter=await get(`/generation-credits/activity?organization_id=${encodeURIComponent(organizationId)}&since=${encodeURIComponent(acceptanceStartedAt)}`);
  const reservations=(activityAfter.reservations||[]).filter(item=>trackedJobIds.includes(String(item.generation_job_id||'')));
  if(reservations.length===0)throw new Error('No credit reservation could be correlated to the accepted operation');
  if(reservations.some(item=>['reserved','submitted'].includes(String(item.status))))throw new Error('Credit accounting is ambiguous: a reservation remains active');
  const reserved=reservations.reduce((sum,item)=>sum+Number(item.reserved_credits||0),0);const settled=reservations.reduce((sum,item)=>sum+Number(item.settled_credits||0),0);const released=reservations.reduce((sum,item)=>sum+Number(item.released_credits||0),0);
  if(reservations.some(item=>Number(item.settled_credits||0)+Number(item.released_credits||0)!==Number(item.reserved_credits||0)))throw new Error('Credit reservation does not reconcile');
  if(settled>ceiling)throw new Error(`Actual settled credits ${settled} exceed LIVE_MAX_CREDITS ${ceiling}`);
  const ledger=(activityAfter.ledger||[]).filter(entry=>reservations.some(item=>String(item.id)===String(entry.reservation_id)));
  const ledgerSettled=ledger.filter(entry=>entry.entry_type==='settlement').reduce((sum,item)=>sum+Number(item.credits||0),0);const ledgerReleased=ledger.filter(entry=>entry.entry_type==='release').reduce((sum,item)=>sum+Number(item.credits||0),0);
  if(ledgerSettled!==settled||ledgerReleased!==released)throw new Error('Reservation and immutable ledger totals disagree');
  report.credits={wallet_before:activityBefore.wallet,wallet_after:activityAfter.wallet,reserved,settled,released_or_reversed:released,actual_credits:settled,reservation_ids:reservations.map(item=>item.id),ledger_entry_ids:ledger.map(item=>item.id)};
  report.asset_urls=[...new Set(report.asset_urls)];report.asset_ids=[...new Set(report.asset_ids)];report.status='PASS';report.reason='Quote, execution, persistence, durable output and credit accounting verified';finish(0);
}catch(error){report.reason=error instanceof Error?error.message:String(error);finish(1);}

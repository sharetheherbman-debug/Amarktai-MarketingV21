#!/usr/bin/env node
const need=(name)=>{const value=String(process.env[name]||'').trim();if(!value)throw new Error(`${name} is required`);return value;};
const api=need('LIVE_API_URL').replace(/\/+$/,'').replace(/\/api$/,'/api/v1');
const organizationId=need('LIVE_ORGANIZATION_ID');
const cookie=need('LIVE_SESSION_COOKIE');
const ceiling=Number(need('LIVE_MAX_CREDITS'));
const check=String(process.argv[2]||'').trim();
if(!Number.isSafeInteger(ceiling)||ceiling<=0)throw new Error('LIVE_MAX_CREDITS must be a positive integer');
if(!['text','image','short-video','audio-voice','advert-30','longform-60'].includes(check))throw new Error('Check must be text, image, short-video, audio-voice, advert-30, or longform-60');
const headers={'Content-Type':'application/json',Cookie:cookie,'X-Organization-Id':organizationId};
async function request(path,body){const response=await fetch(`${api}${path}`,{method:'POST',headers,body:JSON.stringify({...body,organization_id:organizationId})});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`${response.status} ${payload?.error?.message||response.statusText}`);return payload.data;}
let quote;let execute;
if(check==='longform-60'){
  const projectId=need('LIVE_LONGFORM_PROJECT_ID');quote=await request(`/longform-video/projects/${encodeURIComponent(projectId)}/quote`,{});
  if(Number(quote.planned_duration_seconds)!==60)throw new Error('The selected long-form project is not exactly 60 seconds');
  execute=()=>request(`/longform-video/projects/${encodeURIComponent(projectId)}/generate`,{});
}else{
  const payload=JSON.parse(need('LIVE_REQUEST_JSON'));const pricing=await request('/genx/pricing/quote',{model_id:need('LIVE_MODEL_ID'),operation:need('LIVE_OPERATION'),quantity:Number(need('LIVE_QUANTITY'))});
  quote={check,model_id:pricing.model_id,operation:pricing.operation,total_estimated_credits:pricing.reservation_credits,approximate_billing_value:{currency:pricing.currency,amount:pricing.retail_charge_gbp}};execute=()=>request('/studio/generations',payload);
}
console.log(JSON.stringify({paid_provider_check:check,quote},null,2));
const credits=Number(quote.total_estimated_credits||quote.reservation_credits||0);
if(!Number.isFinite(credits)||credits<=0)throw new Error('Quote did not contain a positive credit estimate');
if(credits>ceiling)throw new Error(`Quote ${credits} exceeds explicit ceiling ${ceiling}`);
if(process.env.LIVE_PROVIDER_ACCEPTANCE!=='I_ACCEPT_PAID_PROVIDER_COSTS'){console.log('QUOTE ONLY: set LIVE_PROVIDER_ACCEPTANCE=I_ACCEPT_PAID_PROVIDER_COSTS to submit this paid request.');process.exit(0);}
console.log(JSON.stringify({submitted:await execute()},null,2));

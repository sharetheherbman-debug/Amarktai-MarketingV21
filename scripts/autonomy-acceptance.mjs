#!/usr/bin/env node
import crypto from 'node:crypto';

const need=(name)=>{const value=String(process.env[name]||'').trim();if(!value)throw new Error(`${name} is required`);return value;};
const objective=process.argv.slice(2).join(' ').trim();
const report={command:'acceptance:autonomy',status:'FAIL',started_at:new Date().toISOString(),cycle_id:null,transitions:[],campaign_ids:[],campaign_plan_ids:[],content_ids:[],generation_ids:[],asset_ids:[],reason:null};
const emit=(exitCode)=>{report.finished_at=new Date().toISOString();console.log(`AUTONOMY_ACCEPTANCE_REPORT=${JSON.stringify(report)}`);process.exit(exitCode);};

try {
  if(objective.length<10)throw new Error('Supply the owner objective as the command argument');
  const api=need('LIVE_API_URL').replace(/\/+$/,'').replace(/\/api$/,'/api/v1');
  const organizationId=need('LIVE_ORGANIZATION_ID');
  const cookie=need('LIVE_SESSION_COOKIE');
  const ceiling=Number(need('LIVE_MAX_CREDITS'));
  if(!Number.isSafeInteger(ceiling)||ceiling<=0)throw new Error('LIVE_MAX_CREDITS must be a positive integer');
  const scopes=String(process.env.LIVE_PRODUCT_LINES||'').split(',').map(value=>value.trim()).filter(Boolean);
  const timeoutMs=Math.max(30_000,Number(process.env.LIVE_AUTONOMY_TIMEOUT_MS||1_800_000));
  const pollMs=Math.max(1_000,Number(process.env.LIVE_AUTONOMY_POLL_MS||5_000));
  const idempotencyKey=String(process.env.LIVE_AUTONOMY_IDEMPOTENCY_KEY||`owner-acceptance:${crypto.randomUUID()}`);
  const headers={'Content-Type':'application/json',Cookie:cookie,'X-Organization-Id':organizationId};
  const request=async(path,init={})=>{const response=await fetch(`${api}${path}`,{...init,headers:{...headers,...init.headers}});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`${response.status} ${payload?.error?.message||response.statusText}`);return payload.data;};
  const cycle=await request('/growth-director/cycles',{method:'POST',body:JSON.stringify({organization_id:organizationId,objective,product_lines:scopes,idempotency_key:idempotencyKey,generation_credit_ceiling:ceiling})});
  report.cycle_id=String(cycle.id);console.log(`Cycle ID: ${report.cycle_id}`);
  const deadline=Date.now()+timeoutMs;let lastSignature='';let finalCycle;
  while(Date.now()<deadline){
    const current=await request(`/growth-director/cycles/${encodeURIComponent(report.cycle_id)}?organization_id=${encodeURIComponent(organizationId)}`);
    finalCycle=current;
    const events=Array.isArray(current.events)?current.events:[];
    const signature=events.map(event=>`${event.phase}:${event.event_type}:${event.created_at}`).join('|');
    if(signature!==lastSignature){
      for(const event of events.slice(report.transitions.length)){const transition={phase:event.phase,event_type:event.event_type,created_at:event.created_at};report.transitions.push(transition);console.log(`${transition.created_at} ${transition.phase} — ${transition.event_type}`);}
      lastSignature=signature;
    }
    for(const key of ['campaign_ids','campaign_plan_ids','content_ids','generation_ids','asset_ids'])report[key]=Array.isArray(current[key])?current[key]:[];
    const status=String(current.status||'');
    const mode=String(current.operating_mode||current.state?.governance_mode_at_start||'unknown');
    if(status==='failed')throw new Error(String(current.error_message||'Autonomous cycle failed'));
    if(status==='completed')break;
    if(status==='awaiting_owner_approval'&&mode!=='autonomous'){report.status='PASS';report.reason=`Stopped truthfully at owner approval in ${mode} mode`;emit(0);}
    if(status==='paused')throw new Error('Autonomous cycle was paused');
    await new Promise(resolve=>setTimeout(resolve,pollMs));
  }
  if(!finalCycle)throw new Error('Cycle could not be re-fetched');
  if(String(finalCycle.status)!=='completed')throw new Error(`Timed out in ${String(finalCycle.status||'unknown')} phase`);
  const persisted=await request(`/growth-director/cycles/${encodeURIComponent(report.cycle_id)}?organization_id=${encodeURIComponent(organizationId)}`);
  if(String(persisted.originating_instruction||persisted.objective)!==objective)throw new Error('Persisted originating instruction does not match');
  report.status='PASS';report.reason='Bounded autonomous cycle completed and was re-fetched';emit(0);
}catch(error){report.reason=error instanceof Error?error.message:String(error);emit(1);}

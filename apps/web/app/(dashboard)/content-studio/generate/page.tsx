'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, FileText, Globe2, Loader2, Mail, Megaphone, Palette, ShieldCheck, Sparkles, Target, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import type { ApiResponse } from '@/types';

const contentTypes=[
  {value:'blog',label:'Blog Post',icon:FileText,description:'Long-form blog article'},
  {value:'article',label:'Article',icon:FileText,description:'In-depth article'},
  {value:'landing_page',label:'Landing Page',icon:Globe2,description:'Conversion-focused page'},
  {value:'sales_page',label:'Sales Page',icon:Megaphone,description:'Sales copy'},
  {value:'email',label:'Email',icon:Mail,description:'Email campaign'},
  {value:'newsletter',label:'Newsletter',icon:Mail,description:'Newsletter content'},
  {value:'social',label:'Social Post',icon:Globe2,description:'Social media post'},
  {value:'product_desc',label:'Product Description',icon:FileText,description:'Product copy'},
  {value:'press_release',label:'Press Release',icon:FileText,description:'Press release'},
  {value:'case_study',label:'Case Study',icon:FileText,description:'Customer case study'},
  {value:'faq',label:'FAQ',icon:FileText,description:'FAQ content'},
  {value:'ad',label:'Advertisement',icon:Megaphone,description:'Platform-specific ad copy'},
  {value:'image',label:'Image Brief',icon:Palette,description:'Visual concept, prompt and alt text'},
  {value:'video',label:'Video Script',icon:FileText,description:'Scenes, narration and production notes'},
];
const platforms=['web','facebook','instagram','linkedin','x','threads','pinterest','reddit','youtube','email'];
const tones=['professional','friendly','authoritative','conversational','educational','persuasive'];
const input='ep-input min-h-10 px-3 py-2 text-sm';
type Plan={id:string;name:string;status:string;creative_concept?:{name?:string}};type Template={id:string;name:string;type:string};type Control={emergency_stop?:boolean;operating_mode?:string};

export default function GenerateContentPage(){
  const router=useRouter();const {currentOrganization}=useAuthStore();const orgId=currentOrganization?.id||'';
  const [generating,setGenerating]=useState(false);const [error,setError]=useState<string|null>(null);const generationAttempt=useRef<{fingerprint:string;key:string}|null>(null);
  const [plans,setPlans]=useState<Plan[]>([]);const [templates,setTemplates]=useState<Template[]>([]);const [control,setControl]=useState<Control>({});
  const [form,setForm]=useState({type:'blog',platform:'web',title:'',prompt:'',max_words:1000,tone:'professional',campaign_plan_id:'',audience:'',objective:'',offer:'',calls_to_action:'',creative_direction:'',required_terms:'',prohibited_claims:'',alt_text:'',template_id:''});
  const executionAllowed=control.emergency_stop===false;

  useEffect(()=>{if(!orgId)return;void Promise.allSettled([api.get<ApiResponse<Plan[]>>('/campaign-ai/plans',{params:{organization_id:orgId}}),api.get<ApiResponse<Template[]>>('/templates',{params:{organization_id:orgId}}),api.get<ApiResponse<Control>>('/relaunch-control')]).then(([planResult,templateResult,controlResult])=>{if(planResult.status==='fulfilled')setPlans((planResult.value.data||[]).filter((plan)=>plan.status==='approved'));if(templateResult.status==='fulfilled')setTemplates(templateResult.value.data||[]);if(controlResult.status==='fulfilled')setControl(controlResult.value.data||{});});},[orgId]);

  const generate=async()=>{if(!form.prompt.trim()||!orgId||!executionAllowed)return;setGenerating(true);setError(null);try{const payload={...form,campaign_plan_id:form.campaign_plan_id||undefined,template_id:form.template_id||undefined,calls_to_action:lines(form.calls_to_action),required_terms:lines(form.required_terms),prohibited_claims:lines(form.prohibited_claims),organization_id:orgId};const fingerprint=JSON.stringify(payload);if(!generationAttempt.current||generationAttempt.current.fingerprint!==fingerprint)generationAttempt.current={fingerprint,key:crypto.randomUUID()};const response=await api.post<ApiResponse<{content:{id:string}}>>('/content-studio/generate',{body:{...payload,idempotency_key:`content:${generationAttempt.current.key}`}});generationAttempt.current=null;router.push(`/content-studio/${response.data.content.id}`);}catch(caught){setError(caught instanceof Error?caught.message:'Content generation failed safely.');}finally{setGenerating(false);}};

  return <div className="mx-auto max-w-6xl space-y-6">
    <button type="button" onClick={()=>router.back()} className="inline-flex items-center gap-2 text-sm font-extrabold text-[var(--ep-blue)]"><ArrowLeft className="h-4 w-4"/> Back to Content Studio</button>
    <header className="ep-panel p-6 sm:p-8"><p className="ep-section-label">Content Studio · Create</p><h1 className="ep-page-title mt-2">Create a grounded campaign asset, not generic copy.</h1><p className="ep-page-copy mt-3 max-w-3xl text-sm leading-6 sm:text-base">Use an approved strategy or a standalone factual brief. Brand DNA, Business Brain context, quality checks, owner review and Generation Credit controls remain part of the existing governed workflow.</p></header>
    {!executionAllowed&&<div className="ep-status-warning rounded-xl border p-4"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0"/><div><p className="font-extrabold">Generation is paused by Emergency Stop.</p><p className="mt-1 text-xs leading-5 opacity-80">You can prepare the complete brief, but the paid provider request remains disabled until launch safety is deliberately released.</p></div></div></div>}
    {error&&<div className="ep-status-danger flex items-start gap-3 rounded-xl border px-4 py-3 text-sm"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span className="flex-1">{error}</span><button type="button" onClick={()=>setError(null)}><X className="h-4 w-4"/></button></div>}

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <section className="ep-card p-5 sm:p-6"><div className="flex items-start gap-3"><span className="rounded-xl bg-[var(--ep-blue-soft)] p-2.5 text-[var(--ep-blue)]"><ShieldCheck className="h-5 w-5"/></span><div className="flex-1"><p className="ep-section-label">Campaign context</p><h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">Approved campaign strategy</h2><p className="mt-1 text-sm leading-5 text-[var(--ep-text-muted)]">Optional for standalone content; required for coordinated campaign production.</p><select value={form.campaign_plan_id} onChange={(event)=>setForm({...form,campaign_plan_id:event.target.value})} className={`${input} mt-4`}><option value="">Standalone content</option>{plans.map((plan)=><option key={plan.id} value={plan.id}>{plan.name}{plan.creative_concept?.name?` — ${plan.creative_concept.name}`:''}</option>)}</select>{plans.length===0&&<p className="mt-2 text-xs font-semibold text-[var(--ep-warning)]">No approved campaign strategies are currently available.</p>}</div></div></section>

        <section className="ep-card p-5 sm:p-6"><p className="ep-section-label">Format</p><h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">What are we creating?</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{contentTypes.map((item)=><button key={item.value} type="button" onClick={()=>setForm({...form,type:item.value})} className={form.type===item.value?'rounded-xl border border-[var(--ep-blue)] bg-[var(--ep-blue-soft)] p-4 text-left':'rounded-xl border border-[var(--ep-border)] bg-white p-4 text-left hover:border-[#9fb4c8]'}><item.icon className="h-5 w-5 text-[var(--ep-blue)]"/><p className="mt-3 text-sm font-extrabold text-[var(--ep-navy)]">{item.label}</p><p className="mt-1 text-xs leading-5 text-[var(--ep-text-muted)]">{item.description}</p></button>)}</div></section>

        <section className="ep-card p-5 sm:p-6"><div className="flex items-center gap-2"><Target className="h-5 w-5 text-[var(--ep-blue)]"/><h2 className="text-lg font-extrabold text-[var(--ep-navy)]">Audience, offer & outcome</h2></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Audience"><input value={form.audience} onChange={(event)=>setForm({...form,audience:event.target.value})} placeholder="Specific audience, need and objection" className={input}/></Field><Field label="Objective"><input value={form.objective} onChange={(event)=>setForm({...form,objective:event.target.value})} placeholder="What should this asset achieve?" className={input}/></Field><Field label="Approved offer"><input value={form.offer} onChange={(event)=>setForm({...form,offer:event.target.value})} placeholder="Leave blank rather than inventing an offer" className={input}/></Field><Field label="Calls to action"><textarea rows={3} value={form.calls_to_action} onChange={(event)=>setForm({...form,calls_to_action:event.target.value})} placeholder="One approved CTA per line" className="ep-input p-3 text-sm"/></Field></div></section>

        <section className="ep-card p-5 sm:p-6"><div className="flex items-center gap-2"><Palette className="h-5 w-5 text-[var(--ep-blue)]"/><h2 className="text-lg font-extrabold text-[var(--ep-navy)]">Creative & factual guardrails</h2></div><div className="mt-4 space-y-4"><Field label="Creative direction"><textarea rows={4} value={form.creative_direction} onChange={(event)=>setForm({...form,creative_direction:event.target.value})} placeholder="Hook, narrative treatment, structure or visual direction" className="ep-input p-3 text-sm leading-6"/></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Required factual terms"><textarea rows={4} value={form.required_terms} onChange={(event)=>setForm({...form,required_terms:event.target.value})} placeholder="One required term per line" className="ep-input p-3 text-sm"/></Field><Field label="Prohibited claims"><textarea rows={4} value={form.prohibited_claims} onChange={(event)=>setForm({...form,prohibited_claims:event.target.value})} placeholder="One prohibited claim per line" className="ep-input p-3 text-sm"/></Field></div>{['image','video'].includes(form.type)&&<Field label="Accessibility text"><input value={form.alt_text} onChange={(event)=>setForm({...form,alt_text:event.target.value})} placeholder="Describe the essential visual meaning" className={input}/></Field>}</div></section>

        <section className="ep-card p-5 sm:p-6"><p className="ep-section-label">Creative brief</p><div className="mt-4 space-y-4"><Field label="Title (optional)"><input value={form.title} onChange={(event)=>setForm({...form,title:event.target.value})} placeholder="Content title" className={input}/></Field><Field label="Prompt / brief *"><textarea rows={7} value={form.prompt} onChange={(event)=>setForm({...form,prompt:event.target.value})} placeholder="Describe the topic, required points, intended audience and outcome. Ground claims in approved business facts." className="ep-input p-3 text-sm leading-6"/></Field></div></section>
      </div>

      <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
        <section className="ep-card p-5"><p className="ep-section-label">Settings</p><div className="mt-4 space-y-4"><Field label="Platform"><select value={form.platform} onChange={(event)=>setForm({...form,platform:event.target.value})} className={input}>{platforms.map((platform)=><option key={platform} value={platform}>{label(platform)}</option>)}</select></Field><Field label="Tone"><select value={form.tone} onChange={(event)=>setForm({...form,tone:event.target.value})} className={input}>{tones.map((tone)=><option key={tone} value={tone}>{label(tone)}</option>)}</select></Field><Field label="Maximum words"><input type="number" min="20" max="10000" value={form.max_words} onChange={(event)=>setForm({...form,max_words:Number(event.target.value)||1000})} className={input}/></Field><Field label="Reusable template"><select value={form.template_id} onChange={(event)=>setForm({...form,template_id:event.target.value})} className={input}><option value="">No template</option>{templates.filter((template)=>template.type===form.type||form.type==='image'||form.type==='video').map((template)=><option key={template.id} value={template.id}>{template.name}</option>)}</select></Field></div></section>
        <section className="ep-card p-5"><h2 className="font-extrabold text-[var(--ep-navy)]">What happens next</h2><ol className="mt-3 space-y-3 text-xs leading-5 text-[var(--ep-text-muted)]"><li>1. The provider call requires a fresh Control Centre decision and credit reservation.</li><li>2. Brand and Business Brain context ground the draft.</li><li>3. Quality checks can block weak or unsafe work.</li><li>4. The exact version can be edited and submitted to the owner for approval.</li></ol></section>
        <button type="button" onClick={()=>void generate()} disabled={generating||!executionAllowed||!form.prompt.trim()||!orgId} className="ep-button-primary w-full px-5 py-3.5 text-sm">{generating?<><Loader2 className="h-4 w-4 animate-spin"/> Creating…</>:<><Sparkles className="h-4 w-4"/> Create governed content</>}</button>
      </aside>
    </div>
  </div>;
}

function lines(value:string){return value.split('\n').map((item)=>item.trim()).filter(Boolean);}
function label(value:string){return value.replaceAll('_',' ').replace(/\b\w/g,(letter)=>letter.toUpperCase());}
function Field({label:fieldLabel,children}:{label:string;children:React.ReactNode}){return <label className="block"><span className="mb-1.5 block text-xs font-extrabold text-[var(--ep-text-muted)]">{fieldLabel}</span>{children}</label>;}

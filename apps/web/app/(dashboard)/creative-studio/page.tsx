'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, History, Image as ImageIcon, Loader2, RefreshCw, ShieldCheck, Sparkles, Video } from 'lucide-react';
import { StudioClient } from '@amarktai/studio';
import { useAuthStore } from '@/stores/auth.store';

function normalizeApiBaseUrl(value: string | undefined): string {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '/api') return '/api/v1';
  return trimmed;
}
const API_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
type Mode = 'image' | 'video';
type StudioModel = { id:string; name:string; parameters?:Record<string,any>; required_parameters?:string[] };
type Generation = { id:string; type?:string; prompt?:string; status?:string; url?:string|null; primary_output_url?:string|null; output_urls?:string[]; created_at?:string; timestamp?:string };
const modeConfig = {
  image:{ label:'Image Studio', operation:'text_to_image', icon:ImageIcon, aspectRatio:'1:1', description:'Create campaign imagery, social assets and visual concepts.' },
  video:{ label:'Video Studio', operation:'text_to_video', icon:Video, aspectRatio:'16:9', description:'Create short campaign video and motion concepts.' },
} as const;
function modelOptions(model:StudioModel|undefined,key:string):string[] { const field=model?.parameters?.[key]; const values=Array.isArray(field)?field:Array.isArray(field?.enum)?field.enum:Array.isArray(field?.options)?field.options:Array.isArray(field?.values)?field.values:[]; return values.map(String).filter(Boolean); }
function outputUrl(item:Generation|any):string|null { return item?.url || item?.primary_output_url || item?.output_urls?.[0] || null; }

export default function CreativeStudioPage() {
  const { token, currentOrganization } = useAuthStore();
  const organizationId=currentOrganization?.id || '';
  const [mode,setMode]=useState<Mode>('image');
  const [models,setModels]=useState<Record<Mode,StudioModel[]>>({image:[],video:[]});
  const [selectedModel,setSelectedModel]=useState<Record<Mode,string>>({image:'',video:''});
  const [prompt,setPrompt]=useState('');
  const [aspectRatio,setAspectRatio]=useState<Record<Mode,string>>({image:'1:1',video:'16:9'});
  const [duration,setDuration]=useState(''); const [resolution,setResolution]=useState('');
  const [history,setHistory]=useState<Generation[]>([]); const [control,setControl]=useState<Record<string,any>|null>(null);
  const [loading,setLoading]=useState(true); const [generating,setGenerating]=useState(false); const [error,setError]=useState<string|null>(null); const [result,setResult]=useState<Generation|null>(null);
  const studioClient=useMemo(()=>new StudioClient({organizationId,getToken:()=>token}),[organizationId,token]);
  const selected=models[mode].find((item)=>item.id===selectedModel[mode]);
  const aspectOptions=modelOptions(selected,'aspect_ratio'); const durationOptions=modelOptions(selected,'duration'); const resolutionOptions=modelOptions(selected,'resolution');
  const executionAllowed=control?.emergency_stop===false;

  const loadStudio=useCallback(async()=>{
    if(!token||!organizationId){setLoading(false);return;}
    setLoading(true); setError(null);
    try{
      const headers={Authorization:`Bearer ${token}`,'x-organization-id':organizationId};
      const [imageModels,videoModels,historyItems,controlResponse]=await Promise.all([
        studioClient.listModels('text_to_image'),studioClient.listModels('text_to_video'),studioClient.listHistory(40),
        fetch(`${API_URL}/relaunch-control`,{credentials:'include',headers}).then(async(response)=>{if(!response.ok)throw new Error('Launch safety status is unavailable.');return response.json();}),
      ]);
      const nextModels={image:(imageModels||[]) as StudioModel[],video:(videoModels||[]) as StudioModel[]};
      setModels(nextModels); setSelectedModel((current)=>({image:nextModels.image.some((item)=>item.id===current.image)?current.image:nextModels.image[0]?.id||'',video:nextModels.video.some((item)=>item.id===current.video)?current.video:nextModels.video[0]?.id||''}));
      setHistory((historyItems||[]) as Generation[]); setControl(controlResponse?.data||null);
    }catch(cause){setError(cause instanceof Error?cause.message:'Studio could not be loaded safely.');setControl(null);}finally{setLoading(false);}
  },[organizationId,token,studioClient]);
  useEffect(()=>{void loadStudio();},[loadStudio]);
  useEffect(()=>{if(aspectOptions.length&&!aspectOptions.includes(aspectRatio[mode]))setAspectRatio((current)=>({...current,[mode]:aspectOptions[0]}));setDuration(durationOptions[0]||'');setResolution(resolutionOptions[0]||'');},[selectedModel[mode],mode]);

  const generate=async()=>{
    if(!executionAllowed||!selected||!prompt.trim()||generating)return;
    setGenerating(true);setError(null);
    try{
      const options:Record<string,unknown>={model:selected.id,prompt:prompt.trim(),aspect_ratio:aspectRatio[mode]||modeConfig[mode].aspectRatio};
      if(mode==='video'&&duration)options.duration=duration; if(mode==='video'&&resolution)options.resolution=resolution;
      const generation=await studioClient.createGeneration({type:modeConfig[mode].operation,model:selected.id,prompt:prompt.trim(),options});
      const normalized={...generation,type:modeConfig[mode].operation,prompt:prompt.trim()} as Generation;
      setResult(normalized);setHistory((current)=>[normalized,...current.filter((item)=>item.id!==normalized.id)]);
    }catch(cause){setError(cause instanceof Error?cause.message:'Generation failed safely.');}finally{setGenerating(false);}
  };

  const download=async(item:Generation)=>{const url=outputUrl(item);if(!url)return;try{const response=await fetch(url,{credentials:'include',headers:token?{Authorization:`Bearer ${token}`} : undefined});if(!response.ok)throw new Error('Download failed.');const blobUrl=URL.createObjectURL(await response.blob());const anchor=document.createElement('a');anchor.href=blobUrl;anchor.download=`equiprofile-${item.id}`;anchor.click();URL.revokeObjectURL(blobUrl);}catch(cause){setError(cause instanceof Error?cause.message:'Download failed.');}};
  const currentResultUrl=outputUrl(result||{});
  if(loading)return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#2e6da4]" /></div>;

  return <div className="space-y-6">
    <section className="overflow-hidden rounded-[24px] border border-[#d8e1e6] bg-[linear-gradient(135deg,#ffffff_0%,#f2f7fa_62%,#eff7f4_100%)] p-6 shadow-[0_18px_50px_rgba(23,44,61,0.07)] sm:p-8"><div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div className="max-w-3xl"><div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#2e6da4]"><Sparkles className="h-4 w-4" /> Amarktai Network</div><h1 className="font-serif text-3xl font-semibold text-[#172c3d] sm:text-4xl">EquiProfile Creative Studio</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#61727d] sm:text-base">A clean workspace for creating visual campaign assets without exposing provider or backend complexity.</p></div><button type="button" onClick={()=>void loadStudio()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#cfd8de] bg-white px-4 py-2.5 text-sm font-bold text-[#315166] shadow-sm hover:bg-[#f8fafb]"><RefreshCw className="h-4 w-4" /> Refresh Studio</button></div></section>
    {error&&<div className="flex items-start gap-3 rounded-2xl border border-[#efc7c0] bg-[#fff5f2] px-4 py-3 text-sm text-[#963e35]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span className="min-w-0 flex-1">{error}</span></div>}
    <section className={executionAllowed?'rounded-2xl border border-[#cfe2dd] bg-[#f1f8f6] p-4':'rounded-2xl border border-[#ead39a] bg-[#fff9ea] p-4'}><div className="flex items-start gap-3"><ShieldCheck className={executionAllowed?'mt-0.5 h-5 w-5 text-[#348d82]':'mt-0.5 h-5 w-5 text-[#8b641e]'}/><div><p className="text-sm font-bold text-[#243e50]">{executionAllowed?'Generation controls are available':'Generation is paused by launch safety controls'}</p><p className="mt-1 text-xs leading-5 text-[#697983]">{executionAllowed?'Requests still use your workspace safety, credits and approval rules.':'You can inspect models, build prompts and review history. Generate stays disabled until Emergency Stop is deliberately released later in acceptance.'}</p></div></div></section>

    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <section className="ep-card min-w-0 p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#f3f0eb] p-1.5">{(Object.keys(modeConfig) as Mode[]).map((item)=>{const config=modeConfig[item];const Icon=config.icon;return <button key={item} type="button" onClick={()=>{setMode(item);setResult(null);setError(null);}} className={mode===item?'flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-bold text-[#244459] shadow-sm':'flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#6b7b84] hover:text-[#244459]'}><Icon className="h-4 w-4"/> {config.label}</button>;})}</div>
        <div className="mt-5"><p className="text-sm font-bold text-[#243e50]">{modeConfig[mode].label}</p><p className="mt-1 text-xs leading-5 text-[#728089]">{modeConfig[mode].description}</p></div>
        <label className="mt-5 block text-xs font-bold uppercase tracking-[0.12em] text-[#687983]">Model</label><select value={selectedModel[mode]} onChange={(event)=>setSelectedModel((current)=>({...current,[mode]:event.target.value}))} className="ep-input mt-2 px-3 py-3 text-sm" disabled={!models[mode].length}>{!models[mode].length&&<option value="">No runtime-confirmed model available</option>}{models[mode].map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <label className="mt-5 block text-xs font-bold uppercase tracking-[0.12em] text-[#687983]">Prompt</label><textarea value={prompt} onChange={(event)=>setPrompt(event.target.value)} rows={7} maxLength={4000} placeholder={mode==='image'?'Describe the campaign image you want to create…':'Describe the scene, motion, style and message for your video…'} className="ep-input mt-2 resize-y px-3 py-3 text-sm leading-6"/><div className="mt-1 flex justify-between gap-3 text-[11px] text-[#8a969e]"><span>Be specific about subject, setting, lighting and brand mood.</span><span>{prompt.length}/4000</span></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><div><label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#687983]">Aspect ratio</label><select value={aspectRatio[mode]} onChange={(event)=>setAspectRatio((current)=>({...current,[mode]:event.target.value}))} className="ep-input mt-2 px-3 py-2.5 text-sm">{(aspectOptions.length?aspectOptions:[modeConfig[mode].aspectRatio]).map((value)=><option key={value} value={value}>{value}</option>)}</select></div>{mode==='video'&&durationOptions.length>0&&<div><label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#687983]">Duration</label><select value={duration} onChange={(event)=>setDuration(event.target.value)} className="ep-input mt-2 px-3 py-2.5 text-sm">{durationOptions.map((value)=><option key={value} value={value}>{value}</option>)}</select></div>}{mode==='video'&&resolutionOptions.length>0&&<div><label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#687983]">Resolution</label><select value={resolution} onChange={(event)=>setResolution(event.target.value)} className="ep-input mt-2 px-3 py-2.5 text-sm">{resolutionOptions.map((value)=><option key={value} value={value}>{value}</option>)}</select></div>}</div>
        <button type="button" onClick={()=>void generate()} disabled={!executionAllowed||!selected||!prompt.trim()||generating} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2e6da4] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#255d8e] disabled:cursor-not-allowed disabled:bg-[#aab8c1]">{generating?<><Loader2 className="h-4 w-4 animate-spin"/> Creating…</>:<><Sparkles className="h-4 w-4"/> Generate {mode==='image'?'image':'video'}</>}</button>
      </section>

      <section className="ep-card min-w-0 overflow-hidden"><div className="border-b border-[#e6e0d8] px-5 py-4 sm:px-6"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7a8992]">Preview</p><h2 className="mt-1 text-lg font-bold text-[#172c3d]">Your latest result</h2></div><div className="flex min-h-[420px] items-center justify-center bg-[#f2f0ec] p-4 sm:p-8">{generating?<div className="text-center"><Loader2 className="mx-auto h-9 w-9 animate-spin text-[#2e6da4]"/><p className="mt-3 text-sm font-semibold text-[#526a79]">Amarktai Network is creating your asset…</p></div>:currentResultUrl?<div className="w-full max-w-4xl">{mode==='video'?<video src={currentResultUrl} controls playsInline className="max-h-[65vh] w-full rounded-2xl bg-black object-contain shadow-lg"/>:<img src={currentResultUrl} alt={result?.prompt||'Generated asset'} className="max-h-[65vh] w-full rounded-2xl bg-white object-contain shadow-lg"/>}<div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-semibold text-[#348d82]"><CheckCircle2 className="h-4 w-4"/> Generation complete</div><button type="button" onClick={()=>result&&void download(result)} className="inline-flex items-center gap-2 rounded-xl border border-[#d5cec5] bg-white px-3 py-2 text-sm font-bold text-[#315166] hover:bg-[#f9f7f4]"><Download className="h-4 w-4"/> Download</button></div></div>:<div className="max-w-sm text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-[#2e6da4] shadow-sm">{mode==='image'?<ImageIcon className="h-7 w-7"/>:<Video className="h-7 w-7"/>}</div><p className="mt-4 text-base font-bold text-[#334e60]">Your canvas is ready</p><p className="mt-2 text-sm leading-6 text-[#75838b]">Choose a runtime-confirmed Amarktai Network model, write a prompt and use Generate when launch safety allows execution.</p></div>}</div></section>
    </div>

    <section className="ep-card min-w-0 p-5 sm:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#7a8992]"><History className="h-4 w-4"/> Server history</div><h2 className="mt-1 text-lg font-bold text-[#172c3d]">Recent Studio assets</h2></div><span className="text-xs font-medium text-[#7a8992]">Stored against this workspace</span></div>{history.length?<div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{history.slice(0,12).map((item)=>{const url=outputUrl(item);const videoItem=String(item.type||'').includes('video');return <article key={item.id} className="min-w-0 overflow-hidden rounded-2xl border border-[#e4ded6] bg-[#fbfaf8]"><div className="flex h-40 items-center justify-center bg-[#eeeae4]">{url?(videoItem?<video src={url} muted preload="metadata" className="h-full w-full object-cover"/>:<img src={url} alt={item.prompt||'Generated asset'} className="h-full w-full object-cover"/>):<span className="text-xs font-semibold text-[#7a8992]">{item.status||'Processing'}</span>}</div><div className="p-3"><p className="truncate text-sm font-semibold text-[#334e60]">{item.prompt||(videoItem?'Video generation':'Image generation')}</p><div className="mt-2 flex items-center justify-between gap-2"><span className="truncate text-[11px] text-[#7a8992]">{item.status||'complete'}</span>{url&&<button type="button" onClick={()=>void download(item)} className="rounded-lg p-1.5 text-[#526a79] hover:bg-white hover:text-[#2e6da4]" aria-label="Download asset"><Download className="h-4 w-4"/></button>}</div></div></article>;})}</div>:<div className="mt-5 rounded-2xl border border-dashed border-[#d8d1c8] bg-[#faf8f5] px-5 py-10 text-center text-sm text-[#75838b]">No Studio generations are stored for this workspace yet.</div>}</section>
  </div>;
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, BarChart3, Building2, CheckCircle2, Clock, DollarSign, Heart, Loader2, Target, UserPlus, Users, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

type DashboardStats={contacts:{total:number;new_leads:number;qualified:number};companies:{total:number};deals:{total:number;open:number;pipeline_value:string;won_value:string};customers:{total:number;avg_health:string;at_risk:number};tasks:{total:number;pending:number}};
type AiAction={id:string;entity_type:string;entity_name:string|null;title:string;description:string|null;priority:string;due_at:string|null};
function priorityTone(priority:string){if(priority==='urgent')return 'ep-status-danger';if(['high','medium'].includes(priority))return 'ep-status-warning';return 'bg-[var(--ep-blue-soft)] text-[var(--ep-blue)] border-[#cfe5f3]';}

export default function CrmDashboardPage(){
  const [stats,setStats]=useState<DashboardStats|null>(null);const [actions,setActions]=useState<AiAction[]>([]);const [loading,setLoading]=useState(true);const [busyId,setBusyId]=useState<string|null>(null);const [error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{setLoading(true);setError(null);try{const [statsResponse,actionsResponse]=await Promise.all([api.get<ApiResponse<DashboardStats>>('/crm/dashboard'),api.get<ApiResponse<AiAction[]>>('/crm/ai-actions',{params:{status:'open',limit:'50'}})]);setStats(statsResponse.data);setActions(actionsResponse.data||[]);}catch(caught){setError(caught instanceof Error?caught.message:'CRM information could not be loaded.');}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  const updateAction=async(id:string,status:'completed'|'dismissed')=>{setBusyId(id);setError(null);try{await api.put(`/crm/ai-actions/${id}/status`,{body:{status}});setActions((current)=>current.filter((action)=>action.id!==id));}catch(caught){setError(caught instanceof Error?caught.message:'The CRM action could not be updated.');}finally{setBusyId(null);}};
  if(loading)return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[var(--ep-blue)]"/></div>;

  const cards=[
    {label:'Contacts',value:stats?.contacts.total??0,sub:`${stats?.contacts.new_leads??0} new leads`,icon:Users,href:'/crm/contacts'},
    {label:'Companies',value:stats?.companies.total??0,sub:'Tracked organisations',icon:Building2,href:'/crm/contacts'},
    {label:'Pipeline value',value:`$${(Number(stats?.deals.pipeline_value||0)/100).toLocaleString()}`,sub:`${stats?.deals.open??0} open deals`,icon:DollarSign,href:'/crm/deals'},
    {label:'Customers at risk',value:stats?.customers.at_risk??0,sub:`Average health ${Math.round(Number(stats?.customers.avg_health||0))}%`,icon:AlertTriangle,href:'/crm/customers'},
    {label:'Pending tasks',value:stats?.tasks.pending??0,sub:`${stats?.tasks.total??0} total`,icon:Clock,href:'/crm'},
    {label:'Recommended actions',value:actions.length,sub:'Open CRM recommendations',icon:BarChart3,href:'#recommendations'},
  ];
  const quick=[{label:'Add / manage contacts',icon:UserPlus,href:'/crm/contacts'},{label:'View pipeline',icon:Target,href:'/crm/deals'},{label:'Customer health',icon:Heart,href:'/crm/customers'}];

  return <div className="space-y-6">
    <header className="ep-panel p-6 sm:p-8"><p className="ep-section-label">CRM</p><h1 className="ep-page-title mt-2">Connect marketing activity to people, customers and revenue opportunities.</h1><p className="ep-page-copy mt-3 max-w-3xl text-sm leading-6 sm:text-base">Contacts, companies, deals and customer health stay visible beside persistent recommendations. No action is silently marked complete.</p></header>
    {error&&<div className="ep-status-danger rounded-xl border px-4 py-3 text-sm">{error}</div>}
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map((card)=><Link key={card.label} href={card.href} className="ep-card group p-5 transition hover:border-[#9fb4c8]"><div className="flex items-center justify-between"><p className="text-sm font-bold text-[var(--ep-text-muted)]">{card.label}</p><card.icon className="h-5 w-5 text-[var(--ep-blue)]"/></div><p className="mt-4 text-3xl font-extrabold text-[var(--ep-navy)]">{card.value}</p><p className="mt-1 text-xs text-[var(--ep-text-soft)]">{card.sub}</p></Link>)}</section>
    <section className="grid gap-5 lg:grid-cols-[.7fr_1.3fr]">
      <div><p className="ep-section-label">CRM workspaces</p><div className="mt-3 space-y-3">{quick.map((item)=><Link key={item.href} href={item.href} className="ep-card group flex items-center gap-3 p-4"><span className="rounded-xl bg-[var(--ep-blue-soft)] p-2.5 text-[var(--ep-blue)]"><item.icon className="h-5 w-5"/></span><span className="flex-1 text-sm font-extrabold text-[var(--ep-navy)]">{item.label}</span><ArrowRight className="h-4 w-4 text-[var(--ep-text-soft)] transition group-hover:translate-x-0.5"/></Link>)}</div></div>
      <div id="recommendations"><div className="mb-3"><p className="ep-section-label">Recommended actions</p><h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">Persistent CRM action queue</h2></div><div className="ep-card overflow-hidden">{actions.length===0?<div className="py-14 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-[var(--ep-success)]"/><p className="mt-3 text-sm font-semibold text-[var(--ep-text-muted)]">No open CRM recommendations.</p></div>:<div className="divide-y divide-[var(--ep-border)]">{actions.map((action)=><article key={action.id} className="p-5"><div className="flex items-start gap-3"><span className={`${priorityTone(action.priority)} mt-0.5 rounded-full border px-2 py-1 text-[10px] font-extrabold uppercase`}>{action.priority}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-extrabold text-[var(--ep-navy)]">{action.title}</h3><span className="rounded-full bg-[var(--ep-surface-subtle)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--ep-text-muted)]">{action.entity_type}</span></div><p className="mt-1 text-xs text-[var(--ep-text-muted)]">{action.entity_name||'CRM record'}{action.due_at?` · due ${new Date(action.due_at).toLocaleDateString('en-ZA')}`:''}</p>{action.description&&<p className="mt-2 text-sm leading-5 text-[var(--ep-text-muted)]">{action.description}</p>}</div><div className="flex shrink-0 gap-1"><button type="button" disabled={busyId===action.id} onClick={()=>void updateAction(action.id,'completed')} className="rounded-lg p-2 text-[var(--ep-text-muted)] hover:bg-[var(--ep-success-soft)] hover:text-[var(--ep-success)]" aria-label="Complete recommendation">{busyId===action.id?<Loader2 className="h-4 w-4 animate-spin"/>:<CheckCircle2 className="h-4 w-4"/>}</button><button type="button" disabled={busyId===action.id} onClick={()=>void updateAction(action.id,'dismissed')} className="rounded-lg p-2 text-[var(--ep-text-soft)] hover:bg-[var(--ep-danger-soft)] hover:text-[var(--ep-danger)]" aria-label="Dismiss recommendation"><X className="h-4 w-4"/></button></div></div></article>)}</div>}</div></div>
    </section>
  </div>;
}

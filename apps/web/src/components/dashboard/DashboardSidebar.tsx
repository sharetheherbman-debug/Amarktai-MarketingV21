'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  BarChart3, BookOpenCheck, BrainCircuit, CalendarRange, ChevronLeft, ChevronRight,
  FileCheck2, FlaskConical, LayoutDashboard, LogOut, Megaphone, Palette, Plug,
  Send, Settings, ShieldCheck, Sparkles, UsersRound, X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { cn, getInitials } from '@/lib/utils';

type NavItem = { label:string; href:string; icon:React.ComponentType<{className?:string}> };
type NavSection = { title?:string; items:NavItem[] };

const BRAND_LOGO='https://equiprofile.online/logo.png';
const BRAND_ICON='https://equiprofile.online/favicon.svg';

/** Customer product map. Internal/admin/provider surfaces deliberately stay out. */
const navigation:NavSection[]=[
  {items:[
    {label:'Command Centre',href:'/dashboard',icon:LayoutDashboard},
    {label:'Business Brain',href:'/business-brain',icon:BrainCircuit},
    {label:'Research & Intelligence',href:'/intelligence',icon:FlaskConical},
  ]},
  {title:'Plan & create',items:[
    {label:'Strategy & Campaigns',href:'/campaigns',icon:Megaphone},
    {label:'Content Studio',href:'/content-studio',icon:BookOpenCheck},
    {label:'Creative Studio',href:'/creative-studio',icon:Palette},
    {label:'Calendar & Production',href:'/content-studio/calendar',icon:CalendarRange},
  ]},
  {title:'Reach & grow',items:[
    {label:'Publish & Channels',href:'/social',icon:Send},
    {label:'CRM',href:'/crm',icon:UsersRound},
    {label:'Analytics & Optimisation',href:'/analytics',icon:BarChart3},
  ]},
  {title:'Team & operations',items:[
    {label:'Marketing Team',href:'/marketing-team',icon:Sparkles},
    {label:'Workflows & Approvals',href:'/approvals',icon:FileCheck2},
    {label:'Connections',href:'/connections',icon:Plug},
    {label:'Usage & Safety',href:'/usage-safety',icon:ShieldCheck},
    {label:'Settings',href:'/settings',icon:Settings},
  ]},
];

export function DashboardSidebar(){
  const pathname=usePathname();
  const {user,logout}=useAuthStore();
  const {sidebarOpen,toggleSidebar,setSidebarOpen}=useUIStore();
  const closeOnMobile=()=>{if(typeof window!=='undefined'&&window.innerWidth<1024)setSidebarOpen(false);};

  return <>
    {sidebarOpen&&<button type="button" aria-label="Close navigation" onClick={()=>setSidebarOpen(false)} className="fixed inset-0 z-30 bg-[#031a35]/45 backdrop-blur-[2px] lg:hidden"/>}
    <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-[286px] flex-col border-r border-white/10 bg-[var(--ep-navy)] text-white shadow-[12px_0_40px_rgba(3,26,53,0.16)] transition-all duration-200',sidebarOpen?'translate-x-0 lg:w-[286px]':'-translate-x-full lg:w-[76px] lg:translate-x-0')}>
      <div className="flex min-h-[78px] items-center border-b border-white/10 px-3 py-3">
        <Link href="/dashboard" onClick={closeOnMobile} className={cn('min-w-0 flex-1',sidebarOpen?'pr-2':'flex justify-center')}>
          {sidebarOpen?<div className="flex min-h-12 items-center rounded-xl bg-white px-3 py-2 shadow-sm"><img src={BRAND_LOGO} alt="EquiProfile" className="h-9 w-full max-w-[210px] object-contain object-left"/></div>:<img src={BRAND_ICON} alt="EquiProfile" className="h-10 w-10 rounded-xl bg-white shadow-sm"/>}
        </Link>
        {sidebarOpen&&<button type="button" onClick={toggleSidebar} className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white lg:flex" aria-label="Collapse navigation"><ChevronLeft className="h-4 w-4"/></button>}
        <button type="button" onClick={()=>setSidebarOpen(false)} className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close navigation"><X className="h-5 w-5"/></button>
      </div>
      {!sidebarOpen&&<button type="button" onClick={toggleSidebar} className="mx-auto mt-3 hidden h-9 w-9 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white lg:flex" aria-label="Expand navigation"><ChevronRight className="h-4 w-4"/></button>}
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Marketing workspace">
        {navigation.map((section,sectionIndex)=><div key={`${section.title||'main'}-${sectionIndex}`} className={cn(sectionIndex>0&&'mt-5')}>
          {section.title&&sidebarOpen&&<h3 className="mb-2 px-3 text-[10px] font-extrabold uppercase tracking-[0.15em] text-white/45">{section.title}</h3>}
          <div className="space-y-1">{section.items.map((item)=>{const active=pathname===item.href||pathname?.startsWith(`${item.href}/`);return <Link key={item.href} href={item.href} onClick={closeOnMobile} title={!sidebarOpen?item.label:undefined} className={cn('group flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-semibold transition-colors',active?'bg-white text-[var(--ep-navy)] shadow-sm':'text-white/76 hover:bg-white/10 hover:text-white',!sidebarOpen&&'justify-center px-0')}><item.icon className={cn('h-[17px] w-[17px] shrink-0',active?'text-[var(--ep-blue)]':'text-white/65 group-hover:text-white')}/>{sidebarOpen&&<span className="truncate">{item.label}</span>}</Link>;})}</div>
        </div>)}
      </nav>
      <div className="border-t border-white/10 p-3"><div className={cn('flex items-center gap-3 rounded-xl bg-white/[0.07] p-2.5',!sidebarOpen&&'justify-center bg-transparent p-1')}>
        {user?.avatar?<img src={user.avatar} alt={user.name} className="h-9 w-9 shrink-0 rounded-full object-cover"/>:<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-extrabold text-[var(--ep-navy)]">{user?.name?getInitials(user.name):'U'}</div>}
        {sidebarOpen&&<div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{user?.name||'Workspace owner'}</p><p className="truncate text-[11px] text-white/50">EquiProfile Marketing</p></div>}
        {sidebarOpen&&<button type="button" onClick={logout} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="Logout"><LogOut className="h-4 w-4"/></button>}
      </div></div>
    </aside>
  </>;
}

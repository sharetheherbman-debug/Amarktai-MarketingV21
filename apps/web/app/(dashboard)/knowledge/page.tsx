'use client';

import {
  BookOpen,
  Globe,
  FileText,
  FileUp,
  Network,
  Search,
  ArrowRight,
} from 'lucide-react';

const plannedFeatures = [
  {
    name: 'Website Crawler',
    description: 'Automatically crawl and index your website content to build a knowledge base from existing pages, blog posts, and documentation.',
    icon: Globe,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
  },
  {
    name: 'PDF Import',
    description: 'Upload PDF documents such as whitepapers, brochures, and manuals to extract and index content for AI agents.',
    icon: FileUp,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
  },
  {
    name: 'Document Import',
    description: 'Import documents from Google Docs, Notion, Confluence, and other sources to centralize your knowledge.',
    icon: FileText,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
  },
  {
    name: 'Knowledge Graph',
    description: 'Visualize relationships between topics, entities, and content pieces to understand your knowledge structure.',
    icon: Network,
    color: 'text-brand-400',
    bg: 'bg-brand-500/10',
  },
  {
    name: 'Vector Search',
    description: 'Semantic search powered by vector embeddings to find relevant information across your entire knowledge base.',
    icon: Search,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
];

export default function KnowledgePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Knowledge Base</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Build a centralized knowledge base for your AI agents to reference.
        </p>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
            <BookOpen className="h-8 w-8 text-amber-400" />
          </div>
          <h2 className="mt-6 text-xl font-bold text-white">Coming in Milestone 2</h2>
          <p className="mt-3 max-w-lg text-sm text-zinc-400">
            The Knowledge Base will allow you to import content from websites, PDFs, and documents.
            Your AI agents will use this knowledge to generate more accurate and on-brand content.
            Vector search will enable semantic matching across all your imported data.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
              Milestone 2
            </span>
            <span className="text-xs text-zinc-500">Estimated Q3 2026</span>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">Planned Features</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plannedFeatures.map((feature) => (
            <div
              key={feature.name}
              className="group relative rounded-xl border border-white/[0.06] bg-surface-100 p-6 transition-all hover:border-brand-500/30 hover:bg-surface-200"
            >
              <span className="absolute right-4 top-4 rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                Planned
              </span>
              <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${feature.bg}`}>
                <feature.icon className={`h-5 w-5 ${feature.color}`} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-white">{feature.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{feature.description}</p>
              <div className="mt-5 flex items-center gap-1 text-xs font-medium text-zinc-500">
                <span>Learn more</span>
                <ArrowRight className="h-3 w-3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import Link from 'next/link';

const categories = [
  'All',
  'AI Marketing',
  'SEO',
  'Social Media',
  'Email Marketing',
  'Product Updates',
];

const featuredPost = {
  title: 'The Complete Guide to AI Marketing in 2026',
  excerpt:
    'AI is transforming marketing at an unprecedented pace. In this comprehensive guide, we explore how AI agents are reshaping content creation, SEO, social media, and more — and how you can leverage them for your business.',
  category: 'AI Marketing',
  author: 'Alex Rivera',
  date: 'January 15, 2026',
  readTime: '12 min read',
  slug: 'complete-guide-ai-marketing-2026',
};

const posts = [
  {
    title: '10 Ways AI Agents Can Boost Your Content Output',
    excerpt:
      'Discover how AI agents can help you produce 10x more content without sacrificing quality. Real strategies from teams that have done it.',
    category: 'Content Marketing',
    author: 'Sarah Kim',
    date: 'January 10, 2026',
    readTime: '8 min read',
    slug: '10-ways-ai-agents-boost-content',
  },
  {
    title: 'SEO in the Age of AI: What Changed and What Didn\'t',
    excerpt:
      'AI hasn\'t killed SEO — it\'s evolved it. Here\'s what matters now for search rankings and how to adapt your strategy.',
    category: 'SEO',
    author: 'Marcus Johnson',
    date: 'January 5, 2026',
    readTime: '10 min read',
    slug: 'seo-age-of-ai',
  },
  {
    title: 'Building a Social Media Strategy with AI: A Step-by-Step Guide',
    excerpt:
      'Learn how to create, execute, and optimize a social media strategy using AI agents that handle the heavy lifting.',
    category: 'Social Media',
    author: 'Priya Patel',
    date: 'December 28, 2025',
    readTime: '9 min read',
    slug: 'social-media-strategy-ai',
  },
  {
    title: 'Email Marketing Automation: From Manual to AI-Powered',
    excerpt:
      'How to transition from manual email campaigns to AI-powered sequences that personalize at scale and optimize in real-time.',
    category: 'Email Marketing',
    author: 'David Chen',
    date: 'December 20, 2025',
    readTime: '7 min read',
    slug: 'email-marketing-automation-ai',
  },
  {
    title: 'Introducing Multi-Provider AI: Never Go Down Again',
    excerpt:
      'We\'re excited to announce multi-provider AI support with automatic failover. Learn how it works and why it matters.',
    category: 'Product Updates',
    author: 'Alex Rivera',
    date: 'December 15, 2025',
    readTime: '5 min read',
    slug: 'multi-provider-ai-announcement',
  },
  {
    title: 'How to Define and Maintain Your Brand Voice with AI',
    excerpt:
      'Consistency is key to brand trust. Here\'s how AI agents can help you maintain a consistent brand voice across every channel.',
    category: 'AI Marketing',
    author: 'Emma Wilson',
    date: 'December 10, 2025',
    readTime: '6 min read',
    slug: 'brand-voice-ai',
  },
];

const popularPosts = [
  { title: 'The Complete Guide to AI Marketing in 2026', slug: 'complete-guide-ai-marketing-2026' },
  { title: '10 Ways AI Agents Can Boost Your Content Output', slug: '10-ways-ai-agents-boost-content' },
  { title: 'SEO in the Age of AI', slug: 'seo-age-of-ai' },
  { title: 'How to Define Your Brand Voice with AI', slug: 'brand-voice-ai' },
];

export default function BlogPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.15),transparent)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-36">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Blog
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-zinc-400 sm:text-xl">
              Insights, tutorials, and news from EquiProfile Marketing.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Post */}
      <section className="border-t border-white/[0.06] py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Link
            href={`/blog/${featuredPost.slug}`}
            className="group block overflow-hidden rounded-2xl border border-white/[0.06] bg-surface-100 transition-all hover:border-brand-500/30"
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="aspect-video bg-gradient-to-br from-brand-500/20 to-surface-200 lg:aspect-auto" />
              <div className="flex flex-col justify-center p-8">
                <span className="inline-flex w-fit rounded-full bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-400">
                  {featuredPost.category}
                </span>
                <h2 className="mt-4 text-2xl font-bold text-white transition-colors group-hover:text-brand-400 sm:text-3xl">
                  {featuredPost.title}
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-zinc-400">
                  {featuredPost.excerpt}
                </p>
                <div className="mt-6 flex items-center gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/20 text-xs font-semibold text-brand-400">
                    {featuredPost.author
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">
                      {featuredPost.author}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {featuredPost.date} · {featuredPost.readTime}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* Blog Grid + Sidebar */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-3">
            {/* Posts */}
            <div className="lg:col-span-2">
              <div className="grid gap-8 sm:grid-cols-2">
                {posts.map((post) => (
                  <Link
                    key={post.slug}
                    href={`/blog/${post.slug}`}
                    className="group block rounded-2xl border border-white/[0.06] bg-surface-100 transition-all hover:border-brand-500/30"
                  >
                    <div className="aspect-video rounded-t-2xl bg-gradient-to-br from-surface-200 to-surface-300" />
                    <div className="p-6">
                      <span className="inline-flex rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs font-medium text-zinc-400">
                        {post.category}
                      </span>
                      <h3 className="mt-3 text-base font-semibold text-white transition-colors group-hover:text-brand-400">
                        {post.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-500 line-clamp-2">
                        {post.excerpt}
                      </p>
                      <div className="mt-4 flex items-center gap-3">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/20 text-[10px] font-semibold text-brand-400">
                          {post.author
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </div>
                        <span className="text-xs text-zinc-500">
                          {post.date} · {post.readTime}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-8">
              {/* Categories */}
              <div className="rounded-2xl border border-white/[0.06] bg-surface-100 p-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
                  Categories
                </h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <span
                      key={cat}
                      className="cursor-pointer rounded-lg border border-white/[0.06] bg-surface px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-brand-500/30 hover:text-white"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              </div>

              {/* Popular Posts */}
              <div className="rounded-2xl border border-white/[0.06] bg-surface-100 p-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
                  Popular Posts
                </h3>
                <ul className="mt-4 space-y-4">
                  {popularPosts.map((post) => (
                    <li key={post.slug}>
                      <Link
                        href={`/blog/${post.slug}`}
                        className="text-sm text-zinc-400 transition-colors hover:text-brand-400"
                      >
                        {post.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Newsletter */}
              <div className="rounded-2xl border border-brand-500/30 bg-brand-500/5 p-6">
                <h3 className="text-sm font-semibold text-white">
                  Subscribe to our newsletter
                </h3>
                <p className="mt-2 text-sm text-zinc-400">
                  Get the latest AI marketing insights delivered to your inbox.
                </p>
                <form className="mt-4 space-y-3">
                  <input
                    type="email"
                    placeholder="you@company.com"
                    className="block h-10 w-full rounded-lg border border-white/[0.06] bg-surface-100 px-3 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    className="h-10 w-full rounded-lg bg-brand-500 text-sm font-semibold text-white transition-all hover:bg-brand-400"
                  >
                    Subscribe
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

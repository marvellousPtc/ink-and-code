/*
 * :file description: 
 * :name: /ink-and-code/app/page.tsx
 * :author: PTC
 * :copyright: (c) 2026, Tungee
 * :date created: 2026-01-28 15:53:27
 * :last editor: PTC
 * :date last edited: 2026-01-30 10:29:21
 */
import Link from 'next/link';
import { getAllPostsAsync } from '@/lib/posts';
import BlogCard from '@/app/components/BlogCard';

// 动态渲染，每次请求都获取最新数据
export const dynamic = 'force-dynamic';

export default async function Home() {
  const posts = await getAllPostsAsync();
  const recentPosts = posts.slice(0, 4);

  return (
    <div className="flex flex-col">
      <div className="bg-glow" />
      
      {/* 1. HERO SECTION */}
      <section className="snap relative min-h-[100svh] w-full overflow-hidden border-b border-card-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full relative z-10 flex flex-col items-center justify-center min-h-[100svh] pt-16 pb-8 sm:pt-20 sm:pb-12 md:py-0">
          <div className="flex flex-col items-center text-center space-y-6 sm:space-y-8 md:space-y-12 -mt-8 sm:-mt-4 md:mt-0">
            <div className="overflow-hidden py-2">
              <h1 className="serif text-5xl sm:text-7xl md:text-[10rem] lg:text-[14rem] font-bold tracking-[-0.06em] text-foreground leading-[0.8] animate-reveal">
                Ink<span className="text-primary tracking-tighter">&</span>Code
              </h1>
            </div>
            
            <div className="max-w-3xl space-y-6 md:space-y-8 animate-fade-up delay-2 opacity-0 [animation-fill-mode:forwards]">
              <p className="text-lg sm:text-xl md:text-3xl text-foreground leading-tight serif italic text-balance px-2">
                用代码书写思想，用技术表达创意。
              </p>
              <p className="text-sm md:text-lg text-muted tracking-wide leading-relaxed max-w-xl mx-auto px-4">
                记录编程探索、分享技术见解，连接技术与人文的边界。
              </p>
              
              <div className="flex items-center justify-center gap-6 sm:gap-12 pt-4 md:pt-6">
                <Link
                  href="#latest-articles"
                  className="group relative text-[10px] sm:text-xs md:text-sm tracking-[0.3em] sm:tracking-[0.5em] uppercase text-primary font-bold transition-colors"
                >
                  READ BLOG
                  <span className="absolute -bottom-2 left-0 w-full h-px bg-primary transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500" />
                </Link>
                <Link
                  href="#about-me"
                  className="group relative text-[10px] sm:text-xs md:text-sm tracking-[0.3em] sm:tracking-[0.5em] uppercase text-muted hover:text-foreground font-bold transition-colors"
                >
                  ABOUT ME
                  <span className="absolute -bottom-2 left-0 w-full h-px bg-card-border group-hover:bg-foreground transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500" />
                </Link>
              </div>

              {/* 特色文章入口 */}
              <div className="mt-8 md:mt-12 w-full max-w-lg mx-auto px-4 sm:px-0">
                {/* 移动端：紧凑的列表样式 */}
                <div className="sm:hidden space-y-2">
                  <Link 
                    href="/blog/deploy-nextjs-to-server"
                    className="group flex items-center justify-between px-4 py-3 bg-card/30 border border-card-border/50 rounded-xl hover:bg-card/50 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base">🚀</span>
                      <span className="text-sm text-foreground">Next.js 部署指南</span>
                    </div>
                    <span className="text-xs text-primary">阅读 →</span>
                  </Link>
                  
                  <Link 
                    href="/blog/tailwind-responsive-design"
                    className="group flex items-center justify-between px-4 py-3 bg-card/30 border border-card-border/50 rounded-xl hover:bg-card/50 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base">📱</span>
                      <span className="text-sm text-foreground">Tailwind 响应式设计</span>
                    </div>
                    <span className="text-xs text-cyan-500">阅读 →</span>
                  </Link>
                </div>

                {/* 桌面端：药丸按钮 */}
                <div className="hidden sm:flex items-center justify-center gap-4">
                  <Link 
                    href="/blog/deploy-nextjs-to-server"
                    className="group flex items-center gap-3 px-5 py-2.5 bg-card/50 border border-card-border rounded-full hover:border-primary/50 hover:bg-primary/5 transition-all duration-300"
                  >
                    <span className="text-lg">🚀</span>
                    <span className="text-sm text-foreground font-medium whitespace-nowrap">Next.js 部署指南</span>
                    <span className="text-primary text-sm group-hover:translate-x-0.5 transition-transform">→</span>
                  </Link>
                  
                  <Link 
                    href="/blog/tailwind-responsive-design"
                    className="group flex items-center gap-3 px-5 py-2.5 bg-card/50 border border-card-border rounded-full hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all duration-300"
                  >
                    <span className="text-lg">📱</span>
                    <span className="text-sm text-foreground font-medium whitespace-nowrap">Tailwind 响应式设计</span>
                    <span className="text-cyan-500 text-sm group-hover:translate-x-0.5 transition-transform">→</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Animated Background Text Decoration */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none -z-10 opacity-[0.02] flex items-center justify-center">
          <span className="serif text-[35vw] font-bold select-none animate-float text-muted">CREATIVE</span>
        </div>

        {/* Scroll Down Guide - 在手机上隐藏 */}
        <Link 
          href="#latest-articles"
          className="hidden md:flex absolute bottom-8 left-1/2 -translate-x-1/2 flex-col items-center gap-4 animate-fade-up delay-3 opacity-0 [animation-fill-mode:forwards] group cursor-pointer"
        >
          <span className="text-[10px] tracking-[0.5em] uppercase text-muted group-hover:text-primary transition-colors font-bold">EXPLORE</span>
          <div className="w-px h-16 bg-linear-to-b from-primary/50 to-transparent group-hover:from-primary transition-all duration-500" />
        </Link>
      </section>

      {/* 2. LATEST ARTICLES SECTION */}
      <section id="latest-articles" className="snap relative min-h-screen px-4 sm:px-6 py-16 md:py-0 overflow-hidden">
        <div className="max-w-7xl mx-auto w-full h-full flex flex-col justify-center">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 md:mb-16 gap-4 md:gap-6">
            <div className="space-y-3 md:space-y-4">
              <h2 className="serif text-3xl sm:text-4xl md:text-6xl font-bold text-foreground tracking-tight">最新文章</h2>
              <div className="flex items-center gap-4 md:gap-6">
                <div className="h-px w-12 md:w-16 bg-primary/30" />
                <p className="text-muted text-[9px] md:text-[10px] tracking-[0.4em] md:tracking-[0.5em] uppercase font-bold">LATEST ARTICLES</p>
              </div>
            </div>
            <Link 
              href="/blog" 
              className="group inline-flex items-center gap-3 md:gap-4 text-[9px] md:text-[10px] tracking-[0.3em] md:tracking-[0.4em] uppercase text-muted hover:text-primary transition-all font-bold border-b border-card-border pb-2"
            >
              VIEW ALL
              <span className="group-hover:translate-x-2 transition-transform duration-500">→</span>
            </Link>
          </div>
          
          {recentPosts.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-6 lg:gap-10">
              {recentPosts.map((post) => (
                <div key={post.slug}>
                  <BlogCard post={post} />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-24 h-24 mb-8 rounded-3xl bg-primary/5 border border-primary/10 flex items-center justify-center rotate-3">
                <span className="text-4xl -rotate-3">✍️</span>
              </div>
              <h3 className="serif text-2xl md:text-3xl font-bold text-foreground mb-4">
                还没有文章
              </h3>
              <p className="text-muted max-w-md mb-8 leading-relaxed">
                这里还是一片空白，正等待着你的第一篇创作。<br />
                用文字记录灵感，让思想在代码中绽放。
              </p>
              <Link
                href="/admin"
                className="group inline-flex items-center gap-3 px-8 py-4 bg-primary text-primary-foreground rounded-2xl text-sm font-bold tracking-wider uppercase hover:bg-primary/90 transition-all duration-300 shadow-lg shadow-primary/20"
              >
                <span>开始创作</span>
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* 3. ABOUT ME / IDENTITY SECTION */}
      <section id="about-me" className="snap relative min-h-screen px-4 sm:px-6 py-16 md:py-0 border-t border-card-border overflow-hidden">
        {/* Background Decoration - 在手机上隐藏 */}
        <div className="hidden md:block absolute -right-20 top-1/2 -translate-y-1/2 serif text-[25vw] opacity-[0.02] pointer-events-none select-none text-muted">
          INFO
        </div>

        <div className="max-w-7xl mx-auto w-full h-full flex flex-col justify-center relative z-10">
          <div className="grid lg:grid-cols-[1fr_1.1fr] gap-10 md:gap-16 lg:gap-24 items-center">
            <div className="space-y-8 md:space-y-12">
              <div className="space-y-3 md:space-y-4">
                <h2 className="serif text-4xl sm:text-5xl md:text-[8rem] font-bold text-foreground tracking-tighter leading-none">关于我</h2>
                <div className="flex items-center gap-4 md:gap-6">
                  <div className="h-px w-12 md:w-20 bg-primary/30" />
                  <p className="text-primary text-[9px] md:text-[10px] tracking-[0.4em] md:tracking-[0.5em] uppercase font-bold">THE IDENTITY & CRAFT</p>
                </div>
              </div>
              
              <p className="serif text-xl sm:text-2xl md:text-4xl text-foreground leading-tight italic border-l-4 border-primary/20 pl-6 sm:pl-10 py-3 md:py-4">
                &quot;在逻辑的荒野中寻找美，<br />在代码的森林里书写诗。&quot;
              </p>
              
              <div className="space-y-6 md:space-y-8 text-muted text-base md:text-lg lg:text-xl leading-relaxed font-serif">
                <p>
                  我热衷于将技术与艺术融合。代码不仅是工具，更是思想的载体。
                </p>
              </div>

              <div className="flex flex-wrap gap-2 md:gap-3">
                {['Next.js', 'TypeScript', 'Design Systems', 'Creative Coding'].map(tag => (
                  <span key={tag} className="px-4 md:px-6 py-1.5 md:py-2 rounded-full border border-card-border text-[8px] md:text-[9px] tracking-[0.2em] md:tracking-[0.3em] uppercase text-muted font-bold bg-card cursor-default">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:gap-6">
              {[
                { icon: '✒️', title: '深度输出', color: 'from-amber-500/10', desc: '坚持原创与深度，输出具有系统性的技术见解。' },
                { icon: '🎨', title: '美学至上', color: 'from-purple-500/10', desc: '追求极致的排版与交互细节，让代码在屏幕上跳舞。' },
              ].map((item) => (
                <div key={item.title} className={`p-6 sm:p-8 md:p-10 lg:p-12 rounded-2xl md:rounded-[2.5rem] bg-linear-to-br ${item.color} to-transparent border border-card-border group relative overflow-hidden shadow-lg`}>
                  <div className="absolute -right-2 -top-2 p-6 md:p-8 text-4xl md:text-6xl opacity-5 group-hover:opacity-10 transition-all duration-700 select-none">
                    {item.icon}
                  </div>
                  <div className="relative z-10 space-y-2 md:space-y-4">
                    <h3 className="serif text-xl md:text-2xl font-bold text-foreground group-hover:text-primary transition-colors duration-500">{item.title}</h3>
                    <p className="text-muted text-sm md:text-base leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

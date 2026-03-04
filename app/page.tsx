/*
 * :file description: 产品首页 - 个人创作与阅读平台
 * :name: /ink-and-code/app/page.tsx
 * :author: PTC
 */
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { ArrowRight, Sparkles, Globe, Palette, Code2, Github, Zap, Shield, BookOpen, PenTool } from 'lucide-react';

export default async function LandingPage() {
  const session = await auth();

  return (
    <div className="flex flex-col">
      <div className="bg-glow" />
      
      {/* HERO SECTION */}
      <section className="relative min-h-[100svh] w-full overflow-hidden">
        {/* 背景装饰 */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/5 rounded-full blur-[100px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/3 rounded-full blur-[150px]" />
        </div>

        <div className="max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[2000px] min-[2200px]:max-w-[2200px] mx-auto px-4 sm:px-6 w-full relative z-10 flex flex-col items-center justify-center min-h-[100svh] pt-24 pb-12">
          {/* 标签 */}
          <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border border-primary/20 rounded-full mb-8 animate-fade-up">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold text-primary tracking-wider uppercase">写作 · 阅读 · 创作</span>
          </div>

          {/* 主标题 */}
          <div className="text-center space-y-6 mb-12">
            <h1 className="serif text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-bold tracking-[-0.04em] text-foreground leading-[0.9] animate-reveal">
              Ink<span className="text-primary">&</span>Code
            </h1>
            <p className="text-xl sm:text-2xl md:text-3xl text-muted max-w-3xl mx-auto leading-relaxed animate-fade-up delay-1 opacity-0 [animation-fill-mode:forwards]">
              写作与阅读的<span className="text-foreground font-semibold">理想空间</span>，
              <br className="hidden sm:block" />
              记录灵感，沉浸阅读，分享世界。
            </p>
          </div>

          {/* CTA 按钮 */}
          <div className="flex flex-col sm:flex-row items-center gap-4 animate-fade-up delay-2 opacity-0 [animation-fill-mode:forwards]">
            {session?.user ? (
              <Link
                href="/admin"
                className="group flex items-center gap-3 px-8 py-4 bg-primary text-primary-foreground rounded-2xl text-sm font-bold tracking-wider uppercase hover:bg-primary/90 transition-all duration-300 shadow-lg shadow-primary/20"
              >
                <span>进入工作台</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            ) : (
              <Link
                href="/login"
                className="group flex items-center gap-3 px-8 py-4 bg-primary text-primary-foreground rounded-2xl text-sm font-bold tracking-wider uppercase hover:bg-primary/90 transition-all duration-300 shadow-lg shadow-primary/20"
              >
                <span>免费开始</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            )}

            <Link
              href="#features"
              className="group flex items-center gap-2 px-6 py-4 text-sm font-bold tracking-wider uppercase text-muted hover:text-foreground transition-colors"
            >
              了解更多
              <span className="group-hover:translate-y-0.5 transition-transform">↓</span>
            </Link>
          </div>

          {/* 统计数据 */}
          <div className="flex items-center gap-8 sm:gap-12 mt-16 pt-8 border-t border-card-border/50 animate-fade-up delay-3 opacity-0 [animation-fill-mode:forwards]">
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-foreground">EPUB</div>
              <div className="text-xs text-muted uppercase tracking-wider mt-1">沉浸阅读</div>
            </div>
            <div className="w-px h-12 bg-card-border" />
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-foreground">30s</div>
              <div className="text-xs text-muted uppercase tracking-wider mt-1">快速创建</div>
            </div>
            <div className="w-px h-12 bg-card-border" />
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-foreground">100%</div>
              <div className="text-xs text-muted uppercase tracking-wider mt-1">免费使用</div>
            </div>
          </div>
        </div>

        {/* 滚动提示 */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-3 animate-bounce">
          <div className="w-px h-8 bg-gradient-to-b from-primary/50 to-transparent" />
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section id="features" className="relative py-24 md:py-32 px-4 sm:px-6 border-t border-card-border">
        <div className="max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[2000px] min-[2200px]:max-w-[2200px] mx-auto">
          <div className="text-center mb-16 md:mb-24">
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="h-px w-12 bg-primary/30" />
              <span className="text-xs text-primary font-bold uppercase tracking-[0.3em]">Features</span>
              <div className="h-px w-12 bg-primary/30" />
            </div>
            <h2 className="serif text-4xl sm:text-5xl md:text-6xl font-bold text-foreground tracking-tight mb-6">
              为什么选择 Ink&Code
            </h2>
            <p className="text-muted text-lg max-w-2xl mx-auto">
              简洁优雅的创作与阅读平台，让你的每一个想法都有落地的可能
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {[
              {
                icon: PenTool,
                title: '富文本编辑',
                desc: '强大的可视化编辑器，支持代码高亮、Markdown，随时记录灵感',
                color: 'text-green-500',
                bg: 'bg-green-500/10',
              },
              {
                icon: BookOpen,
                title: '在线书架',
                desc: '上传 EPUB / PDF，随时随地沉浸式阅读，支持笔记与高亮',
                color: 'text-amber-500',
                bg: 'bg-amber-500/10',
              },
              {
                icon: Globe,
                title: '独立链接',
                desc: '每个用户都有专属的个人主页，一键分享给全世界',
                color: 'text-blue-500',
                bg: 'bg-blue-500/10',
              },
              {
                icon: Palette,
                title: '个性化定制',
                desc: '自定义主题色、站点名称，打造独一无二的个人品牌',
                color: 'text-purple-500',
                bg: 'bg-purple-500/10',
              },
              {
                icon: Shield,
                title: '安全可靠',
                desc: 'OAuth 安全登录，数据云端同步，多设备无缝切换',
                color: 'text-cyan-500',
                bg: 'bg-cyan-500/10',
              },
              {
                icon: Zap,
                title: '极速体验',
                desc: '基于 Next.js 构建，毫秒级页面加载，丝滑流畅',
                color: 'text-yellow-500',
                bg: 'bg-yellow-500/10',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="group p-8 rounded-3xl border border-card-border bg-card/30 hover:bg-card/60 hover:border-card-border/80 transition-all duration-500"
              >
                <div className={`w-14 h-14 ${feature.bg} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500`}>
                  <feature.icon className={`w-7 h-7 ${feature.color}`} />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">{feature.title}</h3>
                <p className="text-muted leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="relative py-24 md:py-32 px-4 sm:px-6 border-t border-card-border bg-card/20">
        <div className="max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[2000px] min-[2200px]:max-w-[2200px] mx-auto">
          <div className="text-center mb-16 md:mb-24">
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="h-px w-12 bg-primary/30" />
              <span className="text-xs text-primary font-bold uppercase tracking-[0.3em]">How it works</span>
              <div className="h-px w-12 bg-primary/30" />
            </div>
            <h2 className="serif text-4xl sm:text-5xl md:text-6xl font-bold text-foreground tracking-tight mb-6">
              三步开始创作
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {[
              { step: '01', title: '登录', desc: '使用 GitHub 账号一键登录' },
              { step: '02', title: '创作', desc: '用编辑器写文章，或在书架中阅读' },
              { step: '03', title: '分享', desc: '获取专属链接，分享给全世界' },
            ].map((item, index) => (
              <div key={item.step} className="relative text-center">
                {index < 2 && (
                  <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-px bg-gradient-to-r from-primary/30 to-transparent" />
                )}
                <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <span className="serif text-4xl font-bold text-primary">{item.step}</span>
                </div>
                <h3 className="text-2xl font-bold text-foreground mb-3">{item.title}</h3>
                <p className="text-muted">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="text-center mt-16">
            <Link
              href={session?.user ? '/admin' : '/login'}
              className="group inline-flex items-center gap-3 px-10 py-5 bg-primary text-primary-foreground rounded-2xl text-sm font-bold tracking-wider uppercase hover:bg-primary/90 transition-all duration-300 shadow-lg shadow-primary/20"
            >
              <span>{session?.user ? '进入工作台' : '立即开始'}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* DEVELOPER SECTION */}
      <section id="developer" className="relative py-24 md:py-32 px-4 sm:px-6 border-t border-card-border">
        <div className="max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[2000px] min-[2200px]:max-w-[2200px] mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-px w-12 bg-primary/30" />
                  <span className="text-xs text-primary font-bold uppercase tracking-[0.3em]">Developer</span>
                </div>
                <h2 className="serif text-4xl sm:text-5xl md:text-6xl font-bold text-foreground tracking-tight">
                  关于开发者
                </h2>
              </div>

              <div className="space-y-6 text-lg text-muted leading-relaxed">
                <p>
                  我是一名热爱技术与设计的开发者，相信代码不仅是工具，更是表达创意的方式。
                </p>
                <p>
                  <span className="text-foreground font-medium">Ink&Code</span> 是我的开源项目，
                  旨在为每个人提供一个简单、美观的个人创作平台。
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                {['Next.js', 'TypeScript', 'Prisma', 'PostgreSQL', 'Tailwind CSS'].map(tag => (
                  <span 
                    key={tag} 
                    className="px-4 py-2 rounded-full border border-card-border text-xs tracking-wider uppercase text-muted font-bold bg-card/50"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-4 pt-4">
                <a
                  href="https://github.com/marvellousPtc/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-5 py-3 bg-[#24292e] text-white rounded-xl text-sm font-bold hover:bg-[#2f363d] transition-colors"
                >
                  <Github className="w-4 h-4" />
                  <span>GitHub</span>
                </a>
              </div>
            </div>

            {/* 装饰卡片 */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-purple-500/10 rounded-[3rem] blur-3xl" />
              <div className="relative p-10 bg-card/60 backdrop-blur border border-card-border rounded-[2.5rem] space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Code2 className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground">开源项目</h3>
                    <p className="text-muted text-sm">Fork, Star, Contribute</p>
                  </div>
                </div>
                <div className="h-px bg-card-border" />
                <p className="text-muted italic serif text-lg">
                  &quot;用代码书写思想，用设计表达创意。&quot;
                </p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Built with</span>
                  <span className="text-foreground font-medium">Next.js 16 + Prisma</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative py-24 md:py-32 px-4 sm:px-6 border-t border-card-border bg-gradient-to-b from-primary/5 to-transparent">
        <div className="max-w-4xl 2xl:max-w-5xl min-[1920px]:max-w-6xl min-[2200px]:max-w-7xl mx-auto text-center">
          <h2 className="serif text-4xl sm:text-5xl md:text-6xl font-bold text-foreground tracking-tight mb-6">
            写作与阅读的理想空间
          </h2>
          <p className="text-xl text-muted mb-10 max-w-2xl mx-auto">
            加入 Ink&Code，记录灵感，沉浸阅读，让世界听到你的声音。
          </p>
          <Link
            href={session?.user ? '/admin' : '/login'}
            className="group inline-flex items-center gap-3 px-12 py-6 bg-primary text-primary-foreground rounded-2xl text-base font-bold tracking-wider uppercase hover:bg-primary/90 transition-all duration-300 shadow-xl shadow-primary/30"
          >
            <span>{session?.user ? '进入工作台' : '免费开始创作'}</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>
    </div>
  );
}

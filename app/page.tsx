/*
 * :file description: 产品首页 - AI 驱动的创作与阅读平台
 * :name: /ink-and-code/app/page.tsx
 * :author: PTC
 */
import Link from 'next/link';
import Image from 'next/image';
import { auth } from '@/lib/auth';
import {
  ArrowRight,
  Sparkles,
  BookOpen,
  PenTool,
  BrainCircuit,
  MessageCircle,
  Languages,
  FileText,
  Expand,
  PenLine,
  Bookmark,
  Highlighter,
  Smartphone,
  Monitor,
  RefreshCw,
  BookMarked,
  Quote,
  Check,
  Github,
  Code2,
  Zap,
  Shield,
  Palette,
  Globe,
  Send,
} from 'lucide-react';

export default async function LandingPage() {
  const session = await auth();
  const ctaHref = session?.user ? '/admin' : '/login';
  const ctaText = session?.user ? '进入工作台' : '免费开始';

  return (
    <div className="flex flex-col">
      <div className="bg-glow" />

      {/* ==================== HERO ==================== */}
      <section className="relative min-h-[100svh] w-full overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/5 rounded-full blur-[100px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-rose-500/5 rounded-full blur-[150px]" />
        </div>

        <div className="max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[2000px] min-[2200px]:max-w-[2200px] mx-auto px-4 sm:px-6 w-full relative z-10 flex flex-col items-center justify-center min-h-[100svh] pt-24 pb-12">
          {/* 标签 */}
          <div className="flex items-center gap-2 px-4 py-2 bg-rose-500/5 border border-rose-500/20 rounded-full mb-8 animate-fade-up">
            <Sparkles className="w-4 h-4 text-rose-500" />
            <span className="text-xs font-bold text-rose-500 tracking-wider uppercase">AI 原生 · 写作 · 阅读 · 对话</span>
          </div>

          {/* 主标题 */}
          <div className="text-center space-y-6 mb-12">
            <h1 className="serif text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-bold tracking-[-0.04em] text-foreground leading-[0.9] animate-reveal">
              Ink<span className="text-primary">&</span>Code
            </h1>
            <p className="text-xl sm:text-2xl md:text-3xl text-muted max-w-3xl mx-auto leading-relaxed animate-fade-up delay-1 opacity-0 [animation-fill-mode:forwards]">
              AI 在场的<span className="text-foreground font-semibold">创作与阅读</span>。
              <br className="hidden sm:block" />
              写作有助手，阅读有同伴，数据可对话。
            </p>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center gap-4 animate-fade-up delay-2 opacity-0 [animation-fill-mode:forwards]">
            <Link
              href={ctaHref}
              className="group flex items-center gap-3 px-8 py-4 bg-primary text-primary-foreground rounded-2xl text-sm font-bold tracking-wider uppercase hover:bg-primary/90 transition-all duration-300 shadow-lg shadow-primary/20"
            >
              <span>{ctaText}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>

            <a
              href="/chat"
              className="group flex items-center gap-3 px-8 py-4 border border-card-border rounded-2xl text-sm font-bold tracking-wider uppercase text-foreground hover:bg-card/60 transition-all duration-300"
            >
              <BrainCircuit className="w-4 h-4 text-rose-500" />
              <span>体验 AI 对话</span>
            </a>
          </div>

          {/* 关键指标 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8 mt-16 pt-8 border-t border-card-border/50 animate-fade-up delay-3 opacity-0 [animation-fill-mode:forwards] max-w-4xl w-full">
            {[
              { v: '9+', l: 'AI 写作动作', color: 'text-primary' },
              { v: '5', l: 'AI 阅读工具', color: 'text-rose-500' },
              { v: '∞', l: 'AI 对话问答', color: 'text-purple-500' },
              { v: '📱💻', l: '跨端同步', color: 'text-cyan-500' },
            ].map(item => (
              <div key={item.l} className="text-center">
                <div className={`text-2xl sm:text-3xl font-bold ${item.color}`}>{item.v}</div>
                <div className="text-xs text-muted uppercase tracking-wider mt-1">{item.l}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-3 animate-bounce">
          <div className="w-px h-8 bg-gradient-to-b from-primary/50 to-transparent" />
        </div>
      </section>

      {/* ==================== AI READING ==================== */}
      <section id="ai-reading" className="relative py-24 md:py-32 px-4 sm:px-6 border-t border-card-border overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/2 right-0 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[150px]" />
        </div>

        <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* 左：截图 */}
            <Link href="/library" className="group relative block order-2 lg:order-1">
              <div className="absolute -inset-6 bg-gradient-to-br from-amber-500/20 via-rose-500/10 to-primary/10 rounded-[3rem] blur-2xl opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative rounded-3xl overflow-hidden border border-card-border shadow-2xl bg-card transition-transform duration-500 group-hover:-translate-y-1">
                <Image
                  src="/landing/reader-highlight.png"
                  alt="阅读器高亮与 AI 笔记"
                  width={1024}
                  height={701}
                  priority
                  className="w-full h-auto"
                />
                {/* 悬浮标签 */}
                <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 bg-background/85 backdrop-blur border border-card-border rounded-full shadow-sm">
                  <BookMarked className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-[11px] font-bold text-foreground tracking-wider uppercase">沉浸阅读</span>
                </div>
                <div className="absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <span className="text-[11px] font-bold tracking-wider uppercase">查看书架</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </div>
              {/* 浮动特性 tag */}
              <div className="hidden lg:block absolute -right-4 top-12 animate-float">
                <div className="flex items-center gap-2 px-3 py-2 bg-background/90 backdrop-blur border border-card-border rounded-xl shadow-xl">
                  <Highlighter className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-medium">5 种高亮颜色</span>
                </div>
              </div>
              <div className="hidden lg:block absolute -left-4 bottom-16 animate-float [animation-delay:1.2s]">
                <div className="flex items-center gap-2 px-3 py-2 bg-background/90 backdrop-blur border border-card-border rounded-xl shadow-xl">
                  <Sparkles className="w-4 h-4 text-rose-500" />
                  <span className="text-xs font-medium">AI 存为笔记</span>
                </div>
              </div>
            </Link>

            {/* 右：文案 */}
            <div className="space-y-8 order-1 lg:order-2">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-px w-12 bg-amber-500/40" />
                  <span className="text-xs text-amber-500 font-bold uppercase tracking-[0.3em]">AI Reading</span>
                </div>
                <h2 className="serif text-4xl sm:text-5xl md:text-6xl font-bold text-foreground tracking-tight">
                  选中就问，
                  <br />
                  <span className="text-amber-500">读懂每一段</span>
                </h2>
                <p className="text-lg text-muted leading-relaxed max-w-lg">
                  EPUB 书架里任何一段晦涩的文字，划一下就能让 AI 为你解释、翻译、总结。满意的回答一键存为笔记，下次打开书直接跳转回原处。
                </p>
              </div>

              {/* Action list */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: BookOpen, label: '解释', desc: '通俗讲清概念' },
                  { icon: Languages, label: '翻译', desc: '中英双向流畅' },
                  { icon: FileText, label: '总结', desc: '段落要点提炼' },
                  { icon: MessageCircle, label: '提问', desc: '自由发挥追问' },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-3 p-3 rounded-xl border border-card-border/60 bg-card/30 hover:bg-card/60 transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                      <item.icon className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-foreground">{item.label}</div>
                      <div className="text-xs text-muted mt-0.5 truncate">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-4 pt-2">
                <Link
                  href="/library"
                  className="group inline-flex items-center gap-2 px-6 py-3 bg-amber-500 text-white rounded-xl text-sm font-bold tracking-wider uppercase hover:bg-amber-600 transition-colors shadow-lg shadow-amber-500/20"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>进入书架</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <span className="text-xs text-muted hidden sm:inline">EPUB / PDF / MD / TXT</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== AI WRITING ==================== */}
      <section id="ai-writing" className="relative py-24 md:py-32 px-4 sm:px-6 border-t border-card-border overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/3 left-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[150px]" />
        </div>

        <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* 左：文案 */}
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-px w-12 bg-primary/40" />
                  <span className="text-xs text-primary font-bold uppercase tracking-[0.3em]">AI Writing</span>
                </div>
                <h2 className="serif text-4xl sm:text-5xl md:text-6xl font-bold text-foreground tracking-tight">
                  让卡壳消失，
                  <br />
                  <span className="text-primary">写作从未如此轻松</span>
                </h2>
                <p className="text-lg text-muted leading-relaxed max-w-lg">
                  选中任意文字，9 个 AI 动作一触即发。从续写到改写，从翻译到润色，流式生成、预览替换，所有变动都在你掌控中。
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '续写', icon: ArrowRight },
                  { label: '改写', icon: PenLine },
                  { label: '扩展', icon: Expand },
                  { label: '总结', icon: FileText },
                  { label: '翻译', icon: Languages },
                  { label: '正式语气', icon: BookMarked },
                  { label: '轻松语气', icon: MessageCircle },
                  { label: '修正语法', icon: Check },
                  { label: '生成摘要', icon: Sparkles },
                ].map(item => (
                  <div
                    key={item.label}
                    className="flex items-center gap-1.5 px-2 py-2 rounded-lg border border-card-border/60 bg-card/30 text-xs font-medium text-muted"
                  >
                    <item.icon className="w-3 h-3 text-primary shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-4 pt-2">
                <Link
                  href={session?.user ? '/admin/posts' : '/login'}
                  className="group inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold tracking-wider uppercase hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                >
                  <PenTool className="w-4 h-4" />
                  <span>开始写作</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>

            {/* 右：自绘编辑器 mockup */}
            <div className="relative">
              <div className="absolute -inset-6 bg-gradient-to-br from-primary/20 via-purple-500/10 to-rose-500/10 rounded-[3rem] blur-2xl" />
              <div className="relative rounded-3xl overflow-hidden border border-card-border shadow-2xl bg-card">
                {/* 编辑器 chrome */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-card-border bg-background/50">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400/60" />
                    <div className="w-3 h-3 rounded-full bg-amber-400/60" />
                    <div className="w-3 h-3 rounded-full bg-green-400/60" />
                  </div>
                  <div className="flex-1 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-background/70 border border-card-border">
                      <PenTool className="w-3 h-3 text-primary" />
                      <span className="text-[11px] text-muted tracking-wide">untitled.md · 正在编辑</span>
                    </div>
                  </div>
                  <div className="w-10" />
                </div>

                {/* 编辑器正文 */}
                <div className="p-8 space-y-3 text-sm leading-relaxed font-serif relative min-h-[380px] bg-gradient-to-b from-background to-card/30">
                  <p className="text-foreground">
                    在任何创作工具里，<span className="text-muted">真正的摩擦不是</span>敲键盘，
                  </p>
                  <p>
                    <span className="text-muted">而是那种</span>
                    {/* 选中高亮 */}
                    <span className="relative inline bg-primary/15 text-foreground px-0.5 rounded-sm">
                      卡在中间写不下去的时刻
                    </span>
                    <span className="text-muted">。</span>
                  </p>
                  <p className="text-muted">
                    你需要的不是更多模板，而是一个能随时接手你思路的伙伴——
                  </p>
                  <p className="text-muted/70 italic">
                    让 AI 在句子里出现，而不是在另一个 Tab 里。
                  </p>

                  {/* 浮动 AI 菜单 */}
                  <div className="absolute top-[130px] left-[120px] right-[12%] flex flex-col gap-2 pointer-events-none">
                    <div className="flex items-center gap-1 px-2 py-1.5 bg-background border border-card-border rounded-xl shadow-2xl backdrop-blur">
                      <div className="flex items-center gap-1 pr-2 mr-1 border-r border-card-border">
                        <Sparkles className="w-3.5 h-3.5 text-rose-500" />
                        <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">AI</span>
                      </div>
                      {[
                        { label: '续写', icon: ArrowRight, active: false },
                        { label: '改写', icon: PenLine, active: true },
                        { label: '扩展', icon: Expand, active: false },
                        { label: '翻译', icon: Languages, active: false },
                      ].map(a => (
                        <div
                          key={a.label}
                          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] ${
                            a.active
                              ? 'bg-primary/10 text-primary font-bold'
                              : 'text-muted'
                          }`}
                        >
                          <a.icon className="w-3 h-3" />
                          <span>{a.label}</span>
                        </div>
                      ))}
                    </div>

                    {/* 流式预览卡片 */}
                    <div className="ml-6 w-[88%] bg-background border border-card-border rounded-2xl shadow-2xl overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-card-border bg-rose-500/5">
                        <Sparkles className="w-3 h-3 text-rose-500" />
                        <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">改写结果</span>
                        <span className="ml-auto text-[10px] text-muted">流式生成</span>
                      </div>
                      <div className="p-3 text-[11px] leading-relaxed text-foreground">
                        ...卡在一段文字中间、想不出下一句的窘迫。
                        <span className="inline-block w-1.5 h-3 bg-primary/80 align-middle ml-0.5 animate-pulse" />
                      </div>
                      <div className="flex items-center gap-1 px-3 py-2 border-t border-card-border bg-background/50">
                        <button className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-[10px] font-bold">
                          <Check className="w-2.5 h-2.5" />
                          替换
                        </button>
                        <button className="px-2 py-1 rounded-md border border-card-border text-[10px] text-muted">
                          重试
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== AI CHAT ==================== */}
      <section id="ai-chat" className="relative py-24 md:py-32 px-4 sm:px-6 border-t border-card-border overflow-hidden bg-card/20">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-rose-500/5 rounded-full blur-[150px]" />
        </div>

        <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto">
          {/* 标题 */}
          <div className="text-center mb-16 md:mb-20">
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="h-px w-12 bg-rose-500/40" />
              <span className="text-xs text-rose-500 font-bold uppercase tracking-[0.3em]">AI Conversation</span>
              <div className="h-px w-12 bg-rose-500/40" />
            </div>
            <h2 className="serif text-4xl sm:text-5xl md:text-6xl font-bold text-foreground tracking-tight mb-6">
              问它一句， <span className="text-rose-500">看见自己的一切</span>
            </h2>
            <p className="text-lg text-muted max-w-2xl mx-auto leading-relaxed">
              AI 助手接入了你的阅读记录、写作历史、笔记与高亮。
              <br className="hidden sm:block" />
              任何数据都能用自然语言问出来——不再需要翻页、筛选、导出。
            </p>
          </div>

          {/* 示例输入卡片 */}
          <div className="flex flex-wrap justify-center gap-2 mb-12 max-w-3xl mx-auto">
            {[
              '这本书我读了多少了？',
              '今天写了多少字？',
              '我做了哪些笔记？',
              '最近在读什么？',
              '上周的博客草稿',
              '帮我总结收藏的高亮',
            ].map(q => (
              <div
                key={q}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-background border border-card-border rounded-full text-xs text-muted hover:border-rose-500/40 hover:text-foreground transition-colors cursor-default"
              >
                <MessageCircle className="w-3 h-3 text-rose-500/70" />
                {q}
              </div>
            ))}
          </div>

          {/* 2 张聊天截图 */}
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-10 max-w-6xl mx-auto">
            {/* 左：进度查询 */}
            <a href="/chat" className="group block space-y-4">
              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-br from-rose-500/15 to-primary/10 rounded-[2rem] blur-xl opacity-70 group-hover:opacity-100 transition-opacity" />
                <div className="relative rounded-2xl overflow-hidden border border-card-border shadow-xl bg-card aspect-[16/10] transition-transform duration-500 group-hover:-translate-y-1">
                  <Image
                    src="/landing/ai-chat-progress.png"
                    alt="AI 对话查询阅读进度"
                    fill
                    sizes="(min-width: 1024px) 600px, 100vw"
                    className="object-cover object-top"
                  />
                  <div className="absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 bg-rose-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <span className="text-[11px] font-bold tracking-wider uppercase">去问 AI</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5 text-rose-500" />
                </div>
                <div>
                  <div className="text-sm font-bold text-foreground group-hover:text-rose-500 transition-colors">读了多少了？</div>
                  <div className="text-xs text-muted mt-0.5">
                    AI 调用工具实时查进度、预估读完时间
                  </div>
                </div>
              </div>
            </a>

            {/* 右：笔记汇总 */}
            <a href="/chat" className="group block space-y-4">
              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-br from-primary/10 to-rose-500/15 rounded-[2rem] blur-xl opacity-70 group-hover:opacity-100 transition-opacity" />
                <div className="relative rounded-2xl overflow-hidden border border-card-border shadow-xl bg-card aspect-[16/10] transition-transform duration-500 group-hover:-translate-y-1">
                  <Image
                    src="/landing/ai-chat-notes.png"
                    alt="AI 对话查询笔记"
                    fill
                    sizes="(min-width: 1024px) 600px, 100vw"
                    className="object-cover object-top"
                  />
                  <div className="absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 bg-rose-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <span className="text-[11px] font-bold tracking-wider uppercase">去问 AI</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
                  <Bookmark className="w-5 h-5 text-rose-500" />
                </div>
                <div>
                  <div className="text-sm font-bold text-foreground group-hover:text-rose-500 transition-colors">做了哪些笔记？</div>
                  <div className="text-xs text-muted mt-0.5">
                    汇总 bookmarks / highlights / posts，想看哪条点开就跳
                  </div>
                </div>
              </div>
            </a>
          </div>

          {/* CTA */}
          <div className="text-center mt-14">
            <a
              href="/chat"
              className="group inline-flex items-center gap-3 px-8 py-4 bg-rose-500 text-white rounded-2xl text-sm font-bold tracking-wider uppercase hover:bg-rose-600 transition-all duration-300 shadow-lg shadow-rose-500/20"
            >
              <BrainCircuit className="w-4 h-4" />
              <span>试试对话</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </div>
      </section>

      {/* ==================== IMMERSIVE READING ==================== */}
      <section id="immersive" className="relative py-24 md:py-32 px-4 sm:px-6 border-t border-card-border overflow-hidden">
        <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto">
          <div className="text-center mb-16 md:mb-20">
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="h-px w-12 bg-cyan-500/40" />
              <span className="text-xs text-cyan-500 font-bold uppercase tracking-[0.3em]">Reading Experience</span>
              <div className="h-px w-12 bg-cyan-500/40" />
            </div>
            <h2 className="serif text-4xl sm:text-5xl md:text-6xl font-bold text-foreground tracking-tight mb-6">
              不止于 AI，<span className="text-cyan-500">每一页都讲究</span>
            </h2>
            <p className="text-lg text-muted max-w-2xl mx-auto leading-relaxed">
              翻页像纸书，进度跟着人走，笔记永远不散
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* 翻页动画 */}
            <div className="group relative p-8 rounded-3xl border border-card-border bg-card/40 hover:bg-card/70 transition-all duration-500 overflow-hidden">
              <div className="relative h-40 mb-6 flex items-center justify-center perspective-[1000px]">
                {/* 模拟翻页的两页 */}
                <div className="relative w-32 h-36 transform-gpu group-hover:scale-105 transition-transform">
                  <div className="absolute inset-0 -translate-x-[48%] bg-gradient-to-br from-[#f5efe5] to-[#e9dfc9] rounded-sm shadow-xl border border-card-border flex flex-col gap-1 p-3">
                    {[0.9, 0.8, 0.95, 0.7, 0.85, 0.6].map((w, i) => (
                      <div key={i} className="h-[2px] bg-[#a38760]/30 rounded-full" style={{ width: `${w * 100}%` }} />
                    ))}
                  </div>
                  <div
                    className="absolute inset-0 translate-x-[0%] bg-gradient-to-bl from-[#f5efe5] to-[#e9dfc9] rounded-sm shadow-2xl border border-card-border origin-left transition-transform duration-700 group-hover:[transform:rotateY(-32deg)] flex flex-col gap-1 p-3"
                    style={{ transformStyle: 'preserve-3d' }}
                  >
                    {[0.85, 0.75, 0.9, 0.65, 0.8, 0.55, 0.7].map((w, i) => (
                      <div key={i} className="h-[2px] bg-[#a38760]/40 rounded-full" style={{ width: `${w * 100}%` }} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="relative">
                <h3 className="text-xl font-bold text-foreground mb-2 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-cyan-500" />
                  翻页阅读
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  仿纸书翻页动画，支持键盘/触摸/点击，800 页书也能流畅跳转。
                </p>
              </div>
            </div>

            {/* 跨端同步 */}
            <div className="group relative p-8 rounded-3xl border border-card-border bg-card/40 hover:bg-card/70 transition-all duration-500 overflow-hidden">
              <div className="relative h-40 mb-6 flex items-center justify-center">
                <div className="relative flex items-end gap-4">
                  {/* 桌面 */}
                  <div className="w-24 h-20 rounded-md border-2 border-card-border bg-gradient-to-br from-card to-background p-1.5 relative">
                    <div className="h-full rounded-sm bg-gradient-to-b from-amber-500/10 to-primary/5 flex items-center justify-center">
                      <Monitor className="w-6 h-6 text-muted/60" />
                    </div>
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-1 w-10 bg-card-border rounded-b" />
                    <div className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 h-[3px] w-14 bg-card-border rounded-b" />
                  </div>
                  {/* 同步连线 */}
                  <div className="flex flex-col items-center justify-center gap-1 pb-2">
                    <div className="w-8 h-8 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center animate-spin-slow">
                      <RefreshCw className="w-3.5 h-3.5 text-cyan-500" />
                    </div>
                  </div>
                  {/* 手机 */}
                  <div className="w-12 h-24 rounded-lg border-2 border-card-border bg-gradient-to-br from-card to-background p-1 relative">
                    <div className="h-full rounded-sm bg-gradient-to-b from-amber-500/10 to-primary/5 flex items-center justify-center">
                      <Smartphone className="w-4 h-4 text-muted/60" />
                    </div>
                  </div>
                </div>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-cyan-500" />
                跨端同步
              </h3>
              <p className="text-sm text-muted leading-relaxed">
                阅读进度、字符锚点、笔记高亮，打开就在刚才的那一句。
              </p>
            </div>

            {/* 高亮笔记 */}
            <div className="group relative p-8 rounded-3xl border border-card-border bg-card/40 hover:bg-card/70 transition-all duration-500 overflow-hidden">
              <div className="relative h-40 mb-6">
                <div className="absolute left-2 right-2 top-2 rounded-xl border border-card-border bg-background/80 p-3 shadow-sm space-y-1.5">
                  <div className="h-2 rounded-full bg-muted/30 w-[90%]" />
                  <div className="h-2 rounded-full bg-yellow-400/45 w-[70%]" />
                  <div className="h-2 rounded-full bg-muted/30 w-[85%]" />
                  <div className="h-2 rounded-full bg-muted/30 w-[60%]" />
                </div>
                <div className="absolute left-8 right-3 bottom-2 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-2.5 shadow-lg space-y-1">
                  <div className="flex items-center gap-1 text-[10px] font-bold text-yellow-600 uppercase tracking-wider">
                    <Quote className="w-2.5 h-2.5" />
                    <span>笔记</span>
                  </div>
                  <div className="text-[11px] leading-relaxed text-foreground">
                    想法：这段是全书的题眼。
                  </div>
                </div>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2 flex items-center gap-2">
                <Highlighter className="w-4 h-4 text-cyan-500" />
                高亮与笔记
              </h3>
              <p className="text-sm text-muted leading-relaxed">
                5 种颜色、独立笔记、列表汇总，AI 回答还能一键存进去。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FEATURE GRID ==================== */}
      <section id="features" className="relative py-20 md:py-28 px-4 sm:px-6 border-t border-card-border bg-card/20">
        <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-4 mb-5">
              <div className="h-px w-12 bg-primary/30" />
              <span className="text-xs text-primary font-bold uppercase tracking-[0.3em]">All features</span>
              <div className="h-px w-12 bg-primary/30" />
            </div>
            <h2 className="serif text-3xl sm:text-4xl md:text-5xl font-bold text-foreground tracking-tight">
              为创作者打磨的所有细节
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: BrainCircuit, title: 'AI 对话助手', desc: '联网搜索、数据查询、上下文对话，问什么都在线', color: 'text-rose-500', bg: 'bg-rose-500/10' },
              { icon: Sparkles, title: 'AI 写作动作', desc: '续写 / 改写 / 翻译 / 总结 / 纠错 等 9 个动作一键即达', color: 'text-primary', bg: 'bg-primary/10' },
              { icon: BookMarked, title: 'AI 阅读工具', desc: '解释 / 翻译 / 总结 / 提问 / 存为笔记', color: 'text-amber-500', bg: 'bg-amber-500/10' },
              { icon: RefreshCw, title: '跨端进度同步', desc: '字符级锚点定位，切设备也精准跳回原页', color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
              { icon: Highlighter, title: '高亮与笔记', desc: '5 色高亮，段落笔记，划线模式保护翻页手势', color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
              { icon: BookOpen, title: '多格式书架', desc: '支持 EPUB / PDF / TXT / Markdown / HTML', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
              { icon: PenTool, title: '所见即所得编辑器', desc: 'Tiptap 富文本，代码高亮，图片拖拽，Markdown 双向', color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
              { icon: Globe, title: '独立个人主页', desc: '每位作者一个专属 /u/:name，一键分享作品', color: 'text-blue-500', bg: 'bg-blue-500/10' },
              { icon: Palette, title: '主题与排版', desc: '夜间/日光/暖黄三主题，字号、行距、页宽自由定制', color: 'text-purple-500', bg: 'bg-purple-500/10' },
              { icon: Shield, title: 'OAuth 登录', desc: 'GitHub 一键登录，数据云端同步，安全可靠', color: 'text-teal-500', bg: 'bg-teal-500/10' },
              { icon: MessageCircle, title: '评论与关注', desc: 'Giscus 讨论、关注作者、发现新内容', color: 'text-pink-500', bg: 'bg-pink-500/10' },
              { icon: Code2, title: '开源自托管', desc: 'Next.js + Prisma + PostgreSQL，随时 fork 部署', color: 'text-slate-500', bg: 'bg-slate-500/10' },
            ].map(feature => (
              <div
                key={feature.title}
                className="group p-5 rounded-2xl border border-card-border bg-card/30 hover:bg-card/60 hover:border-card-border/80 transition-all duration-300"
              >
                <div className={`w-10 h-10 ${feature.bg} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <feature.icon className={`w-5 h-5 ${feature.color}`} />
                </div>
                <h3 className="text-sm font-bold text-foreground mb-1.5">{feature.title}</h3>
                <p className="text-xs text-muted leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== HOW IT WORKS ==================== */}
      <section className="relative py-20 md:py-28 px-4 sm:px-6 border-t border-card-border">
        <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto">
          <div className="text-center mb-14">
            <div className="flex items-center justify-center gap-4 mb-5">
              <div className="h-px w-12 bg-primary/30" />
              <span className="text-xs text-primary font-bold uppercase tracking-[0.3em]">How it works</span>
              <div className="h-px w-12 bg-primary/30" />
            </div>
            <h2 className="serif text-3xl sm:text-4xl md:text-5xl font-bold text-foreground tracking-tight">
              三步进入 AI 创作
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-10">
            {[
              { step: '01', title: '登录', desc: 'GitHub 一键登录，免费解锁所有 AI 能力' },
              { step: '02', title: '创作', desc: '写作、阅读、划线、提问 AI，所有动作都被记录' },
              { step: '03', title: '对话', desc: '向 AI 问任何关于自己的数据与进度' },
            ].map((item, index) => (
              <div key={item.step} className="relative text-center">
                {index < 2 && (
                  <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-px bg-gradient-to-r from-primary/30 to-transparent" />
                )}
                <div className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <span className="serif text-3xl font-bold text-primary">{item.step}</span>
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-14">
            <Link
              href={ctaHref}
              className="group inline-flex items-center gap-3 px-10 py-5 bg-primary text-primary-foreground rounded-2xl text-sm font-bold tracking-wider uppercase hover:bg-primary/90 transition-all duration-300 shadow-lg shadow-primary/20"
            >
              <span>{ctaText}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* ==================== DEVELOPER ==================== */}
      <section id="developer" className="relative py-20 md:py-28 px-4 sm:px-6 border-t border-card-border bg-card/20">
        <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <div className="h-px w-12 bg-primary/30" />
                  <span className="text-xs text-primary font-bold uppercase tracking-[0.3em]">Developer</span>
                </div>
                <h2 className="serif text-3xl sm:text-4xl md:text-5xl font-bold text-foreground tracking-tight">
                  关于开发者
                </h2>
              </div>

              <div className="space-y-4 text-base text-muted leading-relaxed">
                <p>
                  我是一名热爱技术与设计的开发者，相信代码不仅是工具，更是表达创意的方式。
                </p>
                <p>
                  <span className="text-foreground font-medium">Ink&Code</span> 是我的开源项目，
                  把 AI、阅读与写作整合在一起，希望能成为你最顺手的创作空间。
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {['Next.js 16', 'TypeScript', 'Prisma', 'PostgreSQL', 'Tailwind', 'AI SDK'].map(tag => (
                  <span
                    key={tag}
                    className="px-3 py-1.5 rounded-full border border-card-border text-[11px] tracking-wider uppercase text-muted font-bold bg-card/50"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-3 pt-2">
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

            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-purple-500/10 rounded-[3rem] blur-3xl" />
              <div className="relative p-8 bg-card/60 backdrop-blur border border-card-border rounded-[2.5rem] space-y-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Code2 className="w-7 h-7 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">开源项目</h3>
                    <p className="text-muted text-xs">Fork · Star · Contribute</p>
                  </div>
                </div>
                <div className="h-px bg-card-border" />
                <p className="text-muted italic serif text-base">
                  &quot;用代码书写思想，用 AI 放大表达。&quot;
                </p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Built with</span>
                  <span className="text-foreground font-medium">Next.js + ptc-cortex</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FINAL CTA ==================== */}
      <section className="relative py-24 md:py-32 px-4 sm:px-6 border-t border-card-border bg-gradient-to-b from-primary/5 via-rose-500/[0.03] to-transparent overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-rose-500/10 rounded-full blur-[120px]" />
        </div>
        <div className="max-w-4xl 2xl:max-w-5xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-rose-500/10 border border-rose-500/20 rounded-full mb-6">
            <Sparkles className="w-3.5 h-3.5 text-rose-500" />
            <span className="text-xs font-bold text-rose-500 tracking-wider uppercase">免费使用</span>
          </div>
          <h2 className="serif text-4xl sm:text-5xl md:text-6xl font-bold text-foreground tracking-tight mb-6">
            让 AI 陪你
            <br className="sm:hidden" />
            <span className="text-primary">写作与阅读</span>
          </h2>
          <p className="text-lg text-muted mb-10 max-w-2xl mx-auto">
            把灵感留给创作，让琐事交给 AI。
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={ctaHref}
              className="group inline-flex items-center gap-3 px-10 py-5 bg-primary text-primary-foreground rounded-2xl text-sm font-bold tracking-wider uppercase hover:bg-primary/90 transition-all duration-300 shadow-xl shadow-primary/30"
            >
              <span>{ctaText}</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="/chat"
              className="group inline-flex items-center gap-3 px-10 py-5 border border-card-border rounded-2xl text-sm font-bold tracking-wider uppercase text-foreground hover:bg-card/60 transition-all duration-300"
            >
              <Send className="w-4 h-4 text-rose-500" />
              <span>对话 AI 试试</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

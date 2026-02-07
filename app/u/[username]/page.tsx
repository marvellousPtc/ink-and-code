import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { Github, Globe, Linkedin, Twitter, Calendar, ArrowRight, BookOpen, Sparkles } from 'lucide-react';
import FollowButton from '@/app/components/FollowButton';
import FollowStats from '@/app/components/FollowStats';

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  const user = await prisma.user.findUnique({
    where: { username },
    select: { name: true, headline: true },
  });

  if (!user) {
    return { title: '用户不存在' };
  }

  return {
    title: `${user.name || username} - Ink&Code`,
    description: user.headline || `${user.name || username} 的个人主页`,
  };
}

export default async function UserPublicPage({ params }: Props) {
  const { username } = await params;

  // 获取用户信息和文章
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      siteConfig: true,
      posts: {
        where: { 
          published: true,
          bannedAt: null,
          deletedByAdmin: false,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          slug: true,
          title: true,
          excerpt: true,
          tags: true,
          createdAt: true,
          coverImage: true,
        },
      },
      _count: {
        select: {
          followers: true,
          following: true,
        },
      },
    },
  });

  if (!user) {
    notFound();
  }

  // 检查用户是否被禁用或资料被隐藏
  if (user.bannedAt || user.profileHidden) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-glow" />
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-card border border-card-border flex items-center justify-center">
            <span className="text-3xl">🚫</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            {user.bannedAt ? '该用户已被封禁' : '该用户已隐藏个人资料'}
          </h1>
          <p className="text-muted mb-6">
            {user.bannedAt 
              ? '该用户因违反社区规定已被封禁，无法查看其内容。' 
              : '该用户选择隐藏个人资料，暂时无法查看。'}
          </p>
          <a 
            href="/" 
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors"
          >
            返回首页
          </a>
        </div>
      </div>
    );
  }

  const siteConfig = user.siteConfig;
  const followersCount = user._count.followers;
  const followingCount = user._count.following;
  const socialLinks = [
    { url: siteConfig?.githubUrl, icon: Github, label: 'GitHub' },
    { url: siteConfig?.twitterUrl, icon: Twitter, label: 'Twitter' },
    { url: siteConfig?.linkedinUrl, icon: Linkedin, label: 'LinkedIn' },
    { url: siteConfig?.websiteUrl, icon: Globe, label: 'Website' },
  ].filter(l => l.url);

  const displayName = siteConfig?.siteName || user.name || username || '我的博客';
  const tagline = siteConfig?.siteTagline || user.headline || '记录生活，分享技术';

  return (
    <div className="min-h-screen relative">
      <div className="bg-glow" />

      {/* ====== HERO ====== */}
      <section className="relative min-h-[70vh] sm:min-h-[80vh] flex items-center justify-center overflow-hidden">
        {/* 背景装饰光斑 */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-primary/8 rounded-full blur-[150px] animate-pulse" />
          <div className="absolute bottom-1/4 right-1/5 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-[120px]" />
          <div className="absolute top-1/2 right-1/3 w-[300px] h-[300px] bg-blue-500/5 rounded-full blur-[100px]" />
        </div>

        {/* 装饰网格 */}
        <div
          className="absolute inset-0 -z-10 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
        />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 w-full py-32 sm:py-40">
          <div className="flex flex-col items-center text-center">
            {/* 头像 — 带光环 */}
            <div className="relative mb-8 animate-fade-up">
              <div className="absolute -inset-3 bg-primary/20 rounded-full blur-xl animate-pulse" />
              {user.image ? (
                <img
                  src={user.image}
                  alt={displayName}
                  className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full ring-4 ring-background shadow-2xl shadow-primary/20 object-cover"
                />
              ) : (
                <div className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-4 ring-background">
                  <span className="text-5xl sm:text-6xl font-bold text-primary">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              {/* 在线状态小点 */}
              <div className="absolute bottom-1 right-1 w-5 h-5 bg-emerald-400 rounded-full ring-4 ring-background" />
            </div>

            {/* 名称 */}
            <h1 className="serif text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground mb-4 animate-fade-up [animation-delay:100ms] opacity-0 [animation-fill-mode:forwards]">
              {displayName}
            </h1>

            {/* 标语 */}
            <p className="text-lg sm:text-xl text-muted max-w-xl leading-relaxed serif italic mb-6 animate-fade-up [animation-delay:200ms] opacity-0 [animation-fill-mode:forwards]">
              &ldquo;{tagline}&rdquo;
            </p>

            {/* 简介 */}
            {user.bio && (
              <p className="text-muted/80 max-w-lg leading-relaxed mb-8 animate-fade-up [animation-delay:300ms] opacity-0 [animation-fill-mode:forwards]">
                {user.bio}
              </p>
            )}

            {/* 关注统计 + 关注按钮 */}
            <div className="flex flex-wrap items-center justify-center gap-4 mb-8 animate-fade-up [animation-delay:400ms] opacity-0 [animation-fill-mode:forwards]">
              <FollowStats
                userId={user.id}
                initialFollowing={followingCount}
                initialFollowers={followersCount}
              />
              <FollowButton userId={user.id} />
            </div>

            {/* 社交链接 */}
            {socialLinks.length > 0 && (
              <div className="flex items-center gap-2 animate-fade-up [animation-delay:500ms] opacity-0 [animation-fill-mode:forwards]">
                {socialLinks.map(({ url, icon: Icon, label }) => (
                  <a
                    key={label}
                    href={url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative w-11 h-11 rounded-xl bg-card/50 border border-card-border/60 backdrop-blur-sm flex items-center justify-center text-muted hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10"
                    title={label}
                  >
                    <Icon className="w-[18px] h-[18px]" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 底部渐变分割 */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </section>

      {/* ====== 统计数据条 ====== */}
      <section className="relative -mt-16 z-10 px-4 sm:px-6 mb-16">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-center gap-6 sm:gap-10 p-6 rounded-2xl bg-card/60 border border-card-border/60 backdrop-blur-xl shadow-xl shadow-black/5">
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-foreground tabular-nums">{user.posts.length}</div>
              <div className="text-[10px] sm:text-xs text-muted uppercase tracking-widest mt-1 font-medium">文章</div>
            </div>
            <div className="w-px h-10 bg-card-border/60" />
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-foreground tabular-nums">{followersCount}</div>
              <div className="text-[10px] sm:text-xs text-muted uppercase tracking-widest mt-1 font-medium">粉丝</div>
            </div>
            <div className="w-px h-10 bg-card-border/60" />
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-foreground tabular-nums">{followingCount}</div>
              <div className="text-[10px] sm:text-xs text-muted uppercase tracking-widest mt-1 font-medium">关注</div>
            </div>
            {user.createdAt && (
              <>
                <div className="w-px h-10 bg-card-border/60 hidden sm:block" />
                <div className="text-center hidden sm:block">
                  <div className="text-2xl sm:text-3xl font-bold text-foreground tabular-nums">
                    {new Date(user.createdAt).getFullYear()}
                  </div>
                  <div className="text-[10px] sm:text-xs text-muted uppercase tracking-widest mt-1 font-medium">加入</div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ====== 文章列表 ====== */}
      <section className="px-4 sm:px-6 pb-24">
        <div className="max-w-4xl mx-auto">
          {/* 标题 */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground leading-none">最新文章</h2>
              <p className="text-xs text-muted mt-1">共 {user.posts.length} 篇</p>
            </div>
          </div>

          {user.posts.length > 0 ? (
            <div className="space-y-5">
              {user.posts.map((post, i) => (
                <Link
                  key={post.id}
                  href={`/u/${username}/${post.slug}`}
                  className="group block relative rounded-2xl border border-card-border/60 bg-card/30 hover:bg-card/60 hover:border-primary/20 transition-all duration-500 overflow-hidden hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  {/* 悬停渐变 */}
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <div className="relative flex flex-col sm:flex-row gap-5 p-5 sm:p-6">
                    {/* 封面图 */}
                    {post.coverImage && (
                      <div className="sm:w-52 h-36 sm:h-auto rounded-xl overflow-hidden bg-card-border/20 shrink-0">
                        <img
                          src={post.coverImage}
                          alt={post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                        />
                      </div>
                    )}

                    {/* 内容 */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <h3 className="text-lg sm:text-xl font-bold text-foreground group-hover:text-primary transition-colors duration-300 mb-2.5 line-clamp-2 leading-snug">
                          {post.title}
                        </h3>
                        {post.excerpt && (
                          <p className="text-sm text-muted/80 line-clamp-2 leading-relaxed mb-4">
                            {post.excerpt}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-xs text-muted">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>
                              {new Date(post.createdAt).toLocaleDateString('zh-CN', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>
                          {post.tags.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              {post.tags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="px-2 py-0.5 rounded-full bg-primary/8 text-primary/80 text-[10px] font-medium"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-muted group-hover:text-primary transition-colors">
                          <span className="hidden sm:inline font-medium">阅读</span>
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-24">
              <div className="relative inline-block mb-8">
                <div className="absolute -inset-4 bg-primary/10 rounded-full blur-2xl" />
                <div className="relative w-24 h-24 rounded-3xl bg-card border border-card-border flex items-center justify-center">
                  <BookOpen className="w-10 h-10 text-muted/40" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">暂无文章</h3>
              <p className="text-muted text-sm">该用户还没有发布任何文章</p>
            </div>
          )}
        </div>
      </section>

      {/* ====== FOOTER ====== */}
      <footer className="py-10 px-4 sm:px-6 border-t border-card-border/40">
        <div className="max-w-4xl mx-auto text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-muted/60 hover:text-muted transition-colors text-xs tracking-wider uppercase font-medium">
            Powered by <span className="serif text-sm font-bold text-foreground/60">Ink<span className="text-primary/60">&</span>Code</span>
          </Link>
        </div>
      </footer>
    </div>
  );
}

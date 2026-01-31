import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPostByIdAsync, getPostBySlugAsync, getAllPostsAsync } from '@/lib/posts';
import TiptapRenderer from '@/app/components/TiptapRenderer';

// 通过 id 或 slug 获取文章
async function getPost(idOrSlug: string) {
  // 先尝试通过 id 获取
  let post = await getPostByIdAsync(idOrSlug);
  // 如果找不到，再尝试通过 slug 获取
  if (!post) {
    post = await getPostBySlugAsync(idOrSlug);
  }
  return post;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  const posts = await getAllPostsAsync();
  return posts.map((post) => ({ id: post.id }));
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const post = await getPost(id);
  
  if (!post) {
    return { title: '文章未找到 | Ink & Code' };
  }

  return {
    title: `${post.title} | Ink & Code`,
    description: post.excerpt,
  };
}

export default async function PostPage({ params }: PageProps) {
  const { id } = await params;
  const post = await getPost(id);

  if (!post) {
    notFound();
  }

  const formattedDate = new Date(post.date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen pt-24 sm:pt-32 md:pt-40 pb-16 sm:pb-24 md:pb-32 px-4 sm:px-6 overflow-x-hidden">
      <div className="bg-glow" />
      <article className="max-w-7xl mx-auto overflow-hidden">
        {/* 移动端返回按钮 */}
        <div className="lg:hidden mb-6">
          <Link 
            href="/blog"
            className="text-xs tracking-[0.2em] uppercase text-muted hover:text-primary transition-colors inline-flex items-center gap-2 group font-bold"
          >
            <span className="group-hover:-translate-x-1 transition-transform">←</span>
            返回列表
          </Link>
        </div>

        <div className="grid lg:grid-cols-[1fr_minmax(auto,75ch)_1fr] gap-8 lg:gap-12">
          {/* Left: Navigation - 仅桌面端显示 */}
          <aside className="hidden lg:block">
            <div className="sticky top-32">
              <Link 
                href="/blog"
                className="text-xs tracking-[0.2em] uppercase text-muted hover:text-primary transition-colors inline-flex items-center gap-2 group font-bold"
              >
                <span className="group-hover:-translate-x-1 transition-transform">←</span>
                BACK
              </Link>
            </div>
          </aside>

          {/* Center: Content */}
          <div className="min-w-0 overflow-hidden">
            <header className="mb-8 sm:mb-12 md:mb-16">
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-6 sm:mb-8 text-[10px] sm:text-xs tracking-[0.15em] sm:tracking-[0.2em] uppercase font-bold text-muted">
                <time>{formattedDate}</time>
                <span className="w-1 h-1 rounded-full bg-card-border" />
                <div className="flex flex-wrap gap-2 sm:gap-4">
                  {post.tags.map((tag) => (
                    <span key={tag} className="text-primary">#{tag}</span>
                  ))}
                </div>
              </div>
              
              <h1 className="serif text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-foreground leading-tight mb-4 sm:mb-6 md:mb-8 break-words">
                {post.title}
              </h1>

              {post.excerpt && (
                <p className="text-sm sm:text-base md:text-lg text-muted leading-relaxed serif italic border-l-2 border-primary/20 pl-4 sm:pl-6 py-2 break-words">
                  {post.excerpt}
                </p>
              )}
            </header>

            <TiptapRenderer content={post.content} />

            <footer className="mt-16 sm:mt-24 md:mt-32 pt-8 sm:pt-12 md:pt-16 border-t border-card-border">
              <div className="flex flex-col md:flex-row justify-between items-center gap-6 sm:gap-8 md:gap-12">
                <div className="text-base sm:text-lg text-muted serif italic text-center md:text-left">
                  感谢你的阅读。
                </div>
                <Link 
                  href="/blog"
                  className="text-[10px] sm:text-xs tracking-[0.15em] sm:tracking-[0.2em] uppercase border border-card-border px-6 sm:px-10 py-3 sm:py-4 rounded-full hover:bg-card hover:border-primary/30 transition-all duration-300 font-bold"
                >
                  返回文章列表
                </Link>
              </div>
            </footer>
          </div>

          {/* Right: Empty for balance */}
          <aside className="hidden lg:block" />
        </div>
      </article>
    </div>
  );
}

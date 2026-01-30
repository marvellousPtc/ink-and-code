import { prisma } from '@/lib/prisma';
import BlogPageClient from './BlogPageClient';

export const metadata = {
  title: '文章 | Ink & Code',
  description: '所有博客文章',
};

export const dynamic = 'force-dynamic';

interface PostWithCategory {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  tags: string[];
  categoryId: string | null;
  category: {
    id: string;
    name: string;
    icon: string | null;
  } | null;
  createdAt: Date;
}

export default async function BlogPage() {
  // 获取所有已发布的文章
  const posts: PostWithCategory[] = await prisma.post.findMany({
    where: { published: true },
    include: {
      category: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // 转换为客户端格式
  const formattedPosts = posts.map((post) => ({
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt || '',
    tags: post.tags,
    categoryId: post.categoryId,
    category: post.category
      ? {
          id: post.category.id,
          name: post.category.name,
          icon: post.category.icon,
        }
      : null,
    date: post.createdAt.toISOString(),
  }));

  return <BlogPageClient initialPosts={formattedPosts} />;
}

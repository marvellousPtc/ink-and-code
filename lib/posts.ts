import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const postsDirectory = path.join(process.cwd(), 'content/posts');

// 检查是否使用数据库
// 如果配置了 DATABASE_URL 环境变量，则使用数据库
const useDatabase = !!process.env.DATABASE_URL;

export interface PostMeta {
  id: string;
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  tags: string[];
  coverImage?: string;
}

export interface Post extends PostMeta {
  content: string;
}

// ============================================
// 文件系统方法（向后兼容）
// ============================================

// 确保目录存在
function ensureDirectoryExists() {
  if (!fs.existsSync(postsDirectory)) {
    fs.mkdirSync(postsDirectory, { recursive: true });
  }
}

// 从文件系统获取所有文章
function getAllPostsFromFiles(): PostMeta[] {
  ensureDirectoryExists();
  
  const fileNames = fs.readdirSync(postsDirectory);
  const allPosts = fileNames
    .filter((fileName) => fileName.endsWith('.md'))
    .map((fileName) => {
      const slug = fileName.replace(/\.md$/, '');
      const fullPath = path.join(postsDirectory, fileName);
      const fileContents = fs.readFileSync(fullPath, 'utf8');
      const { data } = matter(fileContents);

      return {
        id: slug, // 文件系统模式下用 slug 作为 id
        slug,
        title: data.title || slug,
        date: data.date || new Date().toISOString(),
        excerpt: data.excerpt || '',
        tags: data.tags || [],
        coverImage: data.coverImage,
      };
    });

  return allPosts.sort((a, b) => (a.date > b.date ? -1 : 1));
}

// 从文件系统获取单篇文章
function getPostBySlugFromFiles(slug: string): Post | null {
  ensureDirectoryExists();
  
  try {
    const fullPath = path.join(postsDirectory, `${slug}.md`);
    const fileContents = fs.readFileSync(fullPath, 'utf8');
    const { data, content } = matter(fileContents);

    return {
      id: slug, // 文件系统模式下用 slug 作为 id
      slug,
      title: data.title || slug,
      date: data.date || new Date().toISOString(),
      excerpt: data.excerpt || '',
      tags: data.tags || [],
      coverImage: data.coverImage,
      content,
    };
  } catch {
    return null;
  }
}

// 从文件系统按 ID 获取文章（文件系统模式下 id = slug）
function getPostByIdFromFiles(id: string): Post | null {
  return getPostBySlugFromFiles(id);
}

// 从文件系统获取所有 slug
function getAllPostSlugsFromFiles(): string[] {
  ensureDirectoryExists();
  
  const fileNames = fs.readdirSync(postsDirectory);
  return fileNames
    .filter((fileName) => fileName.endsWith('.md'))
    .map((fileName) => fileName.replace(/\.md$/, ''));
}

// ============================================
// 数据库方法（使用 Prisma）
// ============================================

async function getAllPostsFromDB(): Promise<PostMeta[]> {
  const { prisma } = await import('./prisma');
  
  const posts = await prisma.post.findMany({
    where: { published: true },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      tags: true,
      coverImage: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return posts.map((post) => ({
    id: post.id,
    slug: post.slug,
    title: post.title,
    date: post.createdAt.toISOString().split('T')[0],
    excerpt: post.excerpt || '',
    tags: post.tags,
    coverImage: post.coverImage || undefined,
  }));
}

async function getPostBySlugFromDB(slug: string): Promise<Post | null> {
  const { prisma } = await import('./prisma');
  
  const post = await prisma.post.findUnique({
    where: { slug },
  });

  if (!post) return null;

  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    date: post.createdAt.toISOString().split('T')[0],
    excerpt: post.excerpt || '',
    tags: post.tags,
    coverImage: post.coverImage || undefined,
    content: post.content,
  };
}

async function getPostByIdFromDB(id: string): Promise<Post | null> {
  const { prisma } = await import('./prisma');
  
  const post = await prisma.post.findUnique({
    where: { id },
  });

  if (!post) return null;

  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    date: post.createdAt.toISOString().split('T')[0],
    excerpt: post.excerpt || '',
    tags: post.tags,
    coverImage: post.coverImage || undefined,
    content: post.content,
  };
}

async function getAllPostSlugsFromDB(): Promise<string[]> {
  const { prisma } = await import('./prisma');
  
  const posts = await prisma.post.findMany({
    where: { published: true },
    select: { slug: true },
  });

  return posts.map((post) => post.slug);
}

// ============================================
// 导出的统一接口
// ============================================

// 获取所有文章的元数据
export function getAllPosts(): PostMeta[] {
  // 注意：如果使用数据库，需要在调用处使用 await
  // 但为了保持向后兼容，文件系统模式仍然是同步的
  if (useDatabase) {
    // 在同步上下文中无法直接调用异步函数
    // 因此在使用数据库时，建议使用 getAllPostsAsync
    console.warn('Using database mode. Consider using getAllPostsAsync() instead.');
    return getAllPostsFromFiles(); // 降级到文件系统
  }
  return getAllPostsFromFiles();
}

// 异步获取所有文章（推荐在使用数据库时使用）
export async function getAllPostsAsync(): Promise<PostMeta[]> {
  if (useDatabase) {
    return getAllPostsFromDB();
  }
  return getAllPostsFromFiles();
}

// 获取单篇文章
export function getPostBySlug(slug: string): Post | null {
  if (useDatabase) {
    console.warn('Using database mode. Consider using getPostBySlugAsync() instead.');
    return getPostBySlugFromFiles(slug);
  }
  return getPostBySlugFromFiles(slug);
}

// 异步获取单篇文章（推荐在使用数据库时使用）
export async function getPostBySlugAsync(slug: string): Promise<Post | null> {
  if (useDatabase) {
    // 先从数据库查找
    const post = await getPostBySlugFromDB(slug);
    if (post) return post;
    // 数据库找不到，尝试从文件系统查找（支持静态 Markdown 文章）
    return getPostBySlugFromFiles(slug);
  }
  return getPostBySlugFromFiles(slug);
}

// 按 ID 获取单篇文章
export async function getPostByIdAsync(id: string): Promise<Post | null> {
  if (useDatabase) {
    return getPostByIdFromDB(id);
  }
  return getPostByIdFromFiles(id);
}

// 获取所有文章的 slug，用于静态生成
export function getAllPostSlugs(): string[] {
  if (useDatabase) {
    console.warn('Using database mode. Consider using getAllPostSlugsAsync() instead.');
    return getAllPostSlugsFromFiles();
  }
  return getAllPostSlugsFromFiles();
}

// 异步获取所有 slug（推荐在使用数据库时使用）
export async function getAllPostSlugsAsync(): Promise<string[]> {
  if (useDatabase) {
    return getAllPostSlugsFromDB();
  }
  return getAllPostSlugsFromFiles();
}

// 获取所有标签
export async function getAllTags(): Promise<string[]> {
  const posts = await getAllPostsAsync();
  const tagSet = new Set<string>();
  posts.forEach((post) => {
    post.tags.forEach((tag) => tagSet.add(tag));
  });
  return Array.from(tagSet);
}

// 根据标签获取文章
export async function getPostsByTag(tag: string): Promise<PostMeta[]> {
  const posts = await getAllPostsAsync();
  return posts.filter((post) => post.tags.includes(tag));
}

import { prisma } from '@/lib/prisma';
import { created, ApiError, requireAuthOrToken, validateRequired } from '@/lib/api-response';
import { NextResponse } from 'next/server';
import { markdownToTiptap } from '@/lib/markdown-to-tiptap';

/**
 * POST /api/article/create-from-commit
 * 创建 Markdown 文章（内部会转成 TipTap JSON）。
 * 同时支持两种鉴权：
 *   1) Session cookie（浏览器已登录的用户，例如 ptc-cortex 这种同域 Web 调用）
 *   2) API Token（GitHub Actions / CLI 等外部服务）
 *
 * 请求头（二选一）：
 *   Authorization: Bearer ink_xxxxxxxx
 * 
 * 请求体：
 *   {
 *     title: string;           // 文章标题
 *     content: string;         // 文章内容（Markdown 或 HTML）
 *     slug?: string;           // URL slug（可选，自动生成）
 *     excerpt?: string;        // 摘要（可选）
 *     tags?: string[];         // 标签（可选）
 *     categorySlug?: string;   // 分类 slug（可选）
 *     published?: boolean;     // 是否发布（默认 false）
 *     commitInfo?: {           // Commit 信息（可选，用于记录来源）
 *       repo: string;
 *       sha: string;
 *       message: string;
 *       url: string;
 *     }
 *   }
 */
export async function POST(request: Request) {
  try {
    // Session 优先，Token 兜底
    const { userId, error: authError } = await requireAuthOrToken(request);
    if (authError) return authError;

    const data = await request.json();

    // 验证必填字段
    const validationError = validateRequired(data, ['title', 'content']);
    if (validationError) return validationError;

    // 限制标题长度（PostgreSQL btree 索引限制）
    let title = data.title;
    if (title.length > 200) {
      title = title.slice(0, 197) + '...';
    }

    // 生成 slug（如果没有提供）
    let slug = data.slug;
    if (!slug) {
      // 从标题生成 slug
      slug = generateSlug(title);
    }

    // 确保 slug 唯一
    const existingArticle = await prisma.post.findFirst({
      where: {
        userId: userId!,
        slug,
      },
    });

    if (existingArticle) {
      // 添加时间戳后缀
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    // 查找分类（如果提供了 categorySlug）
    let categoryId: string | null = null;
    if (data.categorySlug) {
      const category = await prisma.category.findFirst({
        where: {
          userId: userId!,
          slug: data.categorySlug,
        },
      });
      if (category) {
        categoryId = category.id;
      }
    }

    // 构建文章内容（Markdown 格式）
    let markdownContent = data.content;

    // 如果提供了 commitInfo，在文章末尾添加来源信息
    if (data.commitInfo) {
      const { repo, sha, message, url } = data.commitInfo;
      const commitFooter = `

---

> 本文由 [${repo}](https://github.com/${repo}) 的 commit [${sha.slice(0, 7)}](${url}) 自动生成
> 
> **Commit Message:** ${message}
`;
      markdownContent = markdownContent + commitFooter;
    }

    // 将 Markdown 转换为 TipTap JSON 格式
    const content = markdownToTiptap(markdownContent);

    // 创建文章
    const article = await prisma.post.create({
      data: {
        title,
        slug,
        content,
        excerpt: data.excerpt || generateExcerpt(markdownContent),
        tags: data.tags || [],
        published: data.published ?? false,
        categoryId,
        userId: userId!,
      },
      include: {
        category: true,
        user: {
          select: {
            username: true,
          },
        },
      },
    });

    // 返回文章信息和访问链接
    const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || '';
    const articleUrl = article.user?.username 
      ? `${baseUrl}/u/${article.user.username}/${article.slug}`
      : null;

    return created({
      id: article.id,
      title: article.title,
      slug: article.slug,
      published: article.published,
      url: articleUrl,
      createdAt: article.createdAt,
    }, '文章创建成功');
  } catch (error) {
    console.error('Failed to create article from commit:', error);
    return NextResponse.json(
      { code: 500, message: `创建失败: ${error instanceof Error ? error.message : '未知错误'}`, data: null },
      { status: 500 }
    );
  }
}

/**
 * 从标题生成 URL slug
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    // 将中文转为拼音风格的简化（这里简单处理，实际可用 pinyin 库）
    .replace(/[\u4e00-\u9fa5]/g, (char) => {
      // 简单的中文字符转换，保留原字符的 Unicode 编码后几位
      return char.charCodeAt(0).toString(36);
    })
    // 替换空格和特殊字符
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    // 移除首尾连字符
    .replace(/^-+|-+$/g, '')
    // 限制长度
    .slice(0, 80)
    // 如果为空，使用时间戳
    || `post-${Date.now().toString(36)}`;
}

/**
 * 从内容生成摘要
 */
function generateExcerpt(content: string, maxLength = 200): string {
  // 移除 Markdown 语法
  const plainText = content
    .replace(/```[\s\S]*?```/g, '') // 移除代码块
    .replace(/`[^`]+`/g, '') // 移除行内代码
    .replace(/#+\s/g, '') // 移除标题标记
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 链接转纯文本
    .replace(/[*_~]/g, '') // 移除强调标记
    .replace(/>\s/g, '') // 移除引用标记
    .replace(/\n+/g, ' ') // 换行转空格
    .trim();

  if (plainText.length <= maxLength) {
    return plainText;
  }

  return plainText.slice(0, maxLength).trim() + '...';
}

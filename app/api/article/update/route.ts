import { prisma } from '@/lib/prisma';
import {
  success,
  ApiError,
  requireAuth,
  validateRequired,
} from '@/lib/api-response';

/**
 * POST /api/article/update
 * 更新文章（需要登录，只能更新自己的文章）
 */
export async function POST(request: Request) {
  try {
    // 验证登录状态
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const data = await request.json();

    // 验证必填字段
    const validationError = validateRequired(data, ['id']);
    if (validationError) return validationError;

    // 检查文章是否存在且属于当前用户
    const existingArticle = await prisma.post.findFirst({
      where: {
        id: data.id,
        userId: userId!,
      },
    });

    if (!existingArticle) {
      return ApiError.notFound('文章不存在或无权限修改');
    }

    // 如果要更新 slug，检查新 slug 是否已被使用
    if (data.slug && data.slug !== existingArticle.slug) {
      const slugExists = await prisma.post.findFirst({
        where: {
          userId: userId!,
          slug: data.slug,
          NOT: { id: data.id },
        },
      });
      if (slugExists) {
        return ApiError.conflict('您已有一篇相同 slug 的文章');
      }
    }

    const updatedArticle = await prisma.post.update({
      where: { id: data.id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.excerpt !== undefined && { excerpt: data.excerpt }),
        ...(data.coverImage !== undefined && { coverImage: data.coverImage }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.published !== undefined && { published: data.published }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId || null }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
      include: {
        category: true,
      },
    });

    return success(updatedArticle, '文章更新成功');
  } catch (error) {
    console.error('Failed to update article:', error);
    return ApiError.internal();
  }
}

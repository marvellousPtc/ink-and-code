import { prisma } from '@/lib/prisma';
import {
  success,
  ApiError,
  requireAuth,
  validateRequired,
} from '@/lib/api-response';

/**
 * POST /api/article/reorder
 * 批量更新文章排序（需要登录）
 * Body: { items: [{ id: string, sortOrder: number, categoryId?: string }] }
 */
export async function POST(request: Request) {
  try {
    // 验证登录状态
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const data = await request.json();

    // 验证必填字段
    const validationError = validateRequired(data, ['items']);
    if (validationError) return validationError;

    if (!Array.isArray(data.items) || data.items.length === 0) {
      return ApiError.badRequest('items 必须是非空数组');
    }

    // 验证所有文章都属于当前用户
    const articleIds = data.items.map((item: { id: string }) => item.id);
    const existingArticles = await prisma.post.findMany({
      where: {
        id: { in: articleIds },
        userId: userId!,
      },
      select: { id: true },
    });

    if (existingArticles.length !== articleIds.length) {
      return ApiError.forbidden('部分文章不存在或无权限修改');
    }

    // 批量更新
    await prisma.$transaction(
      data.items.map((item: { id: string; sortOrder: number; categoryId?: string }) =>
        prisma.post.update({
          where: { id: item.id },
          data: {
            sortOrder: item.sortOrder,
            ...(item.categoryId !== undefined && { categoryId: item.categoryId || null }),
          },
        })
      )
    );

    return success(null, '排序更新成功');
  } catch (error) {
    console.error('Failed to reorder articles:', error);
    return ApiError.internal();
  }
}

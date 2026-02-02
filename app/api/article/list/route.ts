import { prisma } from '@/lib/prisma';
import { success, ApiError, requireAuth } from '@/lib/api-response';

/**
 * GET /api/article/list
 * 获取当前用户的文章列表（需要登录）
 * Query params:
 *   - published: 'true' | 'false' - 筛选发布状态
 *   - categoryId: string - 筛选分类
 *   - search: string - 搜索标题/摘要
 *   - page: number - 页码 (默认 1)
 *   - limit: number - 每页数量 (默认 20)
 */
export async function GET(request: Request) {
  try {
    // 验证登录状态
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const published = searchParams.get('published');
    const categoryId = searchParams.get('categoryId');
    const search = searchParams.get('search');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    // 构建查询条件 - 只查询当前用户的文章
    const where: Record<string, unknown> = {
      userId: userId,
    };

    if (published !== null) {
      where.published = published === 'true';
    }

    if (categoryId) {
      where.categoryId = categoryId === 'uncategorized' ? null : categoryId;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { excerpt: { contains: search, mode: 'insensitive' } },
      ];
    }

    // 并行查询数据和总数
    const [list, total] = await Promise.all([
      prisma.post.findMany({
        where,
        select: {
          id: true,
          slug: true,
          title: true,
          excerpt: true,
          tags: true,
          coverImage: true,
          published: true,
          categoryId: true,
          sortOrder: true,
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
              icon: true,
              color: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.post.count({ where }),
    ]);

    return success({
      list: list.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Failed to fetch articles:', error);
    return ApiError.internal();
  }
}

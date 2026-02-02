import { prisma } from '@/lib/prisma';
import { success, ApiError } from '@/lib/api-response';
import crypto from 'crypto';

// 开发者 Token（用于未登录时展示默认文章）
const DEVELOPER_TOKEN = process.env.DEVELOPER_TOKEN || 'ink_0174bf5e61a79f72d4a80ff4ce9d7b2dc266ea7eabbb5497';

/**
 * GET /api/article/public-list
 * 获取开发者的公开文章列表（无需登录）
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '100', 10)));
    const skip = (page - 1) * limit;

    // 通过 token 获取开发者用户 ID
    const tokenHash = crypto.createHash('sha256').update(DEVELOPER_TOKEN).digest('hex');
    const apiToken = await prisma.apiToken.findUnique({
      where: { token: tokenHash },
      select: { userId: true },
    });

    if (!apiToken) {
      return ApiError.notFound('开发者账号未配置');
    }

    const userId = apiToken.userId;

    // 构建查询条件
    const where: Record<string, unknown> = {
      userId,
      published: true, // 只获取已发布的文章
    };

    if (categoryId && categoryId !== 'uncategorized') {
      where.categoryId = categoryId;
    } else if (categoryId === 'uncategorized') {
      where.categoryId = null;
    }

    // 获取文章列表
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
    console.error('Failed to fetch public articles:', error);
    return ApiError.internal();
  }
}

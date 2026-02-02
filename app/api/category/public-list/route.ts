import { prisma } from '@/lib/prisma';
import { success, ApiError } from '@/lib/api-response';
import crypto from 'crypto';

// 开发者 Token（用于未登录时展示默认分类）
const DEVELOPER_TOKEN = process.env.DEVELOPER_TOKEN || 'ink_0174bf5e61a79f72d4a80ff4ce9d7b2dc266ea7eabbb5497';

/**
 * GET /api/category/public-list
 * 获取开发者的分类列表（无需登录）
 */
export async function GET() {
  try {
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

    // 获取分类列表
    const categories = await prisma.category.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return success(
      categories.map((cat) => ({
        ...cat,
        createdAt: cat.createdAt.toISOString(),
        updatedAt: cat.updatedAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error('Failed to fetch public categories:', error);
    return ApiError.internal();
  }
}

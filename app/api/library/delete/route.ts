import { prisma } from '@/lib/prisma';
import { requireAuth, success, ApiError } from '@/lib/api-response';
import { isUserDeveloper } from '@/lib/admin-auth';

/**
 * POST /api/library/delete
 * 删除书籍
 * 开发者/管理员可删除任何人的书籍，普通用户只能删除自己的
 * 
 * Body: { id: string }
 */
export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const { id } = await request.json();

    if (!id) {
      return ApiError.badRequest('缺少书籍 ID');
    }

    const [isDeveloper, user] = await Promise.all([
      isUserDeveloper(userId!),
      prisma.user.findUnique({ where: { id: userId! }, select: { isAdmin: true } }),
    ]);
    const hasAdminPrivilege = isDeveloper || user?.isAdmin;

    const book = await prisma.book.findFirst({
      where: hasAdminPrivilege ? { id } : { id, userId: userId! },
    });

    if (!book) {
      return ApiError.notFound('书籍不存在');
    }

    await prisma.book.delete({
      where: { id },
    });

    return success({ id }, '删除成功');
  } catch (error) {
    console.error('Failed to delete book:', error);
    return ApiError.internal('删除失败');
  }
}

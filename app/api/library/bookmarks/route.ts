import { prisma } from '@/lib/prisma';
import { requireAuth, success, ApiError } from '@/lib/api-response';

/**
 * GET /api/library/bookmarks?bookId=xxx
 * 获取书签列表
 */
export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const bookId = searchParams.get('bookId');

    if (!bookId) {
      return ApiError.badRequest('缺少 bookId');
    }

    const bookmarks = await prisma.bookmark.findMany({
      where: { bookId, userId: userId! },
      orderBy: { createdAt: 'desc' },
    });

    return success(bookmarks);
  } catch (error) {
    console.error('Failed to get bookmarks:', error);
    return ApiError.internal('获取书签失败');
  }
}

/**
 * POST /api/library/bookmarks
 * 添加/删除书签
 * 
 * Body:
 *   添加: { action: 'add', bookId, title?, location, note? }
 *   删除: { action: 'delete', id }
 */
export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const data = await request.json();

    if (data.action === 'delete') {
      if (!data.id) return ApiError.badRequest('缺少书签 ID');

      const bookmark = await prisma.bookmark.findFirst({
        where: { id: data.id, userId: userId! },
      });
      if (!bookmark) return ApiError.notFound('书签不存在');

      await prisma.bookmark.delete({ where: { id: data.id } });
      return success({ id: data.id }, '书签已删除');
    }

    // 添加书签
    if (!data.bookId || !data.location) {
      return ApiError.badRequest('缺少必要参数');
    }

    const book = await prisma.book.findUnique({
      where: { id: data.bookId },
      select: { id: true },
    });
    if (!book) return ApiError.notFound('书籍不存在');

    const bookmark = await prisma.bookmark.create({
      data: {
        bookId: data.bookId,
        userId: userId!,
        title: data.title || null,
        location: data.location,
        note: data.note || null,
      },
    });

    return success(bookmark, '书签已添加');
  } catch (error) {
    console.error('Failed to manage bookmark:', error);
    return ApiError.internal('操作失败');
  }
}

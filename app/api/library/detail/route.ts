import { prisma } from '@/lib/prisma';
import { getCurrentUserId, success, ApiError } from '@/lib/api-response';

/**
 * GET /api/library/detail?id=xxx
 * 获取书籍详情（含当前用户的进度、书签、划线笔记）
 * 
 * 公开接口：任何人都可以查看书籍详情。
 * 进度/书签/笔记仅返回当前登录用户的数据。
 */
export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return ApiError.badRequest('缺少书籍 ID');
    }

    // 查询书籍基本信息（不限制 userId，公开可见）
    const book = await prisma.book.findUnique({
      where: { id },
    });

    if (!book) {
      return ApiError.notFound('书籍不存在');
    }

    // 如果用户已登录，查询该用户的进度、书签、划线
    let progress = null;
    let bookmarks: unknown[] = [];
    let highlights: unknown[] = [];

    if (userId) {
      [progress, bookmarks, highlights] = await Promise.all([
        prisma.readingProgress.findUnique({
          where: { userId_bookId: { userId, bookId: id } },
        }),
        prisma.bookmark.findMany({
          where: { bookId: id, userId },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.highlight.findMany({
          where: { bookId: id, userId },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
    }

    return success({
      ...book,
      progress,
      bookmarks,
      highlights,
    });
  } catch (error) {
    console.error('Failed to get book detail:', error);
    return ApiError.internal('获取书籍详情失败');
  }
}

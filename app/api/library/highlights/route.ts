import { prisma } from '@/lib/prisma';
import { requireAuth, success, ApiError } from '@/lib/api-response';

/**
 * GET /api/library/highlights?bookId=xxx
 * GET /api/library/highlights?all=1  (获取所有书籍的划线笔记，含书籍信息)
 * 获取划线笔记列表
 */
export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const bookId = searchParams.get('bookId');
    const all = searchParams.get('all');

    // 获取所有书籍的高亮笔记（笔记管理页面用）
    if (all === '1') {
      const highlights = await prisma.highlight.findMany({
        where: { userId: userId! },
        include: {
          book: {
            select: { id: true, title: true, author: true, cover: true, format: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      return success(highlights);
    }

    if (!bookId) {
      return ApiError.badRequest('缺少 bookId');
    }

    const highlights = await prisma.highlight.findMany({
      where: { bookId, userId: userId! },
      orderBy: { createdAt: 'desc' },
    });

    return success(highlights);
  } catch (error) {
    console.error('Failed to get highlights:', error);
    return ApiError.internal('获取划线笔记失败');
  }
}

/**
 * POST /api/library/highlights
 * 添加/更新/删除划线笔记
 * 
 * Body:
 *   添加: { action: 'add', bookId, text, location, color?, note? }
 *   更新: { action: 'update', id, color?, note? }
 *   删除: { action: 'delete', id }
 */
export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const data = await request.json();

    if (data.action === 'delete') {
      if (!data.id) return ApiError.badRequest('缺少 ID');
      const highlight = await prisma.highlight.findFirst({
        where: { id: data.id, userId: userId! },
      });
      if (!highlight) return ApiError.notFound('划线笔记不存在');
      await prisma.highlight.delete({ where: { id: data.id } });
      return success({ id: data.id }, '已删除');
    }

    if (data.action === 'update') {
      if (!data.id) return ApiError.badRequest('缺少 ID');
      const highlight = await prisma.highlight.findFirst({
        where: { id: data.id, userId: userId! },
      });
      if (!highlight) return ApiError.notFound('划线笔记不存在');

      const updated = await prisma.highlight.update({
        where: { id: data.id },
        data: {
          ...(data.color !== undefined && { color: data.color }),
          ...(data.note !== undefined && { note: data.note }),
        },
      });
      return success(updated, '已更新');
    }

    // 添加划线
    if (!data.bookId || !data.text || !data.location) {
      return ApiError.badRequest('缺少必要参数');
    }

    const book = await prisma.book.findFirst({
      where: { id: data.bookId, userId: userId! },
    });
    if (!book) return ApiError.notFound('书籍不存在');

    const highlight = await prisma.highlight.create({
      data: {
        bookId: data.bookId,
        userId: userId!,
        text: data.text,
        location: data.location,
        color: data.color || 'yellow',
        note: data.note || null,
      },
    });

    return success(highlight, '已添加');
  } catch (error) {
    console.error('Failed to manage highlight:', error);
    return ApiError.internal('操作失败');
  }
}

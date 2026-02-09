import { prisma } from '@/lib/prisma';
import { success, ApiError } from '@/lib/api-response';

/**
 * GET /api/library/chapters/meta?bookId=xxx
 * 
 * 轻量级接口：返回所有章节的元数据（不含 HTML），用于前端估算总页数。
 * 公开接口，不需要登录（与 book detail 一致）。
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bookId = searchParams.get('bookId');

    if (!bookId) {
      return ApiError.badRequest('缺少 bookId');
    }

    // 查询书籍基本信息
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        totalChapters: true,
        totalCharacters: true,
        epubStyles: true,
        parsedAt: true,
      },
    });

    if (!book) {
      return ApiError.notFound('书籍不存在');
    }

    if (!book.parsedAt) {
      return ApiError.badRequest('该书籍尚未解析，请先触发解析');
    }

    // 查询所有章节元数据（不含 html）
    const chapters = await prisma.bookChapter.findMany({
      where: { bookId },
      select: {
        chapterIndex: true,
        href: true,
        charOffset: true,
        charLength: true,
      },
      orderBy: { chapterIndex: 'asc' },
    });

    return success({
      totalChapters: book.totalChapters ?? chapters.length,
      totalCharacters: book.totalCharacters ?? 0,
      styles: book.epubStyles ?? '',
      chapters,
    });
  } catch (error) {
    console.error('Failed to get chapters meta:', error);
    return ApiError.internal('获取章节元数据失败');
  }
}

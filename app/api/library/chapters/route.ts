import { prisma } from '@/lib/prisma';
import { success, ApiError } from '@/lib/api-response';

/**
 * GET /api/library/chapters?bookId=xxx&from=3&to=7
 * 
 * 批量获取章节 HTML 内容，支持范围查询。
 * 前端滑动窗口按需加载，避免一次性加载全部章节。
 * 
 * 参数：
 *   bookId: 书籍 ID（必选）
 *   from:   起始章节索引，含（默认 0）
 *   to:     结束章节索引，含（默认 from + 9）
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bookId = searchParams.get('bookId');
    const fromStr = searchParams.get('from');
    const toStr = searchParams.get('to');

    if (!bookId) {
      return ApiError.badRequest('缺少 bookId');
    }

    const from = fromStr ? parseInt(fromStr, 10) : 0;
    const to = toStr ? parseInt(toStr, 10) : from + 9;

    if (isNaN(from) || isNaN(to) || from < 0 || to < from) {
      return ApiError.badRequest('无效的 from/to 参数');
    }

    // 限制单次最多返回 20 章，防止滥用
    const maxRange = 20;
    const clampedTo = Math.min(to, from + maxRange - 1);

    // 验证书籍存在
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: { id: true, parsedAt: true },
    });

    if (!book) {
      return ApiError.notFound('书籍不存在');
    }

    if (!book.parsedAt) {
      return ApiError.badRequest('该书籍尚未解析，请先触发解析');
    }

    // 查询范围内的章节（含 HTML）
    const chapters = await prisma.bookChapter.findMany({
      where: {
        bookId,
        chapterIndex: {
          gte: from,
          lte: clampedTo,
        },
      },
      select: {
        chapterIndex: true,
        href: true,
        html: true,
        charOffset: true,
        charLength: true,
      },
      orderBy: { chapterIndex: 'asc' },
    });

    return success({ chapters });
  } catch (error) {
    console.error('Failed to get chapters:', error);
    return ApiError.internal('获取章节内容失败');
  }
}

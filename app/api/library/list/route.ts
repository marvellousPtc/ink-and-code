import { prisma } from '@/lib/prisma';
import { getCurrentUserId, success, ApiError } from '@/lib/api-response';

/**
 * GET /api/library/list
 * 获取图书馆书籍列表（公开接口，无需登录）
 * 
 * 如果用户已登录，会附带该用户的阅读进度。
 * 
 * 查询参数：
 *   search: 搜索书名/作者
 *   sort: 排序方式 (recent | added | title) 默认 recent
 *   page: 页码 默认 1
 *   limit: 每页数量 默认 20
 */
export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const sort = searchParams.get('sort') || 'recent';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));

    // 构建查询条件 — 公开所有书籍
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { author: { contains: search, mode: 'insensitive' } },
      ];
    }

    // 构建排序
    let orderBy: Record<string, string>;
    switch (sort) {
      case 'title':
        orderBy = { title: 'asc' };
        break;
      case 'added':
        orderBy = { createdAt: 'desc' };
        break;
      case 'recent':
      default:
        orderBy = { updatedAt: 'desc' };
        break;
    }

    const [books, total] = await Promise.all([
      prisma.book.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        // 不 include progress（因为是一对多，需要按用户筛选）
      }),
      prisma.book.count({ where }),
    ]);

    // 如果用户已登录，批量查询该用户在这些书上的进度
    let progressMap: Record<string, { percentage: number; lastReadAt: Date; totalReadTime: number }> = {};
    if (userId && books.length > 0) {
      const bookIds = books.map(b => b.id);
      const progressList = await prisma.readingProgress.findMany({
        where: {
          userId,
          bookId: { in: bookIds },
        },
        select: {
          bookId: true,
          percentage: true,
          lastReadAt: true,
          totalReadTime: true,
        },
      });
      progressMap = Object.fromEntries(
        progressList.map(p => [p.bookId, {
          percentage: p.percentage,
          lastReadAt: p.lastReadAt,
          totalReadTime: p.totalReadTime,
        }])
      );
    }

    // 组装结果
    const booksWithProgress = books.map(book => ({
      ...book,
      progress: progressMap[book.id] || null,
    }));

    // 如果按最近阅读排序，手动排序
    if (sort === 'recent') {
      booksWithProgress.sort((a, b) => {
        const aTime = a.progress?.lastReadAt?.getTime?.() || a.createdAt.getTime();
        const bTime = b.progress?.lastReadAt?.getTime?.() || b.createdAt.getTime();
        return bTime - aTime;
      });
    }

    return success({
      list: booksWithProgress,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Failed to list books:', error);
    return ApiError.internal('获取书籍列表失败');
  }
}

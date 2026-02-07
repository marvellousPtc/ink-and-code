import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, ApiError } from '@/lib/api-response';

// 大文件代理需要更长的超时时间
export const maxDuration = 120; // 秒

/**
 * GET /api/library/file?id=xxx
 * 代理获取书籍文件内容（避免 CORS 问题）
 */
export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return ApiError.badRequest('缺少书籍 ID');
    }

    const book = await prisma.book.findFirst({
      where: { id, userId: userId! },
      select: {
        originalUrl: true,
        readableUrl: true,
        format: true,
      },
    });

    if (!book) {
      return ApiError.notFound('书籍不存在');
    }

    // 优先使用转换后的 URL
    const fileUrl = book.readableUrl || book.originalUrl;

    // 从 OSS 获取文件（流式传输，不缓冲整个文件到内存）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 分钟超时

    const response = await fetch(fileUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return ApiError.internal(`文件获取失败: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length');

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    };
    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }

    // 直接转发 OSS 的响应流，浏览器可以边下载边处理
    return new NextResponse(response.body, { headers });
  } catch (error) {
    console.error('Failed to proxy file:', error);
    return ApiError.internal('文件获取失败');
  }
}

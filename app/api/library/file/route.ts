import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/api-response';
import { readFile } from 'fs/promises';
import path from 'path';

export const maxDuration = 120; // 秒

// 完整的 Content-Type 映射
const CONTENT_TYPES: Record<string, string> = {
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  html: 'text/html; charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  mobi: 'application/x-mobipocket-ebook',
  azw3: 'application/x-mobipocket-ebook',
};

/**
 * 判断是否为本地文件 URL
 */
function isLocalUrl(url: string): boolean {
  return url.startsWith('/') || !url.startsWith('http://') && !url.startsWith('https://');
}

/**
 * GET /api/library/file?id=xxx
 * 代理获取书籍文件内容（避免 CORS 问题）
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return ApiError.badRequest('缺少书籍 ID');

    const book = await prisma.book.findUnique({
      where: { id },
      select: { originalUrl: true, readableUrl: true, format: true },
    });

    if (!book) return ApiError.notFound('书籍不存在');

    const fileUrl = book.readableUrl || book.originalUrl;

    if (isLocalUrl(fileUrl)) {
      // ========== 本地文件 ==========
      const filePath = path.join(process.cwd(), 'public', fileUrl);
      try {
        const buffer = await readFile(filePath);
        const contentType = CONTENT_TYPES[book.format] || 'application/octet-stream';

        return new NextResponse(buffer, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'private, max-age=3600',
            'Content-Length': String(buffer.length),
          },
        });
      } catch (err) {
        console.error('Failed to read local file:', fileUrl, err);
        return ApiError.internal('文件读取失败');
      }
    } else {
      // ========== OSS 文件 ==========
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      try {
        const response = await fetch(fileUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          return ApiError.internal(`文件获取失败: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || CONTENT_TYPES[book.format] || 'application/octet-stream';
        const contentLength = response.headers.get('content-length');

        const headers: Record<string, string> = {
          'Content-Type': contentType,
          'Cache-Control': 'private, max-age=3600',
        };
        if (contentLength) headers['Content-Length'] = contentLength;

        return new NextResponse(response.body, { headers });
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    }
  } catch (error) {
    console.error('Failed to proxy file:', error);
    return ApiError.internal('文件获取失败');
  }
}

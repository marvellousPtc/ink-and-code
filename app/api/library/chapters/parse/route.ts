import OSS from 'ali-oss';
import { prisma } from '@/lib/prisma';
import { requireAuth, success, ApiError } from '@/lib/api-response';
import { parseEpubContent, type OssConfig } from '@/lib/epub-parser';

function hasDefaultOss() {
  return !!(
    process.env.DEFAULT_OSS_REGION &&
    process.env.DEFAULT_OSS_BUCKET &&
    process.env.DEFAULT_OSS_ACCESS_KEY_ID &&
    process.env.DEFAULT_OSS_ACCESS_KEY_SECRET
  );
}

function getDefaultOssConfig() {
  return {
    region: process.env.DEFAULT_OSS_REGION!,
    bucket: process.env.DEFAULT_OSS_BUCKET!,
    accessKeyId: process.env.DEFAULT_OSS_ACCESS_KEY_ID!,
    accessKeySecret: process.env.DEFAULT_OSS_ACCESS_KEY_SECRET!,
    dir: process.env.DEFAULT_OSS_DIR || 'public',
    domain: process.env.DEFAULT_OSS_DOMAIN,
  };
}

// Route Segment Config - 解析可能耗时较长
export const maxDuration = 120;

/**
 * POST /api/library/chapters/parse
 *
 * 为已上传但未解析的 EPUB 触发服务端解析。
 * 将 EPUB 内容解析为章节并存入 BookChapter 表。
 *
 * Body: { bookId: string }
 */
export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const { bookId } = await request.json();
    if (!bookId) {
      return ApiError.badRequest('缺少 bookId');
    }

    // 查询书籍
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        userId: true,
        format: true,
        originalUrl: true,
        readableUrl: true,
        parsedAt: true,
      },
    });

    if (!book) {
      return ApiError.notFound('书籍不存在');
    }

    // 只有 EPUB 格式需要解析
    const effectiveFormat = book.readableUrl
      ? (book.readableUrl.endsWith('.html') ? 'html' : 'epub')
      : book.format;

    if (effectiveFormat !== 'epub') {
      return ApiError.badRequest('仅 EPUB 格式支持章节解析');
    }

    // 已解析的跳过
    if (book.parsedAt) {
      return success({ message: '该书籍已解析', bookId });
    }

    // 获取 OSS 配置
    const siteConfig = await prisma.siteConfig.findUnique({
      where: { userId: book.userId },
      select: {
        ossRegion: true, ossBucket: true,
        ossAccessKeyId: true, ossAccessKeySecret: true,
        ossDir: true, ossDomain: true,
      },
    });

    const hasUserOss = !!(
      siteConfig?.ossRegion && siteConfig?.ossBucket &&
      siteConfig?.ossAccessKeyId && siteConfig?.ossAccessKeySecret
    );
    const useDefaultOss = !hasUserOss && hasDefaultOss();

    if (!hasUserOss && !useDefaultOss) {
      return ApiError.badRequest('无可用的 OSS 配置');
    }

    const ossConfigRaw = useDefaultOss ? (() => {
      const cfg = getDefaultOssConfig();
      cfg.dir = `${cfg.dir}/${book.userId}`;
      return cfg;
    })() : {
      region: siteConfig!.ossRegion!,
      bucket: siteConfig!.ossBucket!,
      accessKeyId: siteConfig!.ossAccessKeyId!,
      accessKeySecret: siteConfig!.ossAccessKeySecret!,
      dir: siteConfig!.ossDir || 'library',
      domain: siteConfig!.ossDomain || undefined,
    };

    const client = new OSS({
      region: ossConfigRaw.region,
      bucket: ossConfigRaw.bucket,
      accessKeyId: ossConfigRaw.accessKeyId,
      accessKeySecret: ossConfigRaw.accessKeySecret,
    });

    const epubOssConfig: OssConfig = {
      dir: ossConfigRaw.dir,
      domain: ossConfigRaw.domain,
      bucket: ossConfigRaw.bucket,
      region: ossConfigRaw.region,
    };

    // 下载 EPUB 文件
    const fileUrl = book.readableUrl || book.originalUrl;
    // 从 URL 中提取 OSS objectName
    let objectName: string;
    if (ossConfigRaw.domain && fileUrl.startsWith(ossConfigRaw.domain)) {
      objectName = fileUrl.replace(ossConfigRaw.domain.replace(/\/$/, '') + '/', '');
    } else {
      // 从完整 URL 中提取路径部分
      try {
        const url = new URL(fileUrl);
        objectName = url.pathname.slice(1); // 去掉开头的 /
      } catch {
        return ApiError.badRequest('无法解析文件 URL');
      }
    }

    const result = await client.get(objectName);
    const buffer = Buffer.isBuffer(result.content)
      ? result.content
      : Buffer.from(result.content);

    // 解析 EPUB
    const parseResult = await parseEpubContent(buffer, book.id, client, epubOssConfig);

    // 清除旧章节（如果有残留）
    await prisma.bookChapter.deleteMany({ where: { bookId: book.id } });

    // 写入新章节
    await prisma.bookChapter.createMany({
      data: parseResult.chapters.map(ch => ({
        bookId: book.id,
        chapterIndex: ch.index,
        href: ch.href,
        html: ch.html,
        charOffset: ch.charOffset,
        charLength: ch.charLength,
      })),
    });

    // 更新 Book 元数据
    await prisma.book.update({
      where: { id: book.id },
      data: {
        totalChapters: parseResult.chapters.length,
        totalCharacters: parseResult.totalCharacters,
        epubStyles: parseResult.styles,
        parsedAt: new Date(),
      },
    });

    console.log(
      `[EPUB Parse] 解析完成: bookId=${book.id}, ` +
      `${parseResult.chapters.length} 章节, ${parseResult.totalCharacters} 字符`
    );

    return success({
      message: '解析完成',
      bookId: book.id,
      totalChapters: parseResult.chapters.length,
      totalCharacters: parseResult.totalCharacters,
    });
  } catch (error) {
    console.error('Failed to parse EPUB:', error);
    if (error instanceof Error) {
      return ApiError.internal(`EPUB 解析失败: ${error.message}`);
    }
    return ApiError.internal('EPUB 解析失败');
  }
}

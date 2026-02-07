import { NextResponse } from 'next/server';
import OSS from 'ali-oss';
import { prisma } from '@/lib/prisma';
import { requireAuth, ApiError } from '@/lib/api-response';
import { extractEpubCover, extractEpubMetadata } from '@/lib/epub-cover';

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

/**
 * POST /api/library/extract-covers
 * 为已有的 EPUB 书籍补提取封面和元数据
 */
export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    // 查找没有封面的 EPUB 书籍
    const books = await prisma.book.findMany({
      where: {
        userId: userId!,
        format: 'epub',
        cover: null,
      },
      select: {
        id: true,
        title: true,
        author: true,
        originalUrl: true,
      },
    });

    if (books.length === 0) {
      return NextResponse.json({
        code: 200,
        message: '所有 EPUB 书籍已有封面',
        data: { updated: 0 },
      });
    }

    // 获取 OSS 配置
    const siteConfig = await prisma.siteConfig.findUnique({
      where: { userId: userId! },
      select: {
        ossRegion: true, ossBucket: true,
        ossAccessKeyId: true, ossAccessKeySecret: true,
        ossDir: true, ossDomain: true,
      },
    });

    const hasUserOss = !!(siteConfig?.ossRegion && siteConfig?.ossBucket && siteConfig?.ossAccessKeyId && siteConfig?.ossAccessKeySecret);
    const useDefaultOss = !hasUserOss && hasDefaultOss();

    if (!hasUserOss && !useDefaultOss) {
      return ApiError.badRequest('未配置 OSS');
    }

    const ossConfig = useDefaultOss ? (() => {
      const cfg = getDefaultOssConfig();
      cfg.dir = `${cfg.dir}/${userId}`;
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
      region: ossConfig.region,
      bucket: ossConfig.bucket,
      accessKeyId: ossConfig.accessKeyId,
      accessKeySecret: ossConfig.accessKeySecret,
    });

    let updated = 0;

    for (const book of books) {
      try {
        // 从 URL 反推 objectName
        const url = book.originalUrl;
        let objectName: string;

        if (ossConfig.domain && url.startsWith(ossConfig.domain as string)) {
          objectName = url.replace(ossConfig.domain as string, '').replace(/^\//, '');
        } else {
          // 标准 OSS URL: https://bucket.oss-region.aliyuncs.com/path/file.epub
          const urlObj = new URL(url);
          objectName = urlObj.pathname.slice(1); // 去掉开头的 /
        }

        // 下载 EPUB
        const result = await client.get(objectName);
        const buffer = Buffer.isBuffer(result.content) ? result.content : Buffer.from(result.content);

        // 提取元数据
        const metadata = extractEpubMetadata(buffer);

        // 提取封面
        const cover = await extractEpubCover(buffer);
        let coverUrl: string | null = null;

        if (cover) {
          const coverObjectName = objectName.replace(/\.epub$/i, `-cover.${cover.ext}`);
          await client.put(coverObjectName, cover.data, {
            headers: { 'Content-Type': cover.contentType },
          });
          if (ossConfig.domain) {
            const domain = (ossConfig.domain as string).replace(/\/$/, '');
            coverUrl = `${domain}/${coverObjectName}`;
          } else {
            const region = ossConfig.region.replace(/^oss-/, '');
            coverUrl = `https://${ossConfig.bucket}.oss-${region}.aliyuncs.com/${coverObjectName}`;
          }
        }

        // 更新 Book 记录
        const updateData: Record<string, string | null> = {};
        if (coverUrl) updateData.cover = coverUrl;
        if (metadata.title && book.title === book.originalUrl.split('/').pop()?.replace(/\.[^.]+$/, '')) {
          updateData.title = metadata.title;
        }
        if (metadata.author && !book.author) {
          updateData.author = metadata.author;
        }

        if (Object.keys(updateData).length > 0) {
          await prisma.book.update({
            where: { id: book.id },
            data: updateData,
          });
          updated++;
        }

        console.log(`[extract-covers] ${book.title}: cover=${!!coverUrl}, title=${metadata.title}, author=${metadata.author}`);
      } catch (e) {
        console.warn(`[extract-covers] 处理 ${book.title} 失败:`, e);
      }
    }

    return NextResponse.json({
      code: 200,
      message: `成功提取 ${updated} 本书的封面`,
      data: { updated, total: books.length },
    });
  } catch (error) {
    console.error('Failed to extract covers:', error);
    if (error instanceof Error) {
      return ApiError.internal(`提取封面失败: ${error.message}`);
    }
    return ApiError.internal('提取封面失败');
  }
}

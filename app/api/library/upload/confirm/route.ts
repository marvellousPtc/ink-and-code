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
 * POST /api/library/upload/confirm
 * 浏览器直传 OSS 后，确认上传并创建 Book 记录
 * 对 EPUB 格式：下载文件提取封面和元数据
 */
export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const body = await request.json();
    const { objectName, filename, fileUrl, format, fileSize, title, author } = body as {
      objectName: string;
      filename: string;
      fileUrl: string;
      format: string;
      fileSize: number;
      title?: string;
      author?: string;
    };

    // 参数验证
    if (!objectName || !fileUrl || !format || !fileSize) {
      return ApiError.badRequest('缺少必要参数');
    }

    // 验证格式
    const validFormats = ['epub', 'pdf', 'txt', 'md', 'html', 'mobi', 'azw3'];
    if (!validFormats.includes(format)) {
      return ApiError.badRequest(`不支持的直传格式: ${format}，仅支持 ${validFormats.join('、')}`);
    }

    // EPUB：从 OSS 下载文件提取封面和元数据
    let coverUrl: string | null = null;
    let epubTitle: string | undefined;
    let epubAuthor: string | undefined;

    if (format === 'epub') {
      try {
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

        if (hasUserOss || useDefaultOss) {
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

          // 下载 EPUB 文件
          const result = await client.get(objectName);
          const buffer = Buffer.isBuffer(result.content) ? result.content : Buffer.from(result.content);

          // 提取元数据
          const metadata = extractEpubMetadata(buffer);
          epubTitle = metadata.title;
          epubAuthor = metadata.author;

          // 提取封面
          const cover = await extractEpubCover(buffer);
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
        }
      } catch (e) {
        console.warn('EPUB 封面提取失败（不影响上传）:', e);
      }
    }

    // 从文件名提取标题（EPUB 元数据优先）
    const bookTitle = title || epubTitle || filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

    // 创建 Book 记录
    const book = await prisma.book.create({
      data: {
        title: bookTitle,
        author: author || epubAuthor || null,
        cover: coverUrl,
        format,
        originalUrl: fileUrl,
        readableUrl: null,
        fileSize,
        userId: userId!,
      },
    });

    return NextResponse.json({
      code: 200,
      message: '上传成功',
      data: book,
    });
  } catch (error) {
    console.error('Failed to confirm upload:', error);
    if (error instanceof Error) {
      return ApiError.internal(`确认上传失败: ${error.message}`);
    }
    return ApiError.internal('确认上传失败');
  }
}

import { NextResponse } from 'next/server';
import OSS from 'ali-oss';
import { prisma } from '@/lib/prisma';
import { requireAuth, ApiError } from '@/lib/api-response';
import { extractEpubCover, extractEpubMetadata } from '@/lib/epub-cover';
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

    // EPUB：从 OSS 下载文件提取封面、元数据，并解析章节
    let coverUrl: string | null = null;
    let epubTitle: string | undefined;
    let epubAuthor: string | undefined;
    // 保留 buffer/client/ossConfig 供后续章节解析使用
    let epubBuffer: Buffer | null = null;
    let ossClient: OSS | null = null;
    let epubOssConfig: OssConfig | null = null;

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
          const ossConfigRaw = useDefaultOss ? (() => {
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
            region: ossConfigRaw.region,
            bucket: ossConfigRaw.bucket,
            accessKeyId: ossConfigRaw.accessKeyId,
            accessKeySecret: ossConfigRaw.accessKeySecret,
          });

          // 保留供后续章节解析使用
          ossClient = client;
          epubOssConfig = {
            dir: ossConfigRaw.dir,
            domain: ossConfigRaw.domain,
            bucket: ossConfigRaw.bucket,
            region: ossConfigRaw.region,
          };

          // 下载 EPUB 文件
          const result = await client.get(objectName);
          const buffer = Buffer.isBuffer(result.content) ? result.content : Buffer.from(result.content);
          epubBuffer = buffer;

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
            if (ossConfigRaw.domain) {
              const domain = (ossConfigRaw.domain as string).replace(/\/$/, '');
              coverUrl = `${domain}/${coverObjectName}`;
            } else {
              const region = ossConfigRaw.region.replace(/^oss-/, '');
              coverUrl = `https://${ossConfigRaw.bucket}.oss-${region}.aliyuncs.com/${coverObjectName}`;
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

    // EPUB：服务端解析章节并存入数据库
    if (format === 'epub' && epubBuffer && ossClient && epubOssConfig) {
      try {
        const parseResult = await parseEpubContent(epubBuffer, book.id, ossClient, epubOssConfig);
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
        await prisma.book.update({
          where: { id: book.id },
          data: {
            totalChapters: parseResult.chapters.length,
            totalCharacters: parseResult.totalCharacters,
            epubStyles: parseResult.styles,
            parsedAt: new Date(),
          },
        });
        console.log(`[EPUB Confirm] 解析完成: bookId=${book.id}, ${parseResult.chapters.length} 章节, ${parseResult.totalCharacters} 字符`);
      } catch (e) {
        console.error('[EPUB Confirm] 章节解析失败（不影响上传）:', e);
      }
    }

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

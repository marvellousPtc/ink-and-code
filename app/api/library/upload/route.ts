import { NextResponse } from 'next/server';
import OSS from 'ali-oss';
import { prisma } from '@/lib/prisma';
import { requireAuth, ApiError } from '@/lib/api-response';
import { extractEpubCover, extractEpubMetadata } from '@/lib/epub-cover';
import { execFile } from 'child_process';
import { writeFile, readFile, unlink, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

// Route Segment Config - 增加超时和 body 大小限制
export const maxDuration = 120; // 秒，给大文件和格式转换留足时间

// 允许的电子书 MIME 类型映射
const FORMAT_MAP: Record<string, string> = {
  'application/epub+zip': 'epub',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/html': 'html',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/x-mobipocket-ebook': 'mobi',
};

// 通过文件扩展名判断格式（MIME 不总是可靠）
const EXT_FORMAT_MAP: Record<string, string> = {
  epub: 'epub',
  pdf: 'pdf',
  txt: 'txt',
  md: 'md',
  markdown: 'md',
  html: 'html',
  htm: 'html',
  docx: 'docx',
  mobi: 'mobi',
  azw3: 'azw3',
  azw: 'azw3',
};

// 最大文件大小 100MB
const MAX_SIZE = 100 * 1024 * 1024;

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
 * POST /api/library/upload
 * 上传电子书文件到 OSS 并创建 Book 记录
 */
export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    // 获取 OSS 配置
    let siteConfig = await prisma.siteConfig.findUnique({
      where: { userId: userId! },
      select: {
        ossRegion: true,
        ossBucket: true,
        ossAccessKeyId: true,
        ossAccessKeySecret: true,
        ossDir: true,
        ossDomain: true,
      },
    });

    if (!siteConfig) {
      siteConfig = await prisma.siteConfig.create({
        data: { userId: userId! },
        select: {
          ossRegion: true,
          ossBucket: true,
          ossAccessKeyId: true,
          ossAccessKeySecret: true,
          ossDir: true,
          ossDomain: true,
        },
      });
    }

    const hasUserOss = !!(
      siteConfig.ossRegion &&
      siteConfig.ossBucket &&
      siteConfig.ossAccessKeyId &&
      siteConfig.ossAccessKeySecret
    );
    const useDefaultOss = !hasUserOss && hasDefaultOss();

    if (!hasUserOss && !useDefaultOss) {
      return ApiError.badRequest('请先在设置中配置图床（OSS）');
    }

    // 解析 FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const customTitle = formData.get('title') as string | null;
    const customAuthor = formData.get('author') as string | null;

    if (!file) {
      return ApiError.badRequest('请选择要上传的文件');
    }

    if (file.size > MAX_SIZE) {
      return ApiError.badRequest('文件大小不能超过 100MB');
    }

    // 检测文件格式
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const format = EXT_FORMAT_MAP[ext] || FORMAT_MAP[file.type];

    if (!format) {
      return ApiError.badRequest(
        `不支持的文件格式 (.${ext})，支持：EPUB、PDF、TXT、MD、HTML、DOCX、MOBI、AZW3`
      );
    }

    // 构建 OSS 配置
    let ossConfig: {
      region: string;
      bucket: string;
      accessKeyId: string;
      accessKeySecret: string;
      dir: string;
      domain?: string;
    };

    if (useDefaultOss) {
      ossConfig = getDefaultOssConfig();
      ossConfig.dir = `${ossConfig.dir}/${userId}`;
    } else {
      ossConfig = {
        region: siteConfig.ossRegion!,
        bucket: siteConfig.ossBucket!,
        accessKeyId: siteConfig.ossAccessKeyId!,
        accessKeySecret: siteConfig.ossAccessKeySecret!,
        dir: siteConfig.ossDir || 'library',
        domain: siteConfig.ossDomain || undefined,
      };
    }

    // 创建 OSS 客户端（大文件需要更长的超时时间）
    const client = new OSS({
      region: ossConfig.region,
      bucket: ossConfig.bucket,
      accessKeyId: ossConfig.accessKeyId,
      accessKeySecret: ossConfig.accessKeySecret,
      timeout: '300s', // 5 分钟，避免大文件上传超时
    });

    // 生成存储路径
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const fileName = `${timestamp}-${random}.${ext}`;
    const dir = ossConfig.dir.replace(/\/$/, '');
    const objectName = `${dir}/library/${fileName}`;

    // 上传到 OSS
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = file.type || 'application/octet-stream';

    // 分片上传阈值：5MB 以上使用 multipartUpload 并行分片，更快
    const MULTIPART_THRESHOLD = 5 * 1024 * 1024;

    if (file.size > MULTIPART_THRESHOLD) {
      // 大文件：写临时文件 → 分片并行上传（比单次 put 快很多）
      const uploadTmpDir = await mkdtemp(path.join(tmpdir(), 'upload-'));
      const tmpPath = path.join(uploadTmpDir, fileName);
      await writeFile(tmpPath, buffer);
      try {
        await client.multipartUpload(objectName, tmpPath, {
          parallel: 4,
          partSize: 1 * 1024 * 1024, // 1MB per part
          headers: { 'Content-Type': contentType },
        });
      } finally {
        await unlink(tmpPath).catch(() => {});
      }
    } else {
      // 小文件：直接上传
      await client.put(objectName, buffer, {
        headers: { 'Content-Type': contentType },
      });
    }

    // 构建文件 URL
    let fileUrl: string;
    if (ossConfig.domain) {
      const domain = ossConfig.domain.replace(/\/$/, '');
      fileUrl = `${domain}/${objectName}`;
    } else {
      const region = ossConfig.region.replace(/^oss-/, '');
      fileUrl = `https://${ossConfig.bucket}.oss-${region}.aliyuncs.com/${objectName}`;
    }

    // EPUB：提取封面和元数据
    let coverUrl: string | null = null;
    let epubTitle: string | undefined;
    let epubAuthor: string | undefined;

    if (format === 'epub') {
      try {
        // 提取元数据（标题、作者）
        const metadata = extractEpubMetadata(buffer);
        epubTitle = metadata.title;
        epubAuthor = metadata.author;

        // 提取封面图片
        const cover = await extractEpubCover(buffer);
        if (cover) {
          const coverObjectName = objectName.replace(/\.epub$/i, `-cover.${cover.ext}`);
          await client.put(coverObjectName, cover.data, {
            headers: { 'Content-Type': cover.contentType },
          });
          if (ossConfig.domain) {
            const domain = ossConfig.domain.replace(/\/$/, '');
            coverUrl = `${domain}/${coverObjectName}`;
          } else {
            const region = ossConfig.region.replace(/^oss-/, '');
            coverUrl = `https://${ossConfig.bucket}.oss-${region}.aliyuncs.com/${coverObjectName}`;
          }
        }
      } catch (e) {
        console.warn('EPUB 封面/元数据提取失败:', e);
      }
    }

    // 从文件名提取标题（EPUB 元数据优先）
    const title = customTitle || epubTitle || file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

    // DOCX 转 HTML
    let readableUrl: string | null = null;
    if (format === 'docx') {
      try {
        const mammoth = await import('mammoth');
        const docxResult = await mammoth.convertToHtml({ buffer });
        const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body>${docxResult.value}</body></html>`;
        const htmlBuffer = Buffer.from(htmlContent, 'utf-8');
        const htmlObjectName = objectName.replace(/\.docx$/i, '.html');
        const htmlUploadResult = await client.put(htmlObjectName, htmlBuffer, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
        if (ossConfig.domain) {
          const domain = ossConfig.domain.replace(/\/$/, '');
          readableUrl = `${domain}/${htmlObjectName}`;
        } else {
          readableUrl = htmlUploadResult.url;
        }
      } catch (e) {
        console.error('DOCX conversion failed:', e);
        // 转换失败不影响上传，仍然保存原始文件
      }
    }

    // MOBI/AZW3 转 EPUB（使用 Calibre ebook-convert）
    if ((format === 'mobi' || format === 'azw3') && !readableUrl) {
      try {
        // 创建临时目录
        const tmpDir = await mkdtemp(path.join(tmpdir(), 'ebook-'));
        const inputPath = path.join(tmpDir, `input.${ext}`);
        const outputPath = path.join(tmpDir, 'output.epub');

        // 写入临时文件
        await writeFile(inputPath, buffer);

        // 调用 ebook-convert
        await new Promise<void>((resolve, reject) => {
          execFile('ebook-convert', [inputPath, outputPath], { timeout: 120000 }, (error, _stdout, stderr) => {
            if (error) {
              reject(new Error(`ebook-convert failed: ${stderr || error.message}`));
            } else {
              resolve();
            }
          });
        });

        // 读取转换后的 EPUB
        const epubBuffer = await readFile(outputPath);
        const epubObjectName = objectName.replace(/\.(mobi|azw3|azw)$/i, '.epub');
        const epubUploadResult = await client.put(epubObjectName, epubBuffer, {
          headers: { 'Content-Type': 'application/epub+zip' },
        });

        if (ossConfig.domain) {
          const domain = ossConfig.domain.replace(/\/$/, '');
          readableUrl = `${domain}/${epubObjectName}`;
        } else {
          readableUrl = epubUploadResult.url;
        }

        // 清理临时文件
        await unlink(inputPath).catch(() => {});
        await unlink(outputPath).catch(() => {});
      } catch (e) {
        console.error('MOBI/AZW3 conversion failed:', e);
        // 转换失败不影响上传，仍然保存原始文件
      }
    }

    // 创建 Book 记录
    const book = await prisma.book.create({
      data: {
        title,
        author: customAuthor || epubAuthor || null,
        cover: coverUrl,
        format,
        originalUrl: fileUrl,
        readableUrl,
        fileSize: file.size,
        userId: userId!,
      },
    });

    return NextResponse.json({
      code: 200,
      message: '上传成功',
      data: book,
    });
  } catch (error) {
    console.error('Failed to upload book:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('AccessDenied')) {
        return ApiError.forbidden('OSS 访问被拒绝，请检查 AccessKey 配置');
      }
      if (error.message.includes('NoSuchBucket')) {
        return ApiError.badRequest('OSS Bucket 不存在，请检查配置');
      }
      // 返回具体错误信息辅助调试
      return ApiError.internal(`上传失败: ${error.message}`);
    }
    
    return ApiError.internal('上传失败，请重试');
  }
}

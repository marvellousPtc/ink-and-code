import { NextResponse } from 'next/server';
import OSS from 'ali-oss';
import { prisma } from '@/lib/prisma';
import { requireAuth, ApiError } from '@/lib/api-response';
import { extractEpubCover, extractEpubMetadata } from '@/lib/epub-cover';
import { parseEpubContent, type OssConfig } from '@/lib/epub-parser';
import { execFile } from 'child_process';
import { writeFile, readFile, unlink, mkdtemp, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

// ============================================
// 常量定义
// ============================================

export const maxDuration = 120; // 秒

const FORMAT_MAP: Record<string, string> = {
  'application/epub+zip': 'epub',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/html': 'html',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/x-mobipocket-ebook': 'mobi',
};

const EXT_FORMAT_MAP: Record<string, string> = {
  epub: 'epub', pdf: 'pdf', txt: 'txt', md: 'md', markdown: 'md',
  html: 'html', htm: 'html', docx: 'docx', mobi: 'mobi',
  azw3: 'azw3', azw: 'azw3',
};

const MAX_SIZE = 100 * 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  html: 'text/html; charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  mobi: 'application/x-mobipocket-ebook',
  azw3: 'application/x-mobipocket-ebook',
};

// ============================================
// 存储抽象层
// ============================================

type StorageType = 'oss' | 'local';

interface StorageAdapter {
  /** 上传文件，返回公开访问 URL */
  upload(buffer: Buffer, relativePath: string, contentType: string): Promise<string>;
  /** 构建文件访问 URL */
  buildUrl(relativePath: string): string;
}

class LocalStorageAdapter implements StorageAdapter {
  private baseDir: string;

  constructor() {
    this.baseDir = path.join(process.cwd(), 'public');
  }

  async upload(buffer: Buffer, relativePath: string, _contentType: string): Promise<string> {
    const fullPath = path.join(this.baseDir, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);
    return `/${relativePath}`;
  }

  buildUrl(relativePath: string): string {
    return `/${relativePath}`;
  }
}

class OssStorageAdapter implements StorageAdapter {
  private client: OSS;
  private bucket: string;
  private region: string;
  private dir: string;
  private domain?: string;

  constructor(config: {
    region: string;
    bucket: string;
    accessKeyId: string;
    accessKeySecret: string;
    dir: string;
    domain?: string;
  }) {
    this.client = new OSS({
      region: config.region,
      bucket: config.bucket,
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      timeout: '300s',
    });
    this.bucket = config.bucket;
    this.region = config.region;
    this.dir = config.dir;
    this.domain = config.domain;
  }

  async upload(buffer: Buffer, objectName: string, contentType: string): Promise<string> {
    const isLargeFile = buffer.length > 5 * 1024 * 1024;
    
    if (isLargeFile) {
      const tmpDir = await mkdtemp(path.join(tmpdir(), 'upload-'));
      const tmpPath = path.join(tmpDir, path.basename(objectName));
      await writeFile(tmpPath, buffer);
      try {
        await this.client.multipartUpload(objectName, tmpPath, {
          parallel: 4,
          partSize: 1 * 1024 * 1024,
          headers: { 'Content-Type': contentType },
        });
      } finally {
        await unlink(tmpPath).catch(() => {});
      }
    } else {
      await this.client.put(objectName, buffer, {
        headers: { 'Content-Type': contentType },
      });
    }
    
    return this.buildUrl(objectName);
  }

  buildUrl(objectName: string): string {
    if (this.domain) {
      return `${this.domain.replace(/\/$/, '')}/${objectName}`;
    }
    const region = this.region.replace(/^oss-/, '');
    return `https://${this.bucket}.oss-${region}.aliyuncs.com/${objectName}`;
  }
}

// ============================================
// 存储工厂
// ============================================

function createStorageAdapter(
  userId: string,
  siteConfig: {
    ossRegion?: string | null;
    ossBucket?: string | null;
    ossAccessKeyId?: string | null;
    ossAccessKeySecret?: string | null;
    ossDir?: string | null;
    ossDomain?: string | null;
    storageType?: string | null;
  }
): { adapter: StorageAdapter; type: StorageType; dir: string } {
  // 严格按照 storageType 配置，不使用 fallback
  const storageType = siteConfig.storageType === 'oss' ? 'oss' : 'local';

  if (storageType === 'oss') {
    // 使用用户配置的 OSS
    const hasUserOss = !!(
      siteConfig.ossRegion &&
      siteConfig.ossBucket &&
      siteConfig.ossAccessKeyId &&
      siteConfig.ossAccessKeySecret
    );

    if (hasUserOss) {
      const adapter = new OssStorageAdapter({
        region: siteConfig.ossRegion!,
        bucket: siteConfig.ossBucket!,
        accessKeyId: siteConfig.ossAccessKeyId!,
        accessKeySecret: siteConfig.ossAccessKeySecret!,
        dir: `${siteConfig.ossDir || 'library'}/${userId}`,
        domain: siteConfig.ossDomain || undefined,
      });
      return { adapter, type: 'oss', dir: siteConfig.ossDir || 'library' };
    }

    // 用户选择 OSS 但未配置，返回错误而不是 fallback
    throw new Error('请先配置 OSS 存储');
  }

  // 默认使用本地存储
  const adapter = new LocalStorageAdapter();
  return { adapter, type: 'local', dir: 'uploads' };
}

// ============================================
// 文件转换逻辑（统一）
// ============================================

interface ConversionResult {
  buffer: Buffer;
  ext: string;
  contentType: string;
  originalFileName?: string;
}

async function convertFile(
  buffer: Buffer,
  format: string,
  customTitle?: string | null
): Promise<ConversionResult | null> {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);

  // DOCX -> HTML
  if (format === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml({ buffer });
    const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${customTitle || 'Document'}</title></head>
<body>${result.value}</body></html>`;
    return {
      buffer: Buffer.from(htmlContent, 'utf-8'),
      ext: 'html',
      contentType: CONTENT_TYPES.html,
      originalFileName: `${timestamp}-${random}.html`,
    };
  }

  // MOBI/AZW3 -> EPUB
  if (format === 'mobi' || format === 'azw3') {
    const ext = format;
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'ebook-'));
    const inputPath = path.join(tmpDir, `input.${ext}`);
    const outputPath = path.join(tmpDir, 'output.epub');

    await writeFile(inputPath, buffer);

    await new Promise<void>((resolve, reject) => {
      execFile('ebook-convert', [inputPath, outputPath], { timeout: 120000 }, (error, _stdout, stderr) => {
        if (error) reject(new Error(`ebook-convert: ${stderr || error.message}`));
        else resolve();
      });
    });

    const epubBuffer = await readFile(outputPath);
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});

    return {
      buffer: epubBuffer,
      ext: 'epub',
      contentType: CONTENT_TYPES.epub,
      originalFileName: `${timestamp}-${random}.epub`,
    };
  }

  return null;
}

// ============================================
// 主上传逻辑
// ============================================

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    // 获取站点配置
    let siteConfig = await prisma.siteConfig.findUnique({
      where: { userId: userId! },
      select: {
        ossRegion: true, ossBucket: true, ossAccessKeyId: true, ossAccessKeySecret: true,
        ossDir: true, ossDomain: true, storageType: true,
      },
    });

    if (!siteConfig) {
      siteConfig = await prisma.siteConfig.create({
        data: { userId: userId!, storageType: 'local' },
        select: {
          ossRegion: true, ossBucket: true, ossAccessKeyId: true, ossAccessKeySecret: true,
          ossDir: true, ossDomain: true, storageType: true,
        },
      });
    }

    // 创建存储适配器
    let adapter: StorageAdapter;
    let storageType: StorageType;
    let storageDir: string;

    try {
      ({ adapter, type: storageType, dir: storageDir } = createStorageAdapter(userId!, siteConfig));
    } catch (err) {
      console.error('Failed to create storage adapter:', err);
      return ApiError.badRequest(err instanceof Error ? err.message : '存储配置错误');
    }

    // 解析表单数据
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const customTitle = formData.get('title') as string | null;
    const customAuthor = formData.get('author') as string | null;

    if (!file) return ApiError.badRequest('请选择要上传的文件');
    if (file.size > MAX_SIZE) return ApiError.badRequest('文件大小不能超过 100MB');

    // 检测格式
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const format = EXT_FORMAT_MAP[ext] || FORMAT_MAP[file.type];
    if (!format) {
      return ApiError.badRequest(`不支持的文件格式 (.${ext})，支持：EPUB、PDF、TXT、MD、HTML、DOCX、MOBI、AZW3`);
    }

    // 生成文件名并读取文件
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const fileName = `${timestamp}-${random}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = file.type || CONTENT_TYPES[format] || 'application/octet-stream';

    let fileUrl: string;
    let coverUrl: string | null = null;
    let readableUrl: string | null = null;

    // 上传主文件
    const relativePath = `${storageDir}/${userId}/${fileName}`;
    fileUrl = await adapter.upload(buffer, relativePath, contentType);

    // EPUB：提取封面和元数据
    if (format === 'epub') {
      try {
        const metadata = extractEpubMetadata(buffer);
        const cover = await extractEpubCover(buffer);
        if (cover) {
          const coverFileName = `${timestamp}-${random}-cover.${cover.ext}`;
          const coverRelativePath = `${storageDir}/${userId}/${coverFileName}`;
          coverUrl = await adapter.upload(cover.data, coverRelativePath, cover.contentType);
        }
      } catch (e) {
        console.warn('EPUB 封面/元数据提取失败:', e);
      }
    }

    // 文件转换（DOCX->HTML, MOBI->EPUB）
    const converted = await convertFile(buffer, format, customTitle);
    if (converted) {
      const convertedFileName = converted.originalFileName || `${timestamp}-${random}.${converted.ext}`;
      const convertedRelativePath = `${storageDir}/${userId}/${convertedFileName}`;
      readableUrl = await adapter.upload(converted.buffer, convertedRelativePath, converted.contentType);
    }

    // 创建书籍记录
    const book = await prisma.book.create({
      data: {
        title: customTitle || file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
        author: customAuthor || null,
        cover: coverUrl,
        format,
        originalUrl: fileUrl,
        readableUrl,
        fileSize: file.size,
        userId: userId!,
      },
    });

    // EPUB：服务端解析章节
    if (format === 'epub') {
      try {
        const ossConfig: OssConfig = {
          dir: storageDir,
          domain: storageType === 'local' ? undefined : (process.env.DEFAULT_OSS_DOMAIN || siteConfig.ossDomain || ''),
          bucket: storageType === 'local' ? '' : (process.env.DEFAULT_OSS_BUCKET || siteConfig.ossBucket || ''),
          region: storageType === 'local' ? '' : (process.env.DEFAULT_OSS_REGION || siteConfig.ossRegion || ''),
        };

        const localOptions: LocalStorageOptions | undefined = storageType === 'local'
          ? { uploadToLocal: adapter.upload.bind(adapter), userId: userId! }
          : undefined;

        const result = await parseEpubContent(buffer, book.id, null, ossConfig, localOptions);

        await prisma.bookChapter.createMany({
          data: result.chapters.map(ch => ({
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
            totalChapters: result.chapters.length,
            totalCharacters: result.totalCharacters,
            epubStyles: result.styles,
            parsedAt: new Date(),
          },
        });

        console.log(`[EPUB Upload] [${storageType === 'local' ? '本地存储' : 'OSS'}] 解析完成: ${result.chapters.length} 章节`);
      } catch (e) {
        console.error('[EPUB Upload] 章节解析失败（不影响上传）:', e);
      }
    }

    return NextResponse.json({
      code: 200,
      message: `上传成功（${storageType === 'local' ? '本地存储' : 'OSS'}）`,
      data: book,
    });

  } catch (error) {
    console.error('Failed to upload book:', error);
    if (error instanceof Error) {
      if (error.message.includes('AccessDenied')) return ApiError.forbidden('OSS 访问被拒绝');
      if (error.message.includes('NoSuchBucket')) return ApiError.badRequest('OSS Bucket 不存在');
      return ApiError.internal(`上传失败: ${error.message}`);
    }
    return ApiError.internal('上传失败，请重试');
  }
}

import { NextResponse } from 'next/server';
import OSS from 'ali-oss';
import { prisma } from '@/lib/prisma';
import { requireAuth, ApiError } from '@/lib/api-response';

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

// 通过文件扩展名判断格式
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

const MAX_SIZE = 100 * 1024 * 1024; // 100MB

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
 * POST /api/library/upload/presign
 * 生成 OSS 签名上传 URL，浏览器直传 OSS
 */
export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const body = await request.json();
    const { filename, contentType, fileSize } = body as {
      filename: string;
      contentType: string;
      fileSize: number;
    };

    if (!filename) {
      return ApiError.badRequest('缺少文件名');
    }

    if (fileSize > MAX_SIZE) {
      return ApiError.badRequest('文件大小不能超过 100MB');
    }

    // 检测文件格式
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const format = EXT_FORMAT_MAP[ext] || FORMAT_MAP[contentType];

    if (!format) {
      return ApiError.badRequest(
        `不支持的文件格式 (.${ext})，支持：EPUB、PDF、TXT、MD、HTML、DOCX、MOBI、AZW3`
      );
    }

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

    // 创建 OSS 客户端（必须 secure:true，否则生成 http:// 签名 URL，浏览器 HTTPS 页面会拦截）
    const client = new OSS({
      region: ossConfig.region,
      bucket: ossConfig.bucket,
      accessKeyId: ossConfig.accessKeyId,
      accessKeySecret: ossConfig.accessKeySecret,
      secure: true,
    });

    // 生成存储路径
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const fileName = `${timestamp}-${random}.${ext}`;
    const dir = ossConfig.dir.replace(/\/$/, '');
    const objectName = `${dir}/library/${fileName}`;

    // 生成签名上传 URL（有效期 1 小时）
    const signedUrl = client.signatureUrl(objectName, {
      method: 'PUT',
      'Content-Type': contentType || 'application/octet-stream',
      expires: 3600,
    });

    // 构建最终文件 URL
    let fileUrl: string;
    if (ossConfig.domain) {
      const domain = ossConfig.domain.replace(/\/$/, '');
      fileUrl = `${domain}/${objectName}`;
    } else {
      // 根据 region 和 bucket 构建标准 URL
      const region = ossConfig.region.replace(/^oss-/, '');
      fileUrl = `https://${ossConfig.bucket}.oss-${region}.aliyuncs.com/${objectName}`;
    }

    return NextResponse.json({
      code: 200,
      data: {
        signedUrl,
        objectName,
        fileUrl,
        format,
        filename: fileName,
        contentType: contentType || 'application/octet-stream',
      },
    });
  } catch (error) {
    console.error('Failed to generate presign URL:', error);
    if (error instanceof Error) {
      return ApiError.internal(`签名生成失败: ${error.message}`);
    }
    return ApiError.internal('签名生成失败');
  }
}

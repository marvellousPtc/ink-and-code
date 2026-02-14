
import { NextResponse } from 'next/server';
import OSS from 'ali-oss';
import { prisma } from '@/lib/prisma';
import { requireAuth, ApiError } from '@/lib/api-response';
import { uploadToLocal, validateLocalStoragePath } from '@/lib/storage/local';

// 允许的图片类型
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
// 最大文件大小 10MB
const MAX_SIZE = 10 * 1024 * 1024;

// 默认图床限制：50MB 或 100 张图片
const DEFAULT_OSS_MAX_BYTES = 50 * 1024 * 1024; // 50MB
const DEFAULT_OSS_MAX_COUNT = 100; // 100 张

// 检查是否配置了默认图床
function hasDefaultOss() {
  return !!(
    process.env.DEFAULT_OSS_REGION &&
    process.env.DEFAULT_OSS_BUCKET &&
    process.env.DEFAULT_OSS_ACCESS_KEY_ID &&
    process.env.DEFAULT_OSS_ACCESS_KEY_SECRET
  );
}

// 获取默认 OSS 配置
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
 * POST /api/upload/image
 * 上传图片到阿里云 OSS
 */
export async function POST(request: Request) {
  try {
    // 验证登录
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    // 获取或创建用户的 SiteConfig
    let siteConfig = await prisma.siteConfig.findUnique({
      where: { userId: userId! },
      select: {
        ossRegion: true,
        ossBucket: true,
        ossAccessKeyId: true,
        ossAccessKeySecret: true,
        ossDir: true,
        ossDomain: true,
        defaultOssUsedBytes: true,
        defaultOssUsedCount: true,
        storageType: true,
        localStoragePath: true,
      },
    });

    // 如果没有 siteConfig，创建一个
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
          defaultOssUsedBytes: true,
          defaultOssUsedCount: true,
          storageType: true,
          localStoragePath: true,
        },
      });
    }

    // 检查是否使用本地存储
    const useLocalStorage = siteConfig.storageType === 'local';

    // 如果使用本地存储，验证路径配置
    if (useLocalStorage) {
      const pathValidation = validateLocalStoragePath(siteConfig.localStoragePath || '');
      if (!pathValidation.valid) {
        return NextResponse.json({
          code: 400,
          message: pathValidation.message || '请先配置本地存储路径',
          data: null,
        }, { status: 400 });
      }

      // 解析 multipart/form-data
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({
          code: 400,
          message: '请选择要上传的图片',
          data: null,
        }, { status: 400 });
      }

      // 验证文件类型
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json({
          code: 400,
          message: '不支持的图片格式，请上传 JPG、PNG、GIF、WebP 或 SVG 格式',
          data: null,
        }, { status: 400 });
      }

      // 验证文件大小
      if (file.size > MAX_SIZE) {
        return NextResponse.json({
          code: 400,
          message: '图片大小不能超过 10MB',
          data: null,
        }, { status: 400 });
      }

      // 上传到本地存储
      const { url, relativePath } = await uploadToLocal(
        file,
        userId!,
        siteConfig.localStoragePath || undefined
      );

      return NextResponse.json({
        code: 200,
        message: '上传成功',
        data: {
          url,
          storageType: 'local',
          relativePath,
        },
      });
    }

    // 以下是 OSS 上传逻辑
    // 判断使用用户自己的 OSS 还是默认 OSS
    const hasUserOss = !!(
      siteConfig.ossRegion &&
      siteConfig.ossBucket &&
      siteConfig.ossAccessKeyId &&
      siteConfig.ossAccessKeySecret
    );

    const useDefaultOss = !hasUserOss && hasDefaultOss();

    // 如果既没有用户 OSS 也没有默认 OSS
    if (!hasUserOss && !useDefaultOss) {
      return NextResponse.json({
        code: 400,
        message: '请先在设置中配置图床',
        data: null,
      }, { status: 400 });
    }

    // 如果使用默认 OSS，检查用量限制
    if (useDefaultOss) {
      const usedBytes = Number(siteConfig.defaultOssUsedBytes);
      const usedCount = siteConfig.defaultOssUsedCount;

      if (usedBytes >= DEFAULT_OSS_MAX_BYTES || usedCount >= DEFAULT_OSS_MAX_COUNT) {
        return NextResponse.json({
          code: 403,
          message: `默认图床已达上限（${DEFAULT_OSS_MAX_COUNT} 张或 ${DEFAULT_OSS_MAX_BYTES / 1024 / 1024}MB），请在设置中配置您自己的图床`,
          data: null,
        }, { status: 403 });
      }
    }

    // 解析 multipart/form-data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({
        code: 400,
        message: '请选择要上传的图片',
        data: null,
      }, { status: 400 });
    }

    // 验证文件类型
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({
        code: 400,
        message: '不支持的图片格式，请上传 JPG、PNG、GIF、WebP 或 SVG 格式',
        data: null,
      }, { status: 400 });
    }

    // 验证文件大小
    if (file.size > MAX_SIZE) {
      return NextResponse.json({
        code: 400,
        message: '图片大小不能超过 10MB',
        data: null,
      }, { status: 400 });
    }

    // 根据使用的 OSS 创建客户端和配置
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
      // 默认图床按用户 ID 分目录
      ossConfig.dir = `${ossConfig.dir}/${userId}`;
    } else {
      ossConfig = {
        region: siteConfig.ossRegion!,
        bucket: siteConfig.ossBucket!,
        accessKeyId: siteConfig.ossAccessKeyId!,
        accessKeySecret: siteConfig.ossAccessKeySecret!,
        dir: siteConfig.ossDir || 'images',
        domain: siteConfig.ossDomain || undefined,
      };
    }

    // 创建 OSS 客户端
    const client = new OSS({
      region: ossConfig.region,
      bucket: ossConfig.bucket,
      accessKeyId: ossConfig.accessKeyId,
      accessKeySecret: ossConfig.accessKeySecret,
    });

    // 生成文件名
    const ext = file.name.split('.').pop() || 'png';
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const fileName = `${timestamp}-${random}.${ext}`;
    
    // 构建存储路径
    const dir = ossConfig.dir.replace(/\/$/, '');
    const objectName = `${dir}/${fileName}`;

    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 上传到 OSS
    const result = await client.put(objectName, buffer, {
      headers: {
        'Content-Type': file.type,
      },
    });

    // 如果使用默认 OSS，更新用量统计
    if (useDefaultOss) {
      await prisma.siteConfig.update({
        where: { userId: userId! },
        data: {
          defaultOssUsedBytes: { increment: file.size },
          defaultOssUsedCount: { increment: 1 },
        },
      });
    }

    // 构建返回的 URL
    let url: string;
    if (ossConfig.domain) {
      // 使用自定义域名
      const domain = ossConfig.domain.replace(/\/$/, '');
      url = `${domain}/${objectName}`;
    } else {
      // 使用默认 OSS 域名
      url = result.url;
    }

    return NextResponse.json({
      code: 200,
      message: '上传成功',
      data: { 
        url,
        usingDefault: useDefaultOss,
      },
    });

  } catch (error) {
    console.error('Failed to upload image:', error);
    
    // OSS 错误处理
    if (error instanceof Error) {
      if (error.message.includes('AccessDenied')) {
        return NextResponse.json({
          code: 403,
          message: 'OSS 访问被拒绝，请检查 AccessKey 配置',
          data: null,
        }, { status: 403 });
      }
      if (error.message.includes('NoSuchBucket')) {
        return NextResponse.json({
          code: 400,
          message: 'Bucket 不存在，请检查配置',
          data: null,
        }, { status: 400 });
      }
    }

    return ApiError.internal('上传失败，请重试');
  }
}

/**
 * GET /api/upload/image
 * 测试存储连接（OSS 或本地存储）
 */
export async function GET() {
  try {
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const siteConfig = await prisma.siteConfig.findUnique({
      where: { userId: userId! },
      select: {
        ossRegion: true,
        ossBucket: true,
        ossAccessKeyId: true,
        ossAccessKeySecret: true,
        storageType: true,
        localStoragePath: true,
      },
    });

    // 如果没有配置
    if (!siteConfig) {
      return NextResponse.json({
        code: 400,
        message: '请先配置存储方式',
        data: { connected: false },
      }, { status: 400 });
    }

    // 如果使用本地存储
    if (siteConfig.storageType === 'local') {
      const pathValidation = validateLocalStoragePath(siteConfig.localStoragePath || '');
      if (!pathValidation.valid) {
        return NextResponse.json({
          code: 400,
          message: pathValidation.message || '本地存储路径配置无效',
          data: { connected: false },
        }, { status: 400 });
      }
      return NextResponse.json({
        code: 200,
        message: '本地存储配置有效',
        data: { connected: true, storageType: 'local' },
      });
    }

    // 测试 OSS 连接
    if (!siteConfig?.ossRegion || !siteConfig?.ossBucket || 
        !siteConfig?.ossAccessKeyId || !siteConfig?.ossAccessKeySecret) {
      return NextResponse.json({
        code: 400,
        message: '请先配置 OSS 信息',
        data: { connected: false },
      }, { status: 400 });
    }

    // 尝试连接 OSS
    const client = new OSS({
      region: siteConfig.ossRegion,
      bucket: siteConfig.ossBucket,
      accessKeyId: siteConfig.ossAccessKeyId,
      accessKeySecret: siteConfig.ossAccessKeySecret,
    });

    // 获取 Bucket 信息来测试连接
    await client.list({ 'max-keys': 1 }, {});

    return NextResponse.json({
      code: 200,
      message: 'OSS 连接成功',
      data: { connected: true, storageType: 'oss' },
    });

  } catch (error) {
    console.error('Storage connection test failed:', error);
    
    let message = '存储连接失败';
    if (error instanceof Error) {
      if (error.message.includes('AccessDenied')) {
        message = 'AccessKey 无权限或已失效';
      } else if (error.message.includes('NoSuchBucket')) {
        message = 'Bucket 不存在';
      } else if (error.message.includes('InvalidAccessKeyId')) {
        message = 'AccessKey ID 无效';
      } else if (error.message.includes('SignatureDoesNotMatch')) {
        message = 'AccessKey Secret 错误';
      }
    }

    return NextResponse.json({
      code: 400,
      message,
      data: { connected: false },
    }, { status: 400 });
  }
}

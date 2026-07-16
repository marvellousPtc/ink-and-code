import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, ApiError } from '@/lib/api-response';
import { uploadToLocal, validateLocalStoragePath } from '@/lib/storage/local';

/**
 * POST /api/upload/image/local
 * 上传图片到本地存储
 */
export async function POST(request: Request) {
  try {
    // 验证登录
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    // 获取用户的本地存储配置
    let siteConfig = await prisma.siteConfig.findUnique({
      where: { userId: userId! },
      select: {
        storageType: true,
        localStoragePath: true,
      },
    });

    // 如果没有 siteConfig，创建一个
    if (!siteConfig) {
      siteConfig = await prisma.siteConfig.create({
        data: { userId: userId! },
        select: {
          storageType: true,
          localStoragePath: true,
        },
      });
    }

    // 必须配置为本地存储模式才能使用此端点
    if (siteConfig.storageType !== 'local') {
      return NextResponse.json({
        code: 400,
        message: '请先在设置中切换到本地存储模式',
        data: null,
      }, { status: 400 });
    }

    // 检查是否配置了本地存储路径
    if (!siteConfig.localStoragePath) {
      return NextResponse.json({
        code: 400,
        message: '请先配置本地存储路径',
        data: null,
      }, { status: 400 });
    }

    // 验证路径配置
    const pathValidation = validateLocalStoragePath(siteConfig.localStoragePath);
    if (!pathValidation.valid) {
      return NextResponse.json({
        code: 400,
        message: pathValidation.message,
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

  } catch (error) {
    console.error('Failed to upload image to local:', error);
    
    if (error instanceof Error) {
      return NextResponse.json({
        code: 400,
        message: error.message,
        data: null,
      }, { status: 400 });
    }

    return ApiError.internal('上传失败，请重试');
  }
}

/**
 * GET /api/upload/image/local
 * 测试本地存储连接
 */
export async function GET() {
  try {
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const siteConfig = await prisma.siteConfig.findUnique({
      where: { userId: userId! },
      select: {
        storageType: true,
        localStoragePath: true,
      },
    });

    if (!siteConfig?.localStoragePath && siteConfig?.storageType !== 'local') {
      return NextResponse.json({
        code: 400,
        message: '请先配置本地存储',
        data: { connected: false },
      }, { status: 400 });
    }

    // 验证路径配置
    const pathValidation = validateLocalStoragePath(siteConfig.localStoragePath || '');
    if (!pathValidation.valid) {
      return NextResponse.json({
        code: 400,
        message: pathValidation.message,
        data: { connected: false },
      }, { status: 400 });
    }

    return NextResponse.json({
      code: 200,
      message: '本地存储配置有效',
      data: { 
        connected: true,
        storagePath: siteConfig.localStoragePath,
      },
    });

  } catch (error) {
    console.error('Local storage connection test failed:', error);
    
    return NextResponse.json({
      code: 400,
      message: '本地存储连接失败',
      data: { connected: false },
    }, { status: 400 });
  }
}

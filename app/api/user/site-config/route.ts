import { prisma } from '@/lib/prisma';
import { success, ApiError, requireAuth } from '@/lib/api-response';
import { validateApiKey } from '@/lib/api-response';

/**
 * 检查是否为管理员
 */
async function requireAdmin(): Promise<{ isAdmin: boolean; error: ReturnType<typeof ApiError.forbidden> | null }> {
  // 方法1：验证 ADMIN_API_KEY
  const keyError = validateApiKey(new Request('http://localhost'));
  if (!keyError) {
    return { isAdmin: true, error: null };
  }

  // 方法2：检查用户是否为管理员
  const { userId, error: authError } = await requireAuth();
  if (authError || !userId) {
    return { isAdmin: false, error: ApiError.forbidden('需要管理员权限') };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    return { isAdmin: false, error: ApiError.forbidden('需要管理员权限') };
  }

  return { isAdmin: true, error: null };
}

/**
 * GET /api/user/site-config
 * 获取当前用户的站点配置
 */
export async function GET() {
  try {
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const siteConfig = await prisma.siteConfig.findUnique({
      where: { userId: userId! },
    });

    // 如果没有配置，返回默认值
    // 注意：不返回 ossAccessKeySecret 明文，BigInt 转为 Number
    const config = siteConfig ? {
      ...siteConfig,
      ossAccessKeySecret: siteConfig.ossAccessKeySecret ? '******' : null,
      defaultOssUsedBytes: Number(siteConfig.defaultOssUsedBytes),
    } : {
      siteName: null,
      siteTagline: null,
      primaryColor: null,
      githubUrl: null,
      twitterUrl: null,
      linkedinUrl: null,
      websiteUrl: null,
      ossRegion: null,
      ossBucket: null,
      ossAccessKeyId: null,
      ossAccessKeySecret: null,
      ossDir: null,
      ossDomain: null,
      storageType: null,
      localStoragePath: null,
      defaultOssUsedBytes: 0,
      defaultOssUsedCount: 0,
    };
    
    return success(config);
  } catch (error) {
    console.error('Failed to fetch site config:', error);
    return ApiError.internal();
  }
}

/**
 * POST /api/user/site-config
 * 更新当前用户的站点配置
 * 注意：storageType 字段只有管理员可以修改
 */
export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const data = await request.json();

    // 检查是否尝试修改 storageType
    const tryingToChangeStorageType = data.storageType !== undefined;

    // 验证存储类型修改权限
    if (tryingToChangeStorageType) {
      const { isAdmin, error: adminError } = await requireAdmin();
      if (!isAdmin || adminError) {
        return ApiError.forbidden('只有管理员可以修改存储类型配置');
      }
    }

    // 构建更新数据
    const updateData: Record<string, string | null> = {};
    const createData: Record<string, string | null> = {
      siteName: data.siteName || null,
      siteTagline: data.siteTagline || null,
      primaryColor: data.primaryColor || null,
      githubUrl: data.githubUrl || null,
      twitterUrl: data.twitterUrl || null,
      linkedinUrl: data.linkedinUrl || null,
      websiteUrl: data.websiteUrl || null,
      ossRegion: data.ossRegion || null,
      ossBucket: data.ossBucket || null,
      ossAccessKeyId: data.ossAccessKeyId || null,
      ossAccessKeySecret: data.ossAccessKeySecret || null,
      ossDir: data.ossDir || null,
      ossDomain: data.ossDomain || null,
      storageType: data.storageType || null,
      localStoragePath: data.localStoragePath || null,
    };

    // 普通用户可更新的字段（不包含 storageType）
    const userUpdatableFields = [
      'siteName', 'siteTagline', 'primaryColor',
      'githubUrl', 'twitterUrl', 'linkedinUrl', 'websiteUrl',
      'ossRegion', 'ossBucket', 'ossAccessKeyId', 'ossDir', 'ossDomain',
      'localStoragePath'
    ];

    // 只更新提供的字段
    for (const field of userUpdatableFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field] || null;
      }
    }

    // storageType 只能由管理员更新
    if (tryingToChangeStorageType) {
      const validStorageTypes = ['local', 'oss'];
      if (!validStorageTypes.includes(data.storageType)) {
        return ApiError.badRequest('无效的存储类型，支持：local, oss');
      }
      updateData.storageType = data.storageType;
    }

    // ossAccessKeySecret 特殊处理：如果是 '******' 则不更新
    if (data.ossAccessKeySecret !== undefined && data.ossAccessKeySecret !== '******') {
      updateData.ossAccessKeySecret = data.ossAccessKeySecret || null;
    }

    const siteConfig = await prisma.siteConfig.upsert({
      where: { userId: userId! },
      create: {
        userId: userId!,
        ...createData,
      },
      update: updateData,
    });

    // 返回时隐藏 secret，并将 BigInt 转为 Number
    return success({
      ...siteConfig,
      ossAccessKeySecret: siteConfig.ossAccessKeySecret ? '******' : null,
      defaultOssUsedBytes: Number(siteConfig.defaultOssUsedBytes),
    }, '站点配置更新成功');
  } catch (error) {
    console.error('Failed to update site config:', error);
    return ApiError.internal();
  }
}

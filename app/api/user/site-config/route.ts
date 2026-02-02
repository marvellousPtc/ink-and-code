import { prisma } from '@/lib/prisma';
import { success, ApiError, requireAuth } from '@/lib/api-response';

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
    // 注意：不返回 ossAccessKeySecret 明文
    const config = siteConfig ? {
      ...siteConfig,
      ossAccessKeySecret: siteConfig.ossAccessKeySecret ? '******' : null,
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
 */
export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const data = await request.json();

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
    };

    // 只更新提供的字段
    const fields = [
      'siteName', 'siteTagline', 'primaryColor',
      'githubUrl', 'twitterUrl', 'linkedinUrl', 'websiteUrl',
      'ossRegion', 'ossBucket', 'ossAccessKeyId', 'ossDir', 'ossDomain'
    ];
    
    for (const field of fields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field] || null;
      }
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

    // 返回时隐藏 secret
    return success({
      ...siteConfig,
      ossAccessKeySecret: siteConfig.ossAccessKeySecret ? '******' : null,
    }, '站点配置更新成功');
  } catch (error) {
    console.error('Failed to update site config:', error);
    return ApiError.internal();
  }
}

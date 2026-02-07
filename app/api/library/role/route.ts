import { auth } from '@/lib/auth';
import { isUserDeveloper } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import crypto from 'crypto';

/**
 * GET /api/library/role
 * 获取当前用户在图书馆中的角色
 * 
 * 身份识别优先级：
 *   1. Session 认证（NextAuth cookie）
 *   2. Bearer Token 认证（Authorization: Bearer ink_xxx）
 *   3. DEVELOPER_TOKEN 直接匹配（Authorization: Bearer <DEVELOPER_TOKEN>）
 * 
 * 返回：
 *   role: 'developer' | 'admin' | 'user' | 'guest'
 *   canUpload: boolean
 *   canDelete: boolean
 */
export async function GET() {
  try {
    let userId: string | null = null;
    let isTokenDeveloper = false;

    // ---- 1. 尝试 Session 认证 ----
    try {
      const session = await auth();
      userId = session?.user?.id || null;
    } catch {
      // session 不可用（例如代理场景），忽略
    }

    // ---- 2. 尝试 Token 认证 ----
    if (!userId) {
      try {
        const headersList = await headers();
        const authHeader = headersList.get('authorization');

        if (authHeader) {
          const token = authHeader.replace('Bearer ', '');

          // 2a. 检查是否直接是 DEVELOPER_TOKEN
          const developerToken = process.env.DEVELOPER_TOKEN;
          if (developerToken && token === developerToken) {
            isTokenDeveloper = true;
            // DEVELOPER_TOKEN 可能没有对应数据库记录，尝试通过 hash 查找用户
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const apiToken = await prisma.apiToken.findFirst({
              where: { token: tokenHash },
              select: { userId: true },
            });
            userId = apiToken?.userId || null;
          }

          // 2b. 检查是否是 ink_* 格式的 API Token
          if (!userId && token.startsWith('ink_')) {
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const apiToken = await prisma.apiToken.findUnique({
              where: { token: tokenHash },
              select: { userId: true, expiresAt: true },
            });
            if (apiToken && (!apiToken.expiresAt || apiToken.expiresAt >= new Date())) {
              userId = apiToken.userId;
            }
          }
        }
      } catch {
        // headers() 不可用，忽略
      }
    }

    // 未登录 → guest
    if (!userId) {
      return NextResponse.json({
        code: 200,
        data: {
          role: 'guest',
          canUpload: false,
          canDelete: false,
        },
      });
    }

    // ---- 检查开发者身份 ----
    // 方式 A: 请求中直接携带 DEVELOPER_TOKEN
    // 方式 B: 数据库中有该用户的 DEVELOPER_TOKEN 关联记录
    if (isTokenDeveloper) {
      return NextResponse.json({
        code: 200,
        data: {
          role: 'developer',
          canUpload: true,
          canDelete: true,
        },
      });
    }

    const isDev = await isUserDeveloper(userId);
    if (isDev) {
      return NextResponse.json({
        code: 200,
        data: {
          role: 'developer',
          canUpload: true,
          canDelete: true,
        },
      });
    }

    // ---- 检查管理员身份 ----
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    if (user?.isAdmin) {
      return NextResponse.json({
        code: 200,
        data: {
          role: 'admin',
          canUpload: true,
          canDelete: true,
        },
      });
    }

    // ---- 检查是否拥有任何 API Token（拥有 Token 说明是有管理权限的用户） ----
    const hasAnyToken = await prisma.apiToken.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (hasAnyToken) {
      return NextResponse.json({
        code: 200,
        data: {
          role: 'developer',
          canUpload: true,
          canDelete: true,
        },
      });
    }

    // 普通用户
    return NextResponse.json({
      code: 200,
      data: {
        role: 'user',
        canUpload: false,
        canDelete: false,
      },
    });
  } catch (error) {
    console.error('Failed to get library role:', error);
    return NextResponse.json({
      code: 200,
      data: {
        role: 'guest',
        canUpload: false,
        canDelete: false,
      },
    });
  }
}

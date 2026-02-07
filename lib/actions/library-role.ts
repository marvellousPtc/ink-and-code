'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export interface LibraryRoleResult {
  role: 'developer' | 'admin' | 'user' | 'guest';
  canUpload: boolean;
  canDelete: boolean;
}

/**
 * Server Action: 获取当前用户在图书馆中的角色
 * 
 * 使用 Server Action 而非 API 路由，因为：
 * - 本地开发环境的中间件会把 /api/* 请求代理到线上服务器
 * - Server Action 走 Next.js 内部通道，不经过中间件代理
 * - 因此可以正确读取本地 session 和环境变量
 */
export async function getLibraryRole(): Promise<LibraryRoleResult> {
  const guest: LibraryRoleResult = { role: 'guest', canUpload: false, canDelete: false };

  try {
    // 获取 session
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return guest;
    }

    // ---- 检查开发者身份 ----
    const developerToken = process.env.DEVELOPER_TOKEN;
    if (developerToken) {
      const tokenHash = crypto.createHash('sha256').update(developerToken).digest('hex');
      const devToken = await prisma.apiToken.findFirst({
        where: { token: tokenHash, userId },
        select: { id: true },
      });
      if (devToken) {
        return { role: 'developer', canUpload: true, canDelete: true };
      }
    }

    // ---- 检查管理员身份 ----
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    if (user?.isAdmin) {
      return { role: 'admin', canUpload: true, canDelete: true };
    }

    // ---- 检查是否拥有任何 API Token（有 Token 说明有管理权限） ----
    const hasToken = await prisma.apiToken.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (hasToken) {
      return { role: 'developer', canUpload: true, canDelete: true };
    }

    // 普通用户
    return { role: 'user', canUpload: false, canDelete: false };
  } catch (error) {
    console.error('Failed to get library role:', error);
    return guest;
  }
}

import { prisma } from '@/lib/prisma';
import { success, requireAuth } from '@/lib/api-response';
import { NextResponse } from 'next/server';

/**
 * GET /api/token/list
 * 获取当前用户的所有 API Token（需要登录）
 */
export async function GET() {
  try {
    // 验证登录状态
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const tokens = await prisma.apiToken.findMany({
      where: { userId: userId! },
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return success(tokens);
  } catch (error) {
    console.error('Failed to list tokens:', error);
    return NextResponse.json(
      { code: 500, message: `获取失败: ${error instanceof Error ? error.message : '未知错误'}`, data: null },
      { status: 500 }
    );
  }
}

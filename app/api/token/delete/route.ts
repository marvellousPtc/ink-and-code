import { prisma } from '@/lib/prisma';
import { success, ApiError, requireAuth, validateRequired } from '@/lib/api-response';
import { NextResponse } from 'next/server';

/**
 * POST /api/token/delete
 * 删除 API Token（需要登录）
 */
export async function POST(request: Request) {
  try {
    // 验证登录状态
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const data = await request.json();

    // 验证必填字段
    const validationError = validateRequired(data, ['id']);
    if (validationError) return validationError;

    // 查找 Token
    const token = await prisma.apiToken.findFirst({
      where: {
        id: data.id,
        userId: userId!,
      },
    });

    if (!token) {
      return ApiError.notFound('Token 不存在');
    }

    // 删除 Token
    await prisma.apiToken.delete({
      where: { id: data.id },
    });

    return success(null, 'Token 删除成功');
  } catch (error) {
    console.error('Failed to delete token:', error);
    return NextResponse.json(
      { code: 500, message: `删除失败: ${error instanceof Error ? error.message : '未知错误'}`, data: null },
      { status: 500 }
    );
  }
}

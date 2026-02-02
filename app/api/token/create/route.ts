import { prisma } from '@/lib/prisma';
import { created, ApiError, requireAuth, validateRequired } from '@/lib/api-response';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * 生成安全的 API Token
 * 格式: ink_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 */
function generateToken(): { token: string; tokenPrefix: string; tokenHash: string } {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const token = `ink_${randomBytes}`;
  const tokenPrefix = `ink_${randomBytes.slice(0, 8)}...`;
  // 使用 SHA-256 哈希存储
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenPrefix, tokenHash };
}

/**
 * POST /api/token/create
 * 创建新的 API Token（需要登录）
 */
export async function POST(request: Request) {
  try {
    // 验证登录状态
    const { userId, error: authError } = await requireAuth();
    if (authError) return authError;

    const data = await request.json();

    // 验证必填字段
    const validationError = validateRequired(data, ['name']);
    if (validationError) return validationError;

    // 检查 Token 名称是否已存在
    const existingToken = await prisma.apiToken.findFirst({
      where: {
        userId: userId!,
        name: data.name,
      },
    });

    if (existingToken) {
      return ApiError.conflict('已存在同名的 Token');
    }

    // 限制每个用户最多 10 个 Token
    const tokenCount = await prisma.apiToken.count({
      where: { userId: userId! },
    });

    if (tokenCount >= 10) {
      return ApiError.badRequest('每个用户最多创建 10 个 Token');
    }

    // 生成 Token
    const { token, tokenPrefix, tokenHash } = generateToken();

    // 计算过期时间（可选，默认永不过期）
    let expiresAt: Date | null = null;
    if (data.expiresInDays && typeof data.expiresInDays === 'number') {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + data.expiresInDays);
    }

    // 创建 Token
    const apiToken = await prisma.apiToken.create({
      data: {
        userId: userId!,
        name: data.name,
        token: tokenHash,
        tokenPrefix,
        expiresAt,
      },
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    // 返回完整 Token（仅此一次显示）
    return created(
      {
        ...apiToken,
        token, // 只在创建时返回完整 Token
      },
      'Token 创建成功，请妥善保管，此 Token 只显示一次'
    );
  } catch (error) {
    console.error('Failed to create token:', error);
    return NextResponse.json(
      { code: 500, message: `创建失败: ${error instanceof Error ? error.message : '未知错误'}`, data: null },
      { status: 500 }
    );
  }
}

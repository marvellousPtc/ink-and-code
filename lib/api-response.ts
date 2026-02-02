import { NextResponse } from 'next/server';
import { auth } from './auth';
import { prisma } from './prisma';
import crypto from 'crypto';

/**
 * 统一 API 响应格式
 */
export interface ApiResponse<T = unknown> {
  code: number;
  data?: T;
  message?: string;
}

/**
 * 获取当前登录用户 ID
 * 返回 userId 或 null（未登录）
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id || null;
}

/**
 * 验证用户登录状态
 * 返回 { userId, error }
 */
export async function requireAuth(): Promise<{
  userId: string | null;
  error: NextResponse | null;
}> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { userId: null, error: ApiError.unauthorized('请先登录') };
  }
  return { userId, error: null };
}

/**
 * 通过 Bearer Token 验证用户
 * 支持 Authorization: Bearer ink_xxxxxxxx 格式
 * 返回 { userId, error }
 */
export async function requireTokenAuth(request: Request): Promise<{
  userId: string | null;
  error: NextResponse | null;
}> {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { userId: null, error: ApiError.unauthorized('缺少有效的 Authorization header') };
  }

  const token = authHeader.slice(7); // 去掉 "Bearer " 前缀
  
  if (!token.startsWith('ink_')) {
    return { userId: null, error: ApiError.unauthorized('无效的 Token 格式') };
  }

  // 哈希 Token 用于查询
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    const apiToken = await prisma.apiToken.findUnique({
      where: { token: tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
      },
    });

    if (!apiToken) {
      return { userId: null, error: ApiError.unauthorized('Token 不存在或已失效') };
    }

    // 检查是否过期
    if (apiToken.expiresAt && apiToken.expiresAt < new Date()) {
      return { userId: null, error: ApiError.unauthorized('Token 已过期') };
    }

    // 更新最后使用时间（异步，不阻塞响应）
    prisma.apiToken.update({
      where: { id: apiToken.id },
      data: { lastUsedAt: new Date() },
    }).catch(console.error);

    return { userId: apiToken.userId, error: null };
  } catch (error) {
    console.error('Token auth error:', error);
    return { userId: null, error: ApiError.internal('Token 验证失败') };
  }
}

/**
 * 同时支持 Session 和 Token 认证
 * 优先使用 Token 认证（如果提供了 Authorization header）
 * 否则使用 Session 认证
 */
export async function requireAuthOrToken(request: Request): Promise<{
  userId: string | null;
  error: NextResponse | null;
  authMethod: 'session' | 'token' | null;
}> {
  const authHeader = request.headers.get('authorization');
  
  // 如果提供了 Authorization header，使用 Token 认证
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const result = await requireTokenAuth(request);
    return { ...result, authMethod: result.userId ? 'token' : null };
  }
  
  // 否则使用 Session 认证
  const result = await requireAuth();
  return { ...result, authMethod: result.userId ? 'session' : null };
}

/**
 * 成功响应
 */
export function success<T>(data: T, message?: string, status = 200) {
  return NextResponse.json<ApiResponse<T>>(
    {
      code: status,
      data,
      message,
    },
    { status }
  );
}

/**
 * 创建成功响应 (201)
 */
export function created<T>(data: T, message = 'Created successfully') {
  return success(data, message, 201);
}

/**
 * 错误响应
 */
export function error(message: string, status = 500) {
  return NextResponse.json<ApiResponse>(
    {
      code: status,
      message,
    },
    { status }
  );
}

/**
 * 常用错误响应
 */
export const ApiError = {
  /** 401 未授权 */
  unauthorized(message = 'Unauthorized') {
    return error(message, 401);
  },

  /** 400 请求参数错误 */
  badRequest(message = 'Bad request') {
    return error(message, 400);
  },

  /** 404 资源不存在 */
  notFound(message = 'Not found') {
    return error(message, 404);
  },

  /** 409 资源冲突 */
  conflict(message = 'Conflict') {
    return error(message, 409);
  },

  /** 500 服务器错误 */
  internal(message = 'Internal server error') {
    return error(message, 500);
  },
};

/**
 * 验证 API Key 的辅助函数
 * 返回 null 表示验证通过，否则返回错误响应
 */
export function validateApiKey(request: Request): NextResponse | null {
  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return ApiError.unauthorized();
  }
  return null;
}

/**
 * 验证必填字段
 * 返回 null 表示验证通过，否则返回错误响应
 * 注意：空字符串被视为有效值，只有 undefined/null 才视为缺失
 */
export function validateRequired(
  data: Record<string, unknown>,
  fields: string[]
): NextResponse | null {
  const missing = fields.filter((field) => data[field] === undefined || data[field] === null);
  if (missing.length > 0) {
    return ApiError.badRequest(`Missing required fields: ${missing.join(', ')}`);
  }
  return null;
}

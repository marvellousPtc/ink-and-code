import fs from 'fs';
import path from 'path';
import { mkdir } from 'fs/promises';

// 允许的图片类型
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
// 最大文件大小 10MB
export const MAX_SIZE = 10 * 1024 * 1024;

/**
 * 本地存储配置
 */
export interface LocalStorageConfig {
  basePath: string;       // 基础存储路径（绝对路径）
  relativePath: string;   // 相对路径（存储到数据库）
  urlPrefix: string;      // 访问 URL 前缀
}

/**
 * 获取本地存储配置
 */
export function getLocalStorageConfig(userId: string, localStoragePath?: string): LocalStorageConfig {
  // 默认路径
  let relativePath = localStoragePath || `uploads/${userId}`;
  
  // 展开占位符
  // 支持 ${userId} - 用户 ID
  // 支持 %Y/%m/%d - 日期格式化
  const now = new Date();
  relativePath = relativePath
    .replace(/\$\{userId\}/g, userId)
    .replace(/\%Y/g, now.getFullYear().toString())
    .replace(/\%m/g, (now.getMonth() + 1).toString().padStart(2, '0'))
    .replace(/\%d/g, now.getDate().toString().padStart(2, '0'));
  
  // 基础路径：public 目录下的 uploads
  const basePath = path.join(process.cwd(), 'public', relativePath);
  
  // URL 前缀（去掉 leading slash）
  const urlPrefix = `/${relativePath}`;
  
  return {
    basePath,
    relativePath,
    urlPrefix,
  };
}

/**
 * 确保目录存在
 */
async function ensureDir(config: LocalStorageConfig): Promise<void> {
  try {
    await mkdir(config.basePath, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * 上传文件到本地存储
 */
export async function uploadToLocal(
  file: File,
  userId: string,
  localStoragePath?: string
): Promise<{ url: string; relativePath: string }> {
  // 验证文件类型
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('不支持的图片格式，请上传 JPG、PNG、GIF、WebP 或 SVG 格式');
  }

  // 验证文件大小
  if (file.size > MAX_SIZE) {
    throw new Error('图片大小不能超过 10MB');
  }

  // 获取配置
  const config = getLocalStorageConfig(userId, localStoragePath);

  // 确保目录存在
  await ensureDir(config);

  // 生成文件名
  const ext = file.name.split('.').pop() || 'png';
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const fileName = `${timestamp}-${random}.${ext}`;

  // 构建完整路径
  const filePath = path.join(config.basePath, fileName);

  // 读取并写入文件
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await fs.promises.writeFile(filePath, buffer);

  // 返回 URL（使用正斜杠）
  const url = `${config.urlPrefix}/${fileName}`.replace(/\/+/g, '/');

  return {
    url,
    relativePath: config.relativePath,
  };
}

/**
 * 从本地存储删除文件
 */
export async function deleteFromLocal(fileUrl: string, localStoragePath?: string): Promise<void> {
  if (!fileUrl) return;

  // 从 URL 提取相对路径
  const urlPath = fileUrl.replace(/^\/?public\//, '').replace(/^\//, '');
  
  // 获取配置
  const config = getLocalStorageConfig('', localStoragePath);
  
  // 只处理本地存储的 URL
  if (!urlPath.startsWith(config.relativePath)) {
    return; // 不是本地存储的文件
  }

  const filePath = path.join(process.cwd(), 'public', urlPath);

  try {
    await fs.promises.unlink(filePath);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.error('Failed to delete local file:', error);
    }
  }
}

/**
 * 获取本地存储使用统计
 */
export async function getLocalStorageStats(userId: string, localStoragePath?: string): Promise<{
  fileCount: number;
  totalBytes: number;
}> {
  const config = getLocalStorageConfig(userId, localStoragePath);

  try {
    const files = await fs.promises.readdir(config.basePath);
    const imageFiles = files.filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f));

    let totalBytes = 0;
    for (const file of imageFiles) {
      const stat = await fs.promises.stat(path.join(config.basePath, file));
      totalBytes += stat.size;
    }

    return {
      fileCount: imageFiles.length,
      totalBytes,
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return { fileCount: 0, totalBytes: 0 };
    }
    throw error;
  }
}

/**
 * 检查本地存储路径是否有效
 */
export function validateLocalStoragePath(storagePath: string): { valid: boolean; message?: string } {
  if (!storagePath || storagePath.trim() === '') {
    return { valid: false, message: '存储路径不能为空' };
  }

  // 路径不能包含特殊字符（允许 / 用于嵌套路径，但不允许 \）
  if (/[\x00-\x1f<>:"\\|?*]/.test(storagePath)) {
    return { valid: false, message: '路径包含非法字符' };
  }

  // 不能是绝对路径
  if (path.isAbsolute(storagePath)) {
    return { valid: false, message: '必须是相对路径' };
  }

  // 不能包含 .. (防止跳出 public 目录)
  if (storagePath.includes('..')) {
    return { valid: false, message: '路径不能包含 ..' };
  }

  return { valid: true };
}

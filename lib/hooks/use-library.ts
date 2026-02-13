'use client';

import { useState, useCallback, useEffect } from 'react';
import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import { fetcher, post } from '@/lib/fetcher';
import { getLibraryRole } from '@/lib/actions/library-role';
import type { LibraryRoleResult } from '@/lib/actions/library-role';

/**
 * Book 类型
 */
export interface Book {
  id: string;
  title: string;
  author: string | null;
  cover: string | null;
  description: string | null;
  format: string;
  originalUrl: string;
  readableUrl: string | null;
  fileSize: number;
  metadata: Record<string, unknown> | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
  progress?: {
    percentage: number;
    lastReadAt: string;
    totalReadTime: number;
  } | null;
}

export interface BookDetail extends Book {
  progress: ReadingProgress | null;
  bookmarks: BookmarkItem[];
  highlights: HighlightItem[];
}

export interface ReadingProgress {
  id: string;
  bookId: string;
  currentLocation: string | null;
  percentage: number;
  lastReadAt: string;
  totalReadTime: number;
  pageNumber?: number | null;
  settingsFingerprint?: string | null;
}

export interface BookmarkItem {
  id: string;
  bookId: string;
  title: string | null;
  location: string;
  note: string | null;
  createdAt: string;
}

export interface HighlightItem {
  id: string;
  bookId: string;
  text: string;
  location: string;
  color: string;
  note: string | null;
  createdAt: string;
}

export interface ReadingSettingsData {
  id: string;
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  theme: string;
  pageWidth: number;
}

export interface BookListData {
  list: Book[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * 图书馆角色
 */
export type LibraryRole = LibraryRoleResult;

/**
 * 获取当前用户在图书馆中的角色和权限
 * 
 * 使用 Server Action 而非 API 路由，避免被中间件代理拦截。
 * Server Action 走 Next.js 内部通道，可以正确读取本地 session。
 */
export function useLibraryRole() {
  const [data, setData] = useState<LibraryRoleResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getLibraryRole().then((result) => {
      if (!cancelled) {
        setData(result);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setIsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return {
    role: data?.role || 'guest',
    canUpload: data?.canUpload || false,
    canDelete: data?.canDelete || false,
    isLoading,
  };
}

/**
 * 获取书架列表
 */
export function useBookList(search?: string, sort?: string) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (sort) params.set('sort', sort);
  params.set('limit', '50');

  const { data, error, isLoading, isValidating, mutate } = useSWR<BookListData>(
    `/api/library/list?${params.toString()}`,
    fetcher,
    { keepPreviousData: true }
  );

  return {
    books: data?.list || [],
    pagination: data?.pagination,
    // 仅首次加载（无缓存数据）才显示骨架屏，后续搜索/排序变化保持旧数据
    isLoading: isLoading && !data,
    isValidating,
    error,
    mutate,
  };
}

/**
 * 获取书籍详情
 */
export function useBookDetail(id: string | null) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<BookDetail>(
    id ? `/api/library/detail?id=${id}` : null,
    fetcher
  );

  return { book: data, isLoading, isValidating, error, mutate };
}

// 不需要服务端转换、可直传 OSS 的格式
const DIRECT_UPLOAD_FORMATS = new Set(['epub', 'pdf', 'txt', 'md', 'markdown', 'html', 'htm']);

/**
 * 上传书籍（两级策略）
 * - 简单格式 (epub/pdf/txt/md/html)：presign + 浏览器直传 OSS，跳过服务端中转
 * - 转换格式 (docx/mobi/azw3)：走服务端代理上传 + 格式转换
 */
export function useUploadBook() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'processing'>('idle');

  /**
   * 直传 OSS：获取签名 URL → 浏览器直传 → 确认创建记录
   */
  const directUpload = useCallback(async (file: File): Promise<Book> => {
    setIsUploading(true);
    setProgress(0);
    setUploadPhase('uploading');

    try {
      // 1. 获取预签名 URL
      const presignRes = await fetch('/api/library/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          fileSize: file.size,
        }),
      });
      const presignJson = await presignRes.json();
      if (presignRes.status >= 400 || presignJson.code >= 400) {
        throw new Error(presignJson.message || '获取上传签名失败');
      }
      const { signedUrl, objectName, fileUrl, format, contentType } = presignJson.data;

      // 2. 直传 OSS（XHR 支持进度追踪）
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', signedUrl);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            // 直传模式：上传占 0-95%，确认占 95-100%
            const pct = Math.round((e.loaded / e.total) * 95);
            setProgress(pct);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setProgress(95);
            setUploadPhase('processing');
            resolve();
          } else {
            // 尝试从 OSS 响应体解析错误详情
            let detail = '';
            try {
              const match = xhr.responseText?.match(/<Message>(.*?)<\/Message>/);
              if (match) detail = `: ${match[1]}`;
            } catch {}
            reject(new Error(`OSS 上传失败 (${xhr.status}${detail})`));
          }
        };

        xhr.onerror = () => {
          // onerror 通常是 CORS 问题 — 浏览器拦截了跨域请求
          const ossHost = new URL(signedUrl).host;
          reject(new Error(
            `OSS 直传被浏览器拦截（可能是 CORS 配置问题）。\n` +
            `请在 OSS 控制台 → Bucket「${ossHost.split('.')[0]}」→ 权限管理 → 跨域设置 中添加规则：\n` +
            `来源: ${location.origin}\n方法: PUT\n允许 Headers: *`
          ));
        };
        xhr.ontimeout = () => reject(new Error('上传超时，请重试'));
        xhr.timeout = 300000;

        xhr.send(file);
      });

      // 3. 确认上传，创建 Book 记录
      const confirmRes = await fetch('/api/library/upload/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          objectName,
          filename: file.name,
          fileUrl,
          format,
          fileSize: file.size,
        }),
      });
      const confirmJson = await confirmRes.json();
      if (confirmRes.status >= 400 || confirmJson.code >= 400) {
        throw new Error(confirmJson.message || '确认上传失败');
      }

      setProgress(100);
      return confirmJson.data as Book;
    } finally {
      setIsUploading(false);
      setUploadPhase('idle');
      setProgress(0);
    }
  }, []);

  /**
   * 服务端代理上传：文件发到 Next.js 服务端，由服务端转存 OSS + 格式转换
   */
  const serverUpload = useCallback(async (formData: FormData): Promise<Book> => {
    setIsUploading(true);
    setProgress(0);
    setUploadPhase('uploading');

    return new Promise<Book>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/library/upload');
      xhr.withCredentials = true;

      // 上传进度（浏览器→服务器只占 0-70%，剩余留给服务端处理）
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 70);
          setProgress(pct);
          if (e.loaded >= e.total) {
            setProgress(70);
            setUploadPhase('processing');
          }
        }
      };

      xhr.onload = () => {
        setIsUploading(false);
        setUploadPhase('idle');
        setProgress(0);

        // 检查响应是否是 JSON
        const ct = xhr.getResponseHeader('content-type') || '';
        if (!ct.includes('application/json')) {
          reject(new Error(
            xhr.status === 413
              ? '文件太大，超出服务器限制，请检查 nginx client_max_body_size 配置'
              : `上传失败 (${xhr.status})：服务器返回了非预期的响应`
          ));
          return;
        }

        try {
          const json = JSON.parse(xhr.responseText);
          if (xhr.status >= 400 || json.code >= 400) {
            reject(new Error(json.message || '上传失败'));
          } else {
            resolve(json.data as Book);
          }
        } catch {
          reject(new Error('上传失败：服务器返回了无效的响应'));
        }
      };

      xhr.onerror = () => {
        setIsUploading(false);
        setUploadPhase('idle');
        setProgress(0);
        reject(new Error('网络错误，请检查连接后重试'));
      };

      xhr.ontimeout = () => {
        setIsUploading(false);
        setUploadPhase('idle');
        setProgress(0);
        reject(new Error('上传超时，请重试'));
      };

      // 大文件给充足的超时时间（5 分钟）
      xhr.timeout = 300000;
      xhr.send(formData);
    });
  }, []);

  /**
   * 服务端代理上传的便捷封装（从 File 构建 FormData）
   */
  const serverUploadFile = useCallback(async (file: File): Promise<Book> => {
    const formData = new FormData();
    formData.append('file', file);
    return serverUpload(formData);
  }, [serverUpload]);

  /**
   * 统一入口：根据文件格式自动选择上传策略
   * 直传失败（如 OSS 未配置 CORS）时自动回退到服务端代理
   */
  const upload = useCallback(async (file: File): Promise<Book> => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (DIRECT_UPLOAD_FORMATS.has(ext)) {
      try {
        // 优先直传 OSS（跳过服务端中转）
        return await directUpload(file);
      } catch (directErr) {
        const directMsg = directErr instanceof Error ? directErr.message : String(directErr);
        console.warn('直传 OSS 失败，回退到服务端代理:', directMsg);

        // 直传失败，回退到服务端代理上传
        try {
          return await serverUploadFile(file);
        } catch (serverErr) {
          const msg = serverErr instanceof Error ? serverErr.message : '';
          if (msg.includes('413') || msg.includes('太大') || msg.includes('client_max_body_size')) {
            // 两条路径都失败，给出详细的 CORS 配置指引
            throw new Error(
              '文件上传失败：直传 OSS 不可用，服务端代理又超出大小限制。\n\n' +
              '请在 OSS 控制台配置 CORS 规则以启用直传：\n' +
              `1. 来源：${location.origin}\n` +
              '2. 允许 Methods：勾选 PUT\n' +
              '3. 允许 Headers：*\n' +
              '4. 暴露 Headers：ETag\n\n' +
              '或增大 nginx 的 client_max_body_size（如 100m）'
            );
          }
          throw serverErr;
        }
      }
    } else {
      // 需要格式转换，走服务端代理
      return serverUploadFile(file);
    }
  }, [directUpload, serverUploadFile]);

  return { upload, isUploading, progress, uploadPhase };
}

/**
 * 删除书籍
 */
export function useDeleteBook() {
  const { trigger, isMutating } = useSWRMutation(
    '/api/library/delete',
    async (url: string, { arg }: { arg: { id: string } }) => {
      const res = await post(url, arg);
      return res.data;
    }
  );

  return { deleteBook: trigger, isDeleting: isMutating };
}

/**
 * 保存阅读进度
 */
export function useSaveProgress() {
  const { trigger } = useSWRMutation(
    '/api/library/progress',
    async (url: string, { arg }: { arg: { bookId: string; currentLocation?: string; percentage?: number; readTimeDelta?: number; pageNumber?: number; settingsFingerprint?: string } }) => {
      const res = await post(url, arg);
      return res.data;
    }
  );

  return { saveProgress: trigger };
}

/**
 * 获取阅读设置
 */
export function useReadingSettings() {
  const { data, error, isLoading, mutate } = useSWR<ReadingSettingsData>(
    '/api/library/settings',
    fetcher
  );

  return { settings: data, isLoading, error, mutate };
}

/**
 * 保存阅读设置
 */
export function useSaveReadingSettings() {
  const { trigger } = useSWRMutation(
    '/api/library/settings',
    async (url: string, { arg }: { arg: Partial<ReadingSettingsData> }) => {
      const res = await post(url, arg);
      return res.data;
    }
  );

  return { saveSettings: trigger };
}

/**
 * 书签操作
 */
export function useBookmarks(bookId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<BookmarkItem[]>(
    bookId ? `/api/library/bookmarks?bookId=${bookId}` : null,
    fetcher
  );

  const { trigger: addBookmark } = useSWRMutation(
    '/api/library/bookmarks',
    async (url: string, { arg }: { arg: { bookId: string; title?: string; location: string; note?: string } }) => {
      const res = await post(url, { action: 'add', ...arg });
      return res.data;
    }
  );

  const { trigger: deleteBookmark } = useSWRMutation(
    '/api/library/bookmarks',
    async (url: string, { arg }: { arg: { id: string } }) => {
      const res = await post(url, { action: 'delete', ...arg });
      return res.data;
    }
  );

  return {
    bookmarks: data || [],
    isLoading,
    error,
    mutate,
    addBookmark,
    deleteBookmark,
  };
}

/**
 * 划线笔记操作
 */
export function useHighlights(bookId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<HighlightItem[]>(
    bookId ? `/api/library/highlights?bookId=${bookId}` : null,
    fetcher
  );

  const { trigger: addHighlight } = useSWRMutation(
    '/api/library/highlights',
    async (url: string, { arg }: { arg: { bookId: string; text: string; location: string; color?: string; note?: string } }) => {
      const res = await post(url, { action: 'add', ...arg });
      return res.data;
    }
  );

  const { trigger: deleteHighlight } = useSWRMutation(
    '/api/library/highlights',
    async (url: string, { arg }: { arg: { id: string } }) => {
      const res = await post(url, { action: 'delete', ...arg });
      return res.data;
    }
  );

  const { trigger: updateHighlight } = useSWRMutation(
    '/api/library/highlights',
    async (url: string, { arg }: { arg: { id: string; color?: string; note?: string } }) => {
      const res = await post(url, { action: 'update', ...arg });
      return res.data;
    }
  );

  return {
    highlights: data || [],
    isLoading,
    error,
    mutate,
    addHighlight,
    deleteHighlight,
    updateHighlight,
  };
}

/**
 * 全部书籍的高亮笔记（笔记管理页面用）
 */
export interface AllHighlightItem extends HighlightItem {
  book: {
    id: string;
    title: string;
    author: string | null;
    cover: string | null;
    format: string;
  };
}

export function useAllHighlights() {
  const { data, error, isLoading, mutate } = useSWR<AllHighlightItem[]>(
    '/api/library/highlights?all=1',
    fetcher
  );

  const { trigger: updateHighlight } = useSWRMutation(
    '/api/library/highlights',
    async (url: string, { arg }: { arg: { id: string; color?: string; note?: string } }) => {
      const res = await post(url, { action: 'update', ...arg });
      return res.data;
    }
  );

  const { trigger: deleteHighlight } = useSWRMutation(
    '/api/library/highlights',
    async (url: string, { arg }: { arg: { id: string } }) => {
      const res = await post(url, { action: 'delete', ...arg });
      return res.data;
    }
  );

  return {
    highlights: data || [],
    isLoading,
    error,
    mutate,
    updateHighlight,
    deleteHighlight,
  };
}

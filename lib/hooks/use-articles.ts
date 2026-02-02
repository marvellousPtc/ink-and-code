'use client';

import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import { fetcher, post, ApiError } from '@/lib/fetcher';
import type { Category } from './use-categories';

/**
 * 文章类型
 */
export interface Article {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  tags: string[];
  coverImage: string | null;
  published: boolean;
  categoryId: string | null;
  category: Category | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 文章列表项（不含 content）
 */
export interface ArticleListItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  tags: string[];
  coverImage: string | null;
  published: boolean;
  categoryId: string | null;
  sortOrder: number;
  category: Category | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 分页信息
 */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * 文章列表响应
 */
export interface ArticleListData {
  list: ArticleListItem[];
  pagination: Pagination;
}

/**
 * 文章列表查询参数
 */
export interface ArticleListOptions {
  published?: boolean;
  categoryId?: string;
  search?: string;
  page?: number;
  limit?: number;
  showAll?: boolean; // 显示所有文章（包括草稿）
}

/**
 * 创建/更新文章的数据
 */
export interface ArticleInput {
  id?: string;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  tags?: string[];
  coverImage?: string | null;
  published?: boolean;
  categoryId?: string | null;
}

/**
 * 构建文章列表 URL
 */
function buildArticleListUrl(options?: ArticleListOptions): string {
  const params = new URLSearchParams();
  
  if (options?.showAll) {
    // showAll 时不添加 published 参数，获取全部文章
  } else if (options?.published !== undefined) {
    params.set('published', String(options.published));
  }
  if (options?.categoryId) {
    params.set('categoryId', options.categoryId);
  }
  if (options?.search) {
    params.set('search', options.search);
  }
  if (options?.page) {
    params.set('page', String(options.page));
  }
  if (options?.limit) {
    params.set('limit', String(options.limit));
  }

  const queryString = params.toString();
  return `/api/article/list${queryString ? `?${queryString}` : ''}`;
}

/**
 * 获取文章列表
 */
export function useArticleList(options?: ArticleListOptions) {
  const url = buildArticleListUrl(options);
  return useSWR<ArticleListData, ApiError>(url, fetcher);
}

/**
 * 获取公开文章列表（开发者文章，无需登录）
 */
export function usePublicArticleList(options?: Pick<ArticleListOptions, 'categoryId' | 'page' | 'limit'>) {
  const params = new URLSearchParams();
  if (options?.categoryId) params.set('categoryId', options.categoryId);
  if (options?.page) params.set('page', String(options.page));
  if (options?.limit) params.set('limit', String(options.limit));
  const queryString = params.toString();
  const url = `/api/article/public-list${queryString ? `?${queryString}` : ''}`;
  return useSWR<ArticleListData, ApiError>(url, fetcher);
}

/**
 * 获取单篇文章
 */
export function useArticle(id: string | null) {
  return useSWR<Article, ApiError>(
    id ? `/api/article/detail?id=${id}` : null,
    fetcher
  );
}

/**
 * 创建文章的 mutation
 */
async function createArticleFetcher(
  url: string,
  { arg }: { arg: Omit<ArticleInput, 'id'> }
) {
  const res = await post<Article>(url, arg as unknown as Record<string, unknown>);
  return res.data;
}

export function useCreateArticle() {
  return useSWRMutation('/api/article/create', createArticleFetcher);
}

/**
 * 更新文章的 mutation
 */
async function updateArticleFetcher(
  url: string,
  { arg }: { arg: Partial<ArticleInput> & { id: string } }
) {
  const res = await post<Article>(url, arg as unknown as Record<string, unknown>);
  return res.data;
}

export function useUpdateArticle() {
  return useSWRMutation('/api/article/update', updateArticleFetcher);
}

/**
 * 删除文章的 mutation
 */
async function deleteArticleFetcher(
  url: string,
  { arg }: { arg: { id: string } }
) {
  await post(url, arg as unknown as Record<string, unknown>);
}

export function useDeleteArticle() {
  return useSWRMutation('/api/article/delete', deleteArticleFetcher);
}

/**
 * 批量重排序文章的数据类型
 */
export interface ReorderItem {
  id: string;
  sortOrder: number;
  categoryId?: string | null;
}

/**
 * 批量重排序文章的 mutation
 */
async function reorderArticlesFetcher(
  url: string,
  { arg }: { arg: { items: ReorderItem[] } }
) {
  await post(url, arg as unknown as Record<string, unknown>);
}

export function useReorderArticles() {
  return useSWRMutation('/api/article/reorder', reorderArticlesFetcher);
}

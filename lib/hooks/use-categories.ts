'use client';

import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import { fetcher, post, ApiError } from '@/lib/fetcher';

/**
 * 分类类型（扁平结构）
 */
export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  parentId: string | null;
  postCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 树形分类节点
 */
export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
  depth: number;
}

/**
 * 分类输入
 */
export interface CategoryInput {
  id?: string;
  name: string;
  slug?: string;
  icon?: string | null;
  color?: string | null;
  sortOrder?: number;
  parentId?: string | null;
}

/**
 * 将扁平分类列表转换为树形结构
 */
export function buildCategoryTree(categories: Category[]): CategoryTreeNode[] {
  const map = new Map<string, CategoryTreeNode>();
  const roots: CategoryTreeNode[] = [];

  // 创建节点映射
  categories.forEach((cat) => {
    map.set(cat.id, { ...cat, children: [], depth: 0 });
  });

  // 构建树
  categories.forEach((cat) => {
    const node = map.get(cat.id)!;
    if (cat.parentId && map.has(cat.parentId)) {
      const parent = map.get(cat.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // 递归排序
  const sortNodes = (nodes: CategoryTreeNode[]): CategoryTreeNode[] => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    nodes.forEach((node) => {
      if (node.children.length > 0) {
        node.children = sortNodes(node.children);
      }
    });
    return nodes;
  };

  return sortNodes(roots);
}

/**
 * 将树形结构展平为列表（保持层级顺序）
 */
export function flattenCategoryTree(tree: CategoryTreeNode[]): CategoryTreeNode[] {
  const result: CategoryTreeNode[] = [];
  
  const traverse = (nodes: CategoryTreeNode[]) => {
    nodes.forEach((node) => {
      result.push(node);
      if (node.children.length > 0) {
        traverse(node.children);
      }
    });
  };
  
  traverse(tree);
  return result;
}

/**
 * 获取分类列表
 */
export function useCategoryList() {
  return useSWR<Category[], ApiError>(
    '/api/category/list',
    fetcher
  );
}

/**
 * 获取公开分类列表（开发者分类，无需登录）
 */
export function usePublicCategoryList() {
  return useSWR<Category[], ApiError>(
    '/api/category/public-list',
    fetcher
  );
}

/**
 * 创建分类
 */
async function createCategoryFetcher(
  url: string,
  { arg }: { arg: Omit<CategoryInput, 'id'> }
) {
  const res = await post<Category>(url, arg as unknown as Record<string, unknown>);
  return res.data;
}

export function useCreateCategory() {
  return useSWRMutation('/api/category/create', createCategoryFetcher);
}

/**
 * 更新分类
 */
async function updateCategoryFetcher(
  url: string,
  { arg }: { arg: CategoryInput & { id: string } }
) {
  const res = await post<Category>(url, arg as unknown as Record<string, unknown>);
  return res.data;
}

export function useUpdateCategory() {
  return useSWRMutation('/api/category/update', updateCategoryFetcher);
}

/**
 * 删除分类
 */
async function deleteCategoryFetcher(
  url: string,
  { arg }: { arg: { id: string } }
) {
  await post(url, arg as unknown as Record<string, unknown>);
}

export function useDeleteCategory() {
  return useSWRMutation('/api/category/delete', deleteCategoryFetcher);
}

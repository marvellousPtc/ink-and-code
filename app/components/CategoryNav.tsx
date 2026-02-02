'use client';

import { useState, useMemo } from 'react';
import {
  useCategoryList,
  usePublicCategoryList,
  useArticleList,
  usePublicArticleList,
  buildCategoryTree,
  type CategoryTreeNode,
  type ArticleListItem,
} from '@/lib/hooks';
import { ChevronRight, Folder, FolderOpen, FileText, Layout } from 'lucide-react';

// 文章节点
interface ArticleNodeProps {
  article: ArticleListItem;
  depth: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function ArticleNode({ article, depth, isSelected, onSelect }: ArticleNodeProps) {
  const paddingLeft = 16 + depth * 16;

  return (
    <button
      onClick={() => onSelect(article.id)}
      className={`w-full flex items-center gap-3 py-2 pr-4 rounded-xl text-sm transition-all duration-300 group cursor-pointer ${
        isSelected
          ? 'bg-primary/10 text-primary font-medium shadow-[inset_0_0_0_1px_rgba(var(--primary),0.1)]'
          : 'text-muted/70 hover:text-foreground hover:bg-card-border/30'
      }`}
      style={{ paddingLeft }}
    >
      <FileText className={`w-3.5 h-3.5 shrink-0 transition-transform duration-300 ${isSelected ? 'text-primary scale-110' : 'opacity-30 group-hover:opacity-60 group-hover:scale-110'}`} />
      <span className="flex-1 text-left truncate tracking-tight">{article.title || '无标题'}</span>
      {isSelected && (
        <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
      )}
    </button>
  );
}

interface CategoryNavItemProps {
  node: CategoryTreeNode;
  selectedCategoryId: string | null;
  selectedArticleId: string | null;
  onSelectCategory: (id: string | null) => void;
  onSelectArticle: (id: string) => void;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  articlesByCategory: Record<string, ArticleListItem[]>;
}

function CategoryNavItem({
  node,
  selectedCategoryId,
  selectedArticleId,
  onSelectCategory,
  onSelectArticle,
  expandedIds,
  onToggleExpand,
  articlesByCategory,
}: CategoryNavItemProps) {
  const isCategorySelected = selectedCategoryId === node.id;
  const isExpanded = expandedIds.has(node.id);
  const articles = articlesByCategory[node.id] || [];
  const hasChildren = node.children.length > 0 || articles.length > 0;
  const paddingLeft = 12 + node.depth * 16;

  return (
    <div className="space-y-0.5">
      <button
        onClick={() => {
          onToggleExpand(node.id);
          onSelectCategory(node.id);
        }}
        className={`w-full flex items-center gap-2.5 py-2.5 pr-4 rounded-xl text-sm transition-all duration-300 group cursor-pointer ${
          isCategorySelected
            ? 'bg-primary/5 text-primary font-semibold'
            : 'text-muted/80 hover:text-foreground hover:bg-card-border/40'
        }`}
        style={{ paddingLeft }}
      >
        {/* 展开/折叠图标 */}
        <div className="w-4 h-4 flex items-center justify-center">
          {hasChildren && (
            <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}>
              <ChevronRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100" />
            </div>
          )}
        </div>

        {/* 文件夹图标 */}
        <div className={`transition-all duration-300 ${isExpanded ? 'scale-110' : 'opacity-70 group-hover:opacity-100'}`}>
          {node.icon ? (
            <span className="text-base">{node.icon}</span>
          ) : isExpanded ? (
            <FolderOpen className="w-4 h-4 text-primary/80" />
          ) : (
            <Folder className="w-4 h-4 opacity-40" />
          )}
        </div>

        {/* 名称 */}
        <span className="flex-1 text-left truncate tracking-tight">{node.name}</span>

        {/* 文章数角标 */}
        {articles.length > 0 && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${
            isCategorySelected 
              ? 'bg-primary/10 border-primary/20 text-primary' 
              : 'bg-card-border/30 border-transparent text-muted group-hover:text-foreground'
          }`}>
            {articles.length}
          </span>
        )}
      </button>

      {/* 展开内容 - 增加简单的过渡动画 */}
      {isExpanded && (
        <div className="overflow-hidden animate-in slide-in-from-left-2 fade-in duration-300">
          {/* 子分类 */}
          {node.children.map((child) => (
            <CategoryNavItem
              key={child.id}
              node={child}
              selectedCategoryId={selectedCategoryId}
              selectedArticleId={selectedArticleId}
              onSelectCategory={onSelectCategory}
              onSelectArticle={onSelectArticle}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              articlesByCategory={articlesByCategory}
            />
          ))}
          {/* 该分类下的文章 */}
          {articles.map((article) => (
            <ArticleNode
              key={article.id}
              article={article}
              depth={node.depth + 1}
              isSelected={selectedArticleId === article.id}
              onSelect={onSelectArticle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CategoryNavProps {
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
  selectedArticleId?: string | null;
  onSelectArticle?: (id: string) => void;
  showAllOption?: boolean;
  searchQuery?: string;
  className?: string;
  usePublic?: boolean; // 使用公开 API（未登录时使用开发者文章）
}

export default function CategoryNav({
  selectedCategoryId,
  onSelectCategory,
  selectedArticleId = null,
  onSelectArticle,
  showAllOption = true,
  searchQuery = '',
  className = '',
  usePublic = false,
}: CategoryNavProps) {
  // 根据 usePublic 选择不同的数据源
  const { data: privateCategories, isLoading: privateCategoriesLoading } = useCategoryList();
  const { data: publicCategories, isLoading: publicCategoriesLoading } = usePublicCategoryList();
  const { data: privateArticlesData, isLoading: privateArticlesLoading } = useArticleList({ 
    published: true, 
    limit: 1000,
    search: searchQuery || undefined,
  });
  const { data: publicArticlesData, isLoading: publicArticlesLoading } = usePublicArticleList({ 
    limit: 1000,
  });

  // 选择数据源
  const categories = usePublic ? publicCategories : privateCategories;
  const categoriesLoading = usePublic ? publicCategoriesLoading : privateCategoriesLoading;
  const articlesData = usePublic ? publicArticlesData : privateArticlesData;
  const articlesLoading = usePublic ? publicArticlesLoading : privateArticlesLoading;
  
  // 用户手动折叠的分类 ID（默认全部展开，所以只记录折叠的）
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const tree = categories ? buildCategoryTree(categories) : [];
  const articles = useMemo(() => articlesData?.list || [], [articlesData?.list]);
  const totalPosts = articles.length;

  // 计算所有分类 ID
  const allCategoryIds = useMemo(() => {
    if (categories && categories.length > 0) {
      return new Set(categories.map((c) => c.id));
    }
    return new Set<string>();
  }, [categories]);

  // 最终展开的 ID = 所有分类 ID - 用户手动折叠的 ID
  const expandedIds = useMemo(() => {
    const result = new Set<string>();
    allCategoryIds.forEach((id) => {
      if (!collapsedIds.has(id)) {
        result.add(id);
      }
    });
    return result;
  }, [allCategoryIds, collapsedIds]);

  // 按分类分组文章
  const articlesByCategory = useMemo(() => {
    const map: Record<string, ArticleListItem[]> = { uncategorized: [] };
    articles.forEach((article) => {
      const catId = article.categoryId || 'uncategorized';
      if (!map[catId]) map[catId] = [];
      map[catId].push(article);
    });
    return map;
  }, [articles]);

  const handleToggleExpand = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      // 如果当前是展开的（不在 collapsed 中），则添加到 collapsed（折叠）
      // 如果当前是折叠的（在 collapsed 中），则从 collapsed 移除（展开）
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectArticle = (id: string) => {
    if (onSelectArticle) {
      onSelectArticle(id);
    }
  };

  const isLoading = categoriesLoading || articlesLoading;

  if (isLoading) {
    return (
      <div className={`space-y-2 ${className}`}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-card-border/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      {/* 全部文章 */}
      {showAllOption && (
        <button
          onClick={() => {
            onSelectCategory(null);
            if (onSelectArticle) onSelectArticle('');
          }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm transition-all duration-300 group mb-2 cursor-pointer ${
            !selectedCategoryId && !selectedArticleId
              ? 'bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20'
              : 'text-muted/80 hover:text-foreground hover:bg-card-border/40'
          }`}
        >
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
            !selectedCategoryId && !selectedArticleId ? 'bg-white/20' : 'bg-primary/5 group-hover:bg-primary/10'
          }`}>
            <Layout className="w-4 h-4" />
          </div>
          <span className="flex-1 text-left tracking-tight">全部文章</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
            !selectedCategoryId && !selectedArticleId ? 'bg-white/20' : 'bg-card-border/30 opacity-50'
          }`}>
            {totalPosts}
          </span>
        </button>
      )}

      {/* 分类树（包含文章） */}
      <div className="space-y-0.5">
        {tree.map((node) => (
          <CategoryNavItem
            key={node.id}
            node={node}
            selectedCategoryId={selectedCategoryId}
            selectedArticleId={selectedArticleId}
            onSelectCategory={onSelectCategory}
            onSelectArticle={handleSelectArticle}
            expandedIds={expandedIds}
            onToggleExpand={handleToggleExpand}
            articlesByCategory={articlesByCategory}
          />
        ))}
      </div>

      {/* 未分类文章 */}
      {articlesByCategory.uncategorized?.length > 0 && (
        <div className="mt-6 pt-6 border-t border-card-border/40">
          <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted/50 flex items-center justify-between">
            <span>未分类</span>
            <span>{articlesByCategory.uncategorized.length}</span>
          </div>
          <div className="mt-1">
            {articlesByCategory.uncategorized.map((article) => (
              <ArticleNode
                key={article.id}
                article={article}
                depth={0}
                isSelected={selectedArticleId === article.id}
                onSelect={handleSelectArticle}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

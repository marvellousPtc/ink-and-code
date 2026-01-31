/*
 * :file description: 
 * :name: /ink-and-code/app/blog/BlogPageClient.tsx
 * :author: PTC
 * :copyright: (c) 2026, Tungee
 * :date created: 2026-01-30 15:23:36
 * :last editor: PTC
 * :date last edited: 2026-01-30 22:51:20
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Calendar, BookOpen, Clock, Hash, Layout, Search, X, FileText, Loader2 } from 'lucide-react';
import CategoryNav from '@/app/components/CategoryNav';
import TiptapRenderer from '@/app/components/TiptapRenderer';
import { useArticle, useArticleList } from '@/lib/hooks';

// 搜索防抖 hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface Post {
  id: string;
  slug: string;
  title: string;
  createdAt: string;
  excerpt?: string;
  tags?: string[];
  categoryId?: string | null;
  category?: {
    id: string;
    name: string;
    icon?: string | null;
  } | null;
}

interface BlogPageClientProps {
  initialPosts: Post[];
}

export default function BlogPageClient({ initialPosts }: BlogPageClientProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // 防抖搜索词，避免频繁请求
  const debouncedSearch = useDebounce(searchInput, 300);

  // 获取搜索结果
  const { data: searchResults, isLoading: searchLoading } = useArticleList(
    debouncedSearch ? { search: debouncedSearch, published: true, limit: 10 } : undefined
  );

  // 是否显示搜索下拉框
  const showSearchDropdown = isSearchFocused && searchInput.length > 0;

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 获取选中的文章详情
  const { data: selectedArticle, isLoading: articleLoading } = useArticle(selectedArticleId);

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // 处理选择文章
  const handleSelectArticle = (id: string) => {
    if (id) {
      setSelectedArticleId(id);
      setSelectedCategoryId(null);
      // 滚动右侧内容区域到顶部
      if (mainRef.current) {
        mainRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      setSelectedArticleId(null);
    }
  };

  // 处理搜索结果点击
  const handleSearchResultClick = (id: string) => {
    handleSelectArticle(id);
    setSearchInput('');
    setIsSearchFocused(false);
  };

  // 处理选择分类
  const handleSelectCategory = (id: string | null) => {
    setSelectedCategoryId(id);
    setSelectedArticleId(null);
  };

  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  return (
    <div className="min-h-screen pt-16 sm:pt-20 bg-background/50 lg:h-screen lg:overflow-hidden">
      <div className="bg-glow opacity-50" />

      {/* 移动端顶部栏 */}
      <div className="lg:hidden sticky top-16 sm:top-20 z-40 bg-background/80 backdrop-blur-xl border-b border-card-border/30 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setShowMobileSidebar(true)}
            className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
          >
            <Layout className="w-4 h-4" />
            <span>文章目录</span>
          </button>
          {/* 移动端搜索框 */}
          <div className="flex-1 max-w-xs relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/40" />
            <input
              type="text"
              placeholder="搜索..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              className="w-full pl-9 pr-4 py-2 bg-card/50 border border-card-border/50 rounded-lg text-sm placeholder:text-muted/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
            />
          </div>
        </div>
      </div>

      {/* 移动端侧边栏遮罩 */}
      {showMobileSidebar && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-50"
          onClick={() => setShowMobileSidebar(false)}
        />
      )}

      {/* 移动端侧边栏 */}
      <aside className={`lg:hidden fixed left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-background z-50 transform transition-transform duration-300 ${showMobileSidebar ? 'translate-x-0' : '-translate-x-full'} overflow-y-auto`}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">文章目录</h2>
            <button 
              onClick={() => setShowMobileSidebar(false)}
              className="p-2 hover:bg-card rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <CategoryNav
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={(id) => {
              handleSelectCategory(id);
              setShowMobileSidebar(false);
            }}
            selectedArticleId={selectedArticleId}
            onSelectArticle={(id) => {
              handleSelectArticle(id);
              setShowMobileSidebar(false);
            }}
          />
        </div>
      </aside>

      <div className="h-full flex px-4 md:px-6">
        {/* 左侧侧边栏 - 仅桌面端显示 */}
        <aside className="w-72 shrink-0 py-4 pr-6 hidden lg:flex lg:flex-col overflow-y-auto">
          <div className="flex-1">
            {/* 搜索框 */}
            <div ref={searchContainerRef} className="relative mb-4">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none z-10">
                {searchLoading && debouncedSearch ? (
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                ) : (
                  <Search className="w-4 h-4 text-muted/40" />
                )}
              </div>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="搜索文章..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                className="w-full pl-10 pr-10 py-2.5 bg-card/50 border border-card-border/50 rounded-xl text-sm placeholder:text-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
              />
              {searchInput && (
                <button
                  onClick={() => {
                    setSearchInput('');
                    setIsSearchFocused(false);
                    searchInputRef.current?.focus();
                  }}
                  className="absolute inset-y-0 right-3 flex items-center text-muted/40 hover:text-muted/70 transition-colors z-10"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* 搜索结果下拉框 */}
              {showSearchDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-card/95 backdrop-blur-xl border border-card-border/60 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  {searchLoading ? (
                    <div className="px-4 py-6 text-center text-sm text-muted/60">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      搜索中...
                    </div>
                  ) : searchResults?.list && searchResults.list.length > 0 ? (
                    <div className="max-h-80 overflow-y-auto">
                      {searchResults.list.map((article) => (
                        <button
                          key={article.id}
                          onClick={() => handleSearchResultClick(article.id)}
                          className="w-full flex items-start gap-3 px-4 py-3 hover:bg-primary/5 transition-colors text-left border-b border-card-border/30 last:border-b-0"
                        >
                          <FileText className="w-4 h-4 text-primary/60 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">
                              {article.title || '无标题'}
                            </div>
                            {article.excerpt && (
                              <div className="text-xs text-muted/60 mt-0.5 line-clamp-1">
                                {article.excerpt}
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              {article.category && (
                                <span className="text-[10px] text-primary/70 bg-primary/5 px-1.5 py-0.5 rounded">
                                  {article.category.name}
                                </span>
                              )}
                              <span className="text-[10px] text-muted/40">
                                {new Date(article.createdAt).toLocaleDateString('zh-CN')}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-6 text-center text-sm text-muted/60">
                      <Search className="w-5 h-5 mx-auto mb-2 opacity-40" />
                      未找到匹配的文章
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 px-1 mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-muted/60">
              <Layout className="w-3 h-3" />
              <span>文档目录</span>
            </div>
            <CategoryNav
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={handleSelectCategory}
              selectedArticleId={selectedArticleId}
              onSelectArticle={handleSelectArticle}
              className="px-1"
            />
          </div>
          
          {/* 底部提示 */}
          <div className="mt-6 bg-primary/5 border border-primary/10 rounded-2xl p-5 space-y-2">
            <h4 className="text-sm font-semibold text-primary/80">沉浸阅读</h4>
            <p className="text-xs text-muted/80 leading-relaxed serif italic">
              &ldquo;代码是写给人看的，顺便给机器执行。&rdquo; —— 这里的每一篇文章都致力于清晰的表达。
            </p>
          </div>
        </aside>

        {/* 右侧主内容区域 - 可滚动 */}
        <main 
          ref={mainRef}
          className="flex-1 min-w-0 overflow-y-auto py-4 lg:pl-6 lg:border-l border-card-border/30 scrollbar-hide flex flex-col"
        >
          {selectedArticleId && selectedArticle ? (
            <article className="max-w-4xl">
              {/* 文章头部 */}
              <header className="pb-6 border-b border-card-border/40">
                <div className="flex flex-wrap items-center gap-3 mb-4 text-[10px] text-muted serif tracking-wider uppercase font-bold">
                  <time className="flex items-center gap-1.5 bg-card/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-card-border/50 shadow-xs">
                    <Calendar className="w-3 h-3" />
                    {formatDate(selectedArticle.createdAt)}
                  </time>
                  {selectedArticle.category && (
                    <span className="flex items-center gap-1.5 bg-primary/5 text-primary px-3 py-1.5 rounded-full border border-primary/10 shadow-xs">
                      <Hash className="w-3 h-3" />
                      {selectedArticle.category.name}
                    </span>
                  )}
                </div>
                
                <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-4 serif leading-tight text-foreground tracking-tight">
                  {selectedArticle.title}
                </h2>

                {selectedArticle.excerpt && (
                  <div className="relative mb-4">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/20 rounded-full" />
                    <p className="text-base md:text-lg text-muted/80 serif leading-relaxed italic pl-5 py-0.5">
                      {selectedArticle.excerpt}
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-5 text-[9px] text-muted/40 font-bold uppercase tracking-[0.2em]">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {Math.ceil(selectedArticle.content.length / 400)} min read
                  </span>
                  <span className="w-1 h-1 rounded-full bg-card-border/60" />
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="w-3 h-3" />
                    {selectedArticle.content.length} words
                  </span>
                </div>
              </header>

              <div className="pb-16">
                <div className="max-w-none prose prose-base dark:prose-invert">
                  <TiptapRenderer content={selectedArticle.content} />
                </div>
                
                {/* 底部标签 */}
                {selectedArticle.tags && selectedArticle.tags.length > 0 && (
                  <div className="mt-16 pt-8 border-t border-card-border/60">
                    <div className="flex flex-wrap gap-3">
                      {selectedArticle.tags.map((tag: string) => (
                        <span key={tag} className="text-[10px] font-bold uppercase tracking-[0.2em] bg-card-border/40 hover:bg-card-border/60 px-3 py-1.5 rounded-lg text-muted transition-colors cursor-default">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </article>
          ) : articleLoading ? (
            <div className="max-w-4xl bg-card/40 border border-card-border rounded-2xl p-12 animate-pulse space-y-8">
              <div className="space-y-3">
                <div className="h-5 w-28 bg-card-border/60 rounded-full" />
                <div className="h-10 w-3/4 bg-card-border/60 rounded-xl" />
              </div>
              <div className="h-6 w-full bg-card-border/40 rounded-lg" />
              <div className="space-y-4 pt-8">
                <div className="h-4 w-full bg-card-border/30 rounded-lg" />
                <div className="h-4 w-full bg-card-border/30 rounded-lg" />
                <div className="h-4 w-2/3 bg-card-border/30 rounded-lg" />
              </div>
            </div>
          ) : (
            <>
              {/* 桌面端：显示引导 */}
              <div className="hidden lg:flex flex-1 items-center justify-center">
                <div className="bg-card/10 border border-card-border/30 rounded-2xl p-12 md:p-20 text-center">
                  <div className="max-w-sm mx-auto space-y-6">
                    <div className="w-20 h-20 bg-primary/5 rounded-2xl flex items-center justify-center mx-auto border border-primary/10 rotate-3">
                      <BookOpen className="w-8 h-8 text-primary opacity-30 -rotate-3" />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-2xl font-bold serif text-foreground/80 tracking-tight">开始阅读</h3>
                      <p className="text-muted/60 serif italic text-lg leading-relaxed">
                        从左侧选择一篇文章开始阅读
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 移动端：显示文章列表或提示 */}
              <div className="lg:hidden pb-8">
                <h2 className="text-xl font-bold serif mb-4">全部文章</h2>
                {initialPosts.length > 0 ? (
                  <div className="space-y-3">
                    {initialPosts.map((post) => (
                      <button
                        key={post.id}
                        onClick={() => handleSelectArticle(post.id)}
                        className="w-full text-left p-4 bg-card/50 border border-card-border/50 rounded-xl hover:border-primary/30 transition-all"
                      >
                        <div className="flex items-start gap-3">
                          <FileText className="w-5 h-5 text-primary/60 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-foreground mb-1 line-clamp-2">{post.title}</h3>
                            {post.excerpt && (
                              <p className="text-sm text-muted/60 line-clamp-2 mb-2">{post.excerpt}</p>
                            )}
                            <div className="flex items-center gap-2 text-xs text-muted/50">
                              <span>{new Date(post.createdAt).toLocaleDateString('zh-CN')}</span>
                              {post.category && (
                                <>
                                  <span>·</span>
                                  <span className="text-primary/70">{post.category.name}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 bg-primary/5 rounded-2xl flex items-center justify-center mx-auto border border-primary/10 mb-4">
                      <BookOpen className="w-7 h-7 text-primary/40" />
                    </div>
                    <p className="text-muted/60 mb-4">暂无文章</p>
                    <button
                      onClick={() => setShowMobileSidebar(true)}
                      className="text-sm text-primary font-medium flex items-center gap-2"
                    >
                      <Layout className="w-4 h-4" />
                      打开文章目录
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

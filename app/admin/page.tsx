/*
 * :file description: 
 * :name: /ink-and-code/app/admin/page.tsx
 * :author: PTC
 * :copyright: (c) 2026, Tungee
 * :date created: 2026-01-29 19:16:00
 * :last editor: PTC
 * :date last edited: 2026-02-02 13:55:48
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { mutate } from 'swr';
import { useSession, signOut } from 'next-auth/react';
import {
  useArticle,
  useCreateArticle,
  useUpdateArticle,
  useDeleteArticle,
  useCategoryList,
} from '@/lib/hooks';
import { ApiError } from '@/lib/fetcher';
import { Trash2, Home, Tag, Layout, FilePlus, PanelLeftClose, PanelLeft, LogOut, User, Settings } from 'lucide-react';
import DocTree from '@/app/components/DocTree';
import { useConfirm } from '@/app/components/ConfirmDialog';

// 动态导入 Tiptap 编辑器
const TiptapEditor = dynamic(() => import('@/app/components/TiptapEditor'), {
  ssr: false,
  loading: () => <div className="h-96 bg-card-border/20 rounded-lg animate-pulse" />,
});

interface PostForm {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  tags: string;
  published: boolean;
  categoryId: string;
}

const initialForm: PostForm = {
  title: '',
  slug: '',
  content: '',
  excerpt: '',
  tags: '',
  published: false,
  categoryId: '',
};

export default function AdminPage() {
  // 确认弹窗
  const confirm = useConfirm();

  // 使用 NextAuth session 进行认证
  const { data: session, status } = useSession();
  const isAuthenticated = !!session?.user;
  const isCheckingAuth = status === 'loading';

  // 侧边栏状态（根据屏幕尺寸初始化）
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // 服务端渲染时默认折叠
    if (typeof window === 'undefined') return true;
    // 客户端：桌面端默认展开，移动端默认折叠
    return window.innerWidth < 768;
  });

  // 选中状态
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'category' | 'article' | null>(null);

  // 表单状态
  const [form, setForm] = useState<PostForm>(initialForm);
  const [hasChanges, setHasChanges] = useState(false);
  const formRef = useRef(form);
  const selectedIdRef = useRef(selectedId);

  // 消息提示
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // SWR Hooks
  const { data: articleData, isLoading: articleLoading } = useArticle(
    selectedType === 'article' ? selectedId : null
  );
  const { data: _categories } = useCategoryList();
  const { trigger: createArticle, isMutating: isCreating } = useCreateArticle();
  const { trigger: updateArticle, isMutating: isUpdating } = useUpdateArticle();
  const { trigger: deleteArticle } = useDeleteArticle();

  const isSaving = isCreating || isUpdating;

  // 同步 ref
  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // 加载文章数据到表单
  useEffect(() => {
    if (articleData && selectedId && articleData.id === selectedId) {
      queueMicrotask(() => {
        setForm({
          title: articleData.title,
          slug: articleData.slug,
          content: articleData.content,
          excerpt: articleData.excerpt || '',
          tags: articleData.tags.join(', '),
          published: articleData.published,
          categoryId: articleData.categoryId || '',
        });
        setHasChanges(false);
      });
    }
  }, [articleData, selectedId]);

  // Cmd+S / Ctrl+S 保存快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        // 使用 ref 获取最新状态
        if (selectedIdRef.current && formRef.current.title.trim()) {
          // 触发保存
          const saveBtn = document.querySelector('[data-save-btn]') as HTMLButtonElement;
          if (saveBtn && !saveBtn.disabled) {
            saveBtn.click();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 显示消息
  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 2000);
  }, []);

  // 检查是否是 401 错误
  const isUnauthorizedError = useCallback((error: unknown): boolean => {
    return error instanceof ApiError && error.code === 401;
  }, []);

  // 处理未授权错误
  const handleUnauthorized = useCallback(() => {
    showMessage('error', '操作失败，请重新登录');
  }, [showMessage]);

  // 生成 slug
  const generateSlug = useCallback((title: string) => {
    if (!title.trim()) return `post-${Date.now()}`;
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-') || `post-${Date.now()}`;
  }, []);

  // 自动保存
  const autoSave = useCallback(async () => {
    const currentForm = formRef.current;
    const currentId = selectedIdRef.current;

    if (!currentId || !currentForm.title.trim()) return;

    const postData = {
      id: currentId,
      title: currentForm.title,
      slug: currentForm.slug || generateSlug(currentForm.title),
      content: currentForm.content,
      excerpt: currentForm.excerpt,
      tags: currentForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
      published: currentForm.published,
      categoryId: currentForm.categoryId || null,
    };

    try {
      await updateArticle(postData);
      mutate((key) => typeof key === 'string' && key.startsWith('/api/article'));
    } catch (error) {
      console.error('Auto-save failed:', error);
      if (isUnauthorizedError(error)) {
        handleUnauthorized();
      }
    }
  }, [updateArticle, generateSlug, isUnauthorizedError, handleUnauthorized]);

  // 退出登录
  const handleLogout = () => {
    signOut({ callbackUrl: '/' });
  };

  // 处理表单变化
  const handleFormChange = (field: keyof PostForm, value: string | boolean) => {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };
      return updated;
    });
    setHasChanges(true);
  };

  // 选择文档（切换时自动保存）
  const handleSelect = async (id: string | null, type: 'category' | 'article' | null) => {
    // 如果选择的是同一个文章，不做任何操作
    if (id === selectedId && type === selectedType) return;

    // 自动保存当前文章
    if (hasChanges && selectedId && selectedType === 'article') {
      await autoSave();
    }

    // 切换文章时清空表单，等待新数据加载
    if (type === 'article' && id !== selectedId) {
      setForm(initialForm);
    } else if (type !== 'article') {
      setForm(initialForm);
    }

    setSelectedId(id);
    setSelectedType(type);
    setHasChanges(false);
  };

  // 新建文章（立即创建）
  const handleAddArticle = async (categoryId: string | null) => {
    // 自动保存当前文章
    if (hasChanges && selectedId && selectedType === 'article') {
      await autoSave();
    }

    try {
      const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const result = await createArticle({
        title: '无标题文档',
        slug: `post-${uniqueId}`,
        content: '',
        published: false,
        categoryId: categoryId || null,
      });

      if (result) {
        const newId = (result as { id: string }).id;
        setSelectedId(newId);
        setSelectedType('article');
        setHasChanges(false);
        mutate((key) => typeof key === 'string' && key.startsWith('/api/article'));
        showMessage('success', '已创建新文档');
      }
    } catch (error) {
      console.error('Failed to create article:', error);
      if (isUnauthorizedError(error)) {
        handleUnauthorized();
        return;
      }
      const errorMessage = error instanceof Error ? error.message : '创建失败';
      showMessage('error', errorMessage);
    }
  };

  // 删除文章
  const handleDeleteArticle = async (id: string) => {
    const confirmed = await confirm({
      title: '删除文章',
      description: '确定要删除这篇文章吗？此操作无法撤销。',
      confirmText: '删除',
      cancelText: '取消',
      variant: 'destructive',
    });
    if (!confirmed) return;
    try {
      await deleteArticle({ id });
      showMessage('success', '已删除');
      mutate((key) => typeof key === 'string' && key.startsWith('/api/article'));
      if (selectedId === id) {
        setSelectedId(null);
        setSelectedType(null);
        setForm(initialForm);
      }
    } catch (error) {
      console.error('Failed to delete:', error);
      if (isUnauthorizedError(error)) {
        handleUnauthorized();
        return;
      }
      showMessage('error', '删除失败');
    }
  };

  // 手动保存
  const handleSave = async () => {
    if (!selectedId || !form.title.trim()) {
      showMessage('error', '请输入标题');
      return;
    }

    const postData = {
      id: selectedId,
      title: form.title,
      slug: form.slug || generateSlug(form.title),
      content: form.content,
      excerpt: form.excerpt,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      published: form.published,
      categoryId: form.categoryId || null,
    };

    try {
      await updateArticle(postData);
      setHasChanges(false);
      mutate((key) => typeof key === 'string' && key.startsWith('/api/article'));
      showMessage('success', '已保存');
    } catch (error) {
      console.error('Failed to save:', error);
      if (isUnauthorizedError(error)) {
        handleUnauthorized();
        return;
      }
      showMessage('error', '保存失败');
    }
  };

  // 检查认证状态中
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-10 h-10 border-2 border-primary/10 rounded-full" />
            <div className="w-10 h-10 border-t-2 border-primary rounded-full animate-spin absolute inset-0" />
          </div>
          <p className="text-[10px] font-bold text-muted/40 uppercase tracking-[0.3em]">正在验证...</p>
        </div>
      </div>
    );
  }

  // 未认证 - 显示登录提示
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 pt-20">
        <div className="bg-glow" />
        <div className="w-full max-w-sm animate-in fade-in zoom-in-95 duration-500">
          <div className="bg-card/40 backdrop-blur-xl border border-card-border/60 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl -mr-10 -mt-10 rounded-full" />

            <div className="relative z-10">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 border border-primary/20 shadow-sm">
                <User className="w-7 h-7 text-primary" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight mb-2">需要登录</h1>
              <p className="text-muted/60 text-sm mb-8 serif italic">请登录后访问管理后台</p>

              <Link
                href="/login"
                className="block w-full py-4 bg-primary text-primary-foreground rounded-2xl text-[11px] font-extrabold uppercase tracking-[0.2em] hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-[0.98] shadow-md text-center"
              >
                前往登录
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const showEditor = selectedType === 'article' && selectedId;

  return (
    <div className="fixed inset-0 top-20 flex overflow-hidden bg-background">
      {/* 移动端遮罩层 */}
      {!sidebarCollapsed && (
        <div 
          className="md:hidden fixed inset-0 top-20 bg-black/50 z-40"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      {/* 左侧侧边栏 */}
      <aside className={`
        border-r border-card-border bg-card/95 md:bg-card/20 backdrop-blur-md flex flex-col shrink-0 shadow-[1px_0_10px_rgba(0,0,0,0.02)] transition-all duration-300
        fixed md:static top-20 md:top-auto bottom-0 md:bottom-auto left-0 z-50 md:z-auto h-auto md:h-full
        ${sidebarCollapsed ? 'w-0 overflow-hidden border-r-0 -translate-x-full md:translate-x-0' : 'w-72 translate-x-0'}
      `}>
        <div className="flex-1 overflow-hidden flex flex-col w-72">
          <div className="p-5 border-b border-card-border/40 bg-card/10 flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted/50">
              工作空间
            </h2>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
              <span className="text-[10px] font-medium text-muted/40 uppercase tracking-widest">在线</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <DocTree
              selectedId={selectedId}
              selectedType={selectedType}
              onSelect={(id, type) => {
                handleSelect(id, type);
                // 移动端选择文章后自动关闭侧边栏（文件夹不关闭）
                if (type === 'article' && window.innerWidth < 768) {
                  setSidebarCollapsed(true);
                }
              }}
              onAddArticle={(categoryId) => {
                handleAddArticle(categoryId);
                // 移动端创建后自动关闭侧边栏
                if (window.innerWidth < 768) {
                  setSidebarCollapsed(true);
                }
              }}
              onDeleteArticle={handleDeleteArticle}
            />
          </div>
        </div>

        {/* 底部功能栏 */}
        <div className="p-5 border-t border-card-border/40 bg-card/20 w-72">
          {/* 用户信息 */}
          {session?.user && (
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-card-border/40">
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  className="w-9 h-9 rounded-xl ring-2 ring-card-border cursor-pointer hover:ring-primary/50 transition-all"
                />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center ring-2 ring-card-border cursor-pointer hover:ring-primary/50 transition-all">
                  <User className="w-4 h-4 text-primary" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{session.user.name || '用户'}</p>
                <p className="text-[10px] text-muted truncate">{session.user.email}</p>
              </div>
            </div>
          )}
          <div className="mb-3">
            <Link
              href="/admin/settings"
              className="flex items-center justify-center gap-2 px-3 py-3 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl transition-all shadow-sm"
            >
              <Settings className="w-4 h-4" />
              <span>设置</span>
            </Link>
            <p className="text-[10px] text-muted text-center mt-1.5">创建专属链接，配置图床</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/"
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted hover:text-foreground hover:bg-card-border/40 rounded-xl transition-all border border-card-border/40 bg-background/40 shadow-sm"
            >
              <Home className="w-3.5 h-3.5" />
              <span>首页</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center w-11 h-11 text-muted hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all border border-card-border/40 bg-background/40 shadow-sm"
              title="退出登录"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* 侧边栏切换按钮 - 桌面端 */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-30 items-center justify-center w-6 h-12 bg-card/80 backdrop-blur-sm border border-card-border/60 rounded-r-lg shadow-sm hover:bg-card transition-all"
        style={{ left: sidebarCollapsed ? 0 : 'calc(18rem - 1px)' }}
        title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
      >
        {sidebarCollapsed ? (
          <PanelLeft className="w-3.5 h-3.5 text-muted" />
        ) : (
          <PanelLeftClose className="w-3.5 h-3.5 text-muted" />
        )}
      </button>

      {/* 移动端侧边栏切换按钮 - 固定在左下角 */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="md:hidden fixed left-4 bottom-4 z-30 flex items-center justify-center w-12 h-12 bg-primary text-primary-foreground rounded-full shadow-lg shadow-primary/30"
      >
        {sidebarCollapsed ? (
          <PanelLeft className="w-5 h-5" />
        ) : (
          <PanelLeftClose className="w-5 h-5" />
        )}
      </button>

      {/* 右侧主工作区 */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_50%,rgba(var(--primary),0.02),transparent)]">
        {showEditor ? (
          <>
            {/* 增强型顶部工具栏 */}
            <div className="border-b border-card-border/40 shrink-0 bg-background/60 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] z-10">
              {/* 桌面端布局 */}
              <div className="hidden md:flex h-16 items-center justify-between px-8">
                <div className="flex items-center gap-5">
                  {/* 发布状态 */}
                  <div
                    className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-[0.15em] transition-all shadow-sm border ${form.published
                        ? 'bg-green-500/5 text-green-500 border-green-500/20 shadow-green-500/5'
                        : 'bg-yellow-500/5 text-yellow-500 border-yellow-500/20 shadow-yellow-500/5'
                      }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${form.published ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    <span>{form.published ? '已发布' : '草稿模式'}</span>
                  </div>

                  {/* 标签 */}
                  <div className="flex items-center gap-2.5 bg-background/40 border border-card-border/60 rounded-xl px-3 group focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/5 transition-all shadow-sm">
                    <Tag className="w-3.5 h-3.5 text-muted/40 group-focus-within:text-primary/60 transition-colors" />
                    <input
                      type="text"
                      value={form.tags}
                      onChange={(e) => handleFormChange('tags', e.target.value)}
                      placeholder="标签 (使用逗号分隔)"
                      className="py-2 bg-transparent border-none text-[11px] font-bold uppercase tracking-wider focus:outline-none w-48 placeholder:text-muted/20"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-5">
                  {/* 状态反馈 */}
                  {message && (
                    <span
                      className={`text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl border animate-in fade-in slide-in-from-right-4 duration-500 ${message.type === 'success'
                          ? 'bg-green-500/5 text-green-500 border-green-500/20'
                          : 'bg-red-500/5 text-red-400 border-red-500/20'
                        }`}
                    >
                      {message.text}
                    </span>
                  )}

                  {/* 保存/发布操作组 */}
                  <div className="flex items-center bg-background/40 border border-card-border/80 rounded-2xl p-1 gap-1 shadow-sm">
                    <button
                      data-save-btn
                      onClick={handleSave}
                      disabled={isSaving || !hasChanges}
                      className={`px-5 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-al cursor-pointer ${hasChanges
                          ? 'bg-primary/10 text-primary hover:bg-primary/20 shadow-sm'
                          : 'text-muted/30 cursor-default opacity-50'
                        }`}
                    >
                      {isSaving ? '正在同步' : hasChanges ? '保存修改' : '已同步'}
                    </button>
                    <button
                      onClick={async () => {
                        const newPublished = !form.published;
                        setForm((prev) => ({ ...prev, published: newPublished }));
                        const postData = {
                          id: selectedId,
                          title: form.title,
                          slug: form.slug || generateSlug(form.title),
                          content: form.content,
                          excerpt: form.excerpt,
                          tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
                          published: newPublished,
                          categoryId: form.categoryId || null,
                        };
                        try {
                          await updateArticle(postData);
                          mutate((key) => typeof key === 'string' && key.startsWith('/api/article'));
                          showMessage('success', newPublished ? '文章已发布' : '文章已存为草稿');
                          setHasChanges(false);
                        } catch (error) {
                          console.error('Failed to publish:', error);
                          if (isUnauthorizedError(error)) {
                            handleUnauthorized();
                            return;
                          }
                          showMessage('error', '操作失败');
                        }
                      }}
                      disabled={isSaving || !form.title.trim()}
                      className={`px-6 py-2 rounded-xl text-[11px] font-extrabold uppercase tracking-[0.2em] transition-all shadow-md active:scale-95 cursor-pointer ${form.published
                          ? 'bg-red-500 text-white hover:bg-red-600 shadow-red-500/20'
                          : 'bg-primary text-primary-foreground hover:shadow-lg hover:shadow-primary/30'
                        }`}
                    >
                      {form.published ? '撤回发布' : '发布文档'}
                    </button>
                  </div>

                  <button
                    onClick={() => handleDeleteArticle(selectedId)}
                    className="w-11 h-11 flex items-center justify-center text-muted hover:text-red-400 hover:bg-red-500/10 rounded-2xl transition-all border border-card-border/40 bg-background/40 shadow-sm"
                    title="彻底删除此文档"
                  >
                    <Trash2 className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>

              {/* 移动端布局 */}
              <div className="md:hidden px-4 py-3 space-y-3">
                {/* 第一行：状态 + 操作按钮 */}
                <div className="flex items-center justify-between gap-3">
                  {/* 发布状态 */}
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all shadow-sm border shrink-0 ${form.published
                        ? 'bg-green-500/5 text-green-500 border-green-500/20'
                        : 'bg-yellow-500/5 text-yellow-500 border-yellow-500/20'
                      }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${form.published ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    <span>{form.published ? '已发布' : '草稿'}</span>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2">
                    {/* 状态反馈 */}
                    {message && (
                      <span
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg ${message.type === 'success'
                            ? 'bg-green-500/10 text-green-500'
                            : 'bg-red-500/10 text-red-400'
                          }`}
                      >
                        {message.text}
                      </span>
                    )}
                    
                    <button
                      data-save-btn
                      onClick={handleSave}
                      disabled={isSaving || !hasChanges}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${hasChanges
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted/30 opacity-50'
                        }`}
                    >
                      {isSaving ? '同步中' : hasChanges ? '保存' : '已同步'}
                    </button>
                    
                    <button
                      onClick={async () => {
                        const newPublished = !form.published;
                        setForm((prev) => ({ ...prev, published: newPublished }));
                        const postData = {
                          id: selectedId,
                          title: form.title,
                          slug: form.slug || generateSlug(form.title),
                          content: form.content,
                          excerpt: form.excerpt,
                          tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
                          published: newPublished,
                          categoryId: form.categoryId || null,
                        };
                        try {
                          await updateArticle(postData);
                          mutate((key) => typeof key === 'string' && key.startsWith('/api/article'));
                          showMessage('success', newPublished ? '已发布' : '已存为草稿');
                          setHasChanges(false);
                        } catch (error) {
                          console.error('Failed to publish:', error);
                          if (isUnauthorizedError(error)) {
                            handleUnauthorized();
                            return;
                          }
                          showMessage('error', '操作失败');
                        }
                      }}
                      disabled={isSaving || !form.title.trim()}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${form.published
                          ? 'bg-red-500 text-white'
                          : 'bg-primary text-primary-foreground'
                        }`}
                    >
                      {form.published ? '撤回' : '发布'}
                    </button>

                    <button
                      onClick={() => handleDeleteArticle(selectedId)}
                      className="w-8 h-8 flex items-center justify-center text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 第二行：标签输入 */}
                <div className="flex items-center gap-2 bg-background/40 border border-card-border/60 rounded-lg px-3">
                  <Tag className="w-3.5 h-3.5 text-muted/40 shrink-0" />
                  <input
                    type="text"
                    value={form.tags}
                    onChange={(e) => handleFormChange('tags', e.target.value)}
                    placeholder="标签 (逗号分隔)"
                    className="flex-1 py-2 bg-transparent border-none text-xs focus:outline-none placeholder:text-muted/30"
                  />
                </div>
              </div>
            </div>

            {/* 编辑容器 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-white/[0.02] relative">
              {articleLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-6">
                  <div className="relative">
                    <div className="w-12 h-12 border-2 border-primary/10 rounded-full" />
                    <div className="w-12 h-12 border-t-2 border-primary rounded-full animate-spin absolute inset-0" />
                  </div>
                  <p className="text-[10px] font-bold text-muted/40 uppercase tracking-[0.3em] animate-pulse">正在载入资源...</p>
                </div>
              ) : (
                <div className="mx-auto pb-12">
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    <div className="min-h-[600px] relative">
                      <TiptapEditor
                        key={selectedId || 'new'}
                        content={form.content}
                        onChange={(json) => handleFormChange('content', json)}
                        placeholder="开始在 Ink & Code 记录你的灵感..."
                        headerContent={
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={form.title}
                              onChange={(e) => handleFormChange('title', e.target.value)}
                              placeholder="请输入标题..."
                              className="w-full text-4xl font-extrabold bg-transparent border-none focus:outline-none placeholder:text-muted/10 text-foreground tracking-tight leading-[1.1]"
                            />
                            <div className="relative group/excerpt mt-4">
                              <div className="absolute top-0 bottom-0 w-1 bg-primary/10 rounded-full group-focus-within/excerpt:bg-primary/30 transition-colors" />
                              <textarea
                                value={form.excerpt}
                                onChange={(e) => handleFormChange('excerpt', e.target.value)}
                                placeholder="添加简短摘要描述（可选）"
                                rows={1}
                                className="w-full ml-4 text-lg text-muted/50 bg-transparent border-none focus:outline-none placeholder:text-muted/10 serif italic leading-relaxed resize-none"
                              />
                            </div>
                          </div>
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* 空白引导页 */
          <div className="flex-1 flex flex-col items-center justify-center gap-12 animate-in zoom-in-95 duration-700">
            <div className="relative group">
              <div className="absolute inset-0 bg-primary/20 blur-[100px] rounded-full group-hover:bg-primary/30 transition-all duration-1000" />
              <div className="relative w-40 h-40 bg-card border-2 border-card-border rounded-[3rem] flex items-center justify-center shadow-2xl rotate-6 transition-transform group-hover:rotate-3 duration-500">
                <Layout className="w-16 h-16 text-primary opacity-20 -rotate-6 group-hover:-rotate-3 transition-transform" />
              </div>
              <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center shadow-xl shadow-primary/20 rotate-12 group-hover:rotate-6 transition-transform">
                <FilePlus className="w-8 h-8" />
              </div>
            </div>
            <div className="text-center space-y-6">
              <h3 className="text-3xl font-extrabold text-foreground tracking-tighter italic serif">
                Ink & Code Workspace
              </h3>
              <div className="space-y-2">
                <p className="text-[11px] text-muted/40 font-bold uppercase tracking-[0.4em] leading-relaxed">
                  选择现有文档进行编辑<br />或者点击左侧按钮开启新灵感
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

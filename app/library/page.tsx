/*
 * :file description: 
 * :name: /ink-and-code/app/library/page.tsx
 * :author: PTC
 * :copyright: (c) 2026, Tungee
 * :date created: 2026-02-07 11:33:11
 * :last editor: PTC
 * :date last edited: 2026-02-12 17:05:55
 */
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen, Upload, Search, X, Trash2, Clock, Library,
  Grid3X3, List, SortAsc, FileText, Loader2, AlertTriangle,
  BookMarked, Info, CheckCircle2, XCircle, ImageIcon, Highlighter
} from 'lucide-react';
import { useBookList, useUploadBook, useDeleteBook, useLibraryRole } from '@/lib/hooks/use-library';

/* ============================================
   常量 & 工具
   ============================================ */

const FORMAT_COLORS: Record<string, string> = {
  epub: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20',
  pdf: 'bg-red-500/15 text-red-600 border-red-500/20',
  txt: 'bg-gray-500/15 text-gray-600 border-gray-500/20',
  md: 'bg-blue-500/15 text-blue-600 border-blue-500/20',
  html: 'bg-orange-500/15 text-orange-600 border-orange-500/20',
  docx: 'bg-indigo-500/15 text-indigo-600 border-indigo-500/20',
  mobi: 'bg-amber-500/15 text-amber-600 border-amber-500/20',
  azw3: 'bg-amber-500/15 text-amber-600 border-amber-500/20',
};

const FORMAT_BADGE_COLORS: Record<string, string> = {
  epub: 'bg-emerald-600',
  pdf: 'bg-red-600',
  txt: 'bg-gray-500',
  md: 'bg-blue-600',
  html: 'bg-orange-600',
  docx: 'bg-indigo-600',
  mobi: 'bg-amber-600',
  azw3: 'bg-amber-600',
};

const SUPPORTED_FORMATS = [
  { ext: 'EPUB', desc: '电子书格式，推荐', recommended: true },
  { ext: 'PDF', desc: '文档格式', recommended: true },
  { ext: 'TXT', desc: '纯文本', recommended: false },
  { ext: 'MD', desc: 'Markdown', recommended: false },
  { ext: 'HTML', desc: '网页格式', recommended: false },
  { ext: 'DOCX', desc: 'Word 文档，需转换', recommended: false },
  { ext: 'MOBI', desc: 'Kindle 格式，需 Calibre 转换', recommended: false },
  { ext: 'AZW3', desc: 'Kindle 格式，需 Calibre 转换', recommended: false },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatReadTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/* ============================================
   自定义确认弹窗组件
   ============================================ */

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  open, title, message, confirmText = '确认', cancelText = '取消',
  variant = 'danger', onConfirm, onCancel,
}: ConfirmDialogProps) {
  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      {/* 弹窗 */}
      <div className="relative bg-card border border-card-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            variant === 'danger' ? 'bg-red-500/10' : 'bg-amber-500/10'
          }`}>
            <AlertTriangle className={`w-5 h-5 ${
              variant === 'danger' ? 'text-red-500' : 'text-amber-500'
            }`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-foreground mb-1">{title}</h3>
            <p className="text-sm text-muted/70 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-muted/70 hover:text-foreground hover:bg-card-border/30 rounded-xl transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-bold text-white rounded-xl transition-all ${
              variant === 'danger'
                ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20'
                : 'bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-500/20'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================
   Toast 提示组件
   ============================================ */

interface ToastItem {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

function Toast({ toast, onRemove }: { toast: ToastItem; onRemove: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onRemove, 4000);
    return () => clearTimeout(timer);
  }, [onRemove]);

  const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? XCircle : Info;
  const colors = toast.type === 'success'
    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700'
    : toast.type === 'error'
    ? 'bg-red-500/10 border-red-500/30 text-red-700'
    : 'bg-blue-500/10 border-blue-500/30 text-blue-700';

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-lg ${colors} animate-in slide-in-from-top-2 fade-in duration-300`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="text-sm font-medium flex-1">{toast.message}</span>
      <button onClick={onRemove} className="opacity-50 hover:opacity-100 transition-opacity">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ============================================
   上传说明弹窗
   ============================================ */

function UploadHintDialog({ open, onClose, onSelectFiles }: {
  open: boolean;
  onClose: () => void;
  onSelectFiles: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-card-border rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
              <Upload className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-base font-bold">上传电子书</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-card-border/30 transition-colors">
            <X className="w-4 h-4 text-muted/50" />
          </button>
        </div>

        <div className="space-y-4">
          {/* 支持的格式 */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted/50 mb-2.5">支持的文件格式</h4>
            <div className="grid grid-cols-2 gap-1.5">
              {SUPPORTED_FORMATS.map(({ ext, desc, recommended }) => (
                <div key={ext} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-card-border/20">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    recommended ? 'bg-primary/15 text-primary' : 'bg-card-border/40 text-muted/60'
                  }`}>
                    .{ext}
                  </span>
                  <span className="text-xs text-muted/60">{desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 注意事项 */}
          <div className="p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl">
            <h4 className="text-xs font-bold text-amber-700 mb-1.5 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              注意事项
            </h4>
            <ul className="text-xs text-amber-700/80 space-y-1 leading-relaxed">
              <li>- 推荐上传 EPUB 和 PDF 格式，阅读体验最佳</li>
              <li>- MOBI/AZW3 格式需要服务器安装 Calibre 进行转换</li>
              <li>- 单个文件大小建议不超过 100MB</li>
              <li>- 支持批量上传多个文件</li>
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted/70 hover:text-foreground hover:bg-card-border/30 rounded-xl transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => { onClose(); onSelectFiles(); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            <Upload className="w-4 h-4" />
            选择文件
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================
   图书馆主页
   ============================================ */

export default function LibraryPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<string>('recent');

  // 搜索防抖 300ms
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search]);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 弹窗状态
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    bookId: string;
    bookTitle: string;
  }>({ open: false, bookId: '', bookTitle: '' });
  const [showUploadHint, setShowUploadHint] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);

  const { books, isLoading, mutate } = useBookList(debouncedSearch, sort);
  const { upload, isUploading, progress, uploadPhase } = useUploadBook();
  const { deleteBook } = useDeleteBook();
  const { canUpload, canDelete } = useLibraryRole();
  const [isExtractingCovers, setIsExtractingCovers] = useState(false);

  // Toast 工具
  const addToast = useCallback((type: ToastItem['type'], message: string) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, type, message }]);
  }, []);

  // 提取已有 EPUB 封面
  const handleExtractCovers = useCallback(async () => {
    setIsExtractingCovers(true);
    try {
      const res = await fetch('/api/library/extract-covers', {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json();
      if (json.code === 200) {
        addToast('success', json.message);
        mutate();
      } else {
        addToast('error', json.message || '提取封面失败');
      }
    } catch {
      addToast('error', '提取封面失败');
    } finally {
      setIsExtractingCovers(false);
    }
  }, [mutate, addToast]);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);

    // 验证文件类型
    const validExts = new Set(['epub', 'pdf', 'txt', 'md', 'markdown', 'html', 'htm', 'docx', 'mobi', 'azw3', 'azw']);
    const invalidFiles = fileArray.filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      return !validExts.has(ext);
    });

    if (invalidFiles.length > 0) {
      addToast('error', `不支持的文件格式：${invalidFiles.map(f => f.name).join(', ')}`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // 并发上传，限制同时 3 个
    const concurrency = 3;
    const errors: string[] = [];
    let successCount = 0;

    for (let i = 0; i < fileArray.length; i += concurrency) {
      const batch = fileArray.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map((file) => upload(file))
      );
      results.forEach((r, idx) => {
        if (r.status === 'rejected') {
          const name = batch[idx].name;
          const msg = r.reason instanceof Error ? r.reason.message : '上传失败';
          errors.push(`${name}: ${msg}`);
        } else {
          successCount++;
        }
      });
    }

    if (successCount > 0) {
      addToast('success', `成功上传 ${successCount} 本书`);
    }
    if (errors.length > 0) {
      addToast('error', `${errors.length} 个文件上传失败`);
      console.error('Upload errors:', errors);
    }

    mutate();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [upload, mutate, addToast]);

  const handleDeleteClick = useCallback((id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDialog({ open: true, bookId: id, bookTitle: title });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    const { bookId, bookTitle } = confirmDialog;
    setConfirmDialog({ open: false, bookId: '', bookTitle: '' });
    setDeletingId(bookId);
    try {
      await deleteBook({ id: bookId });
      addToast('success', `《${bookTitle}》已删除`);
      mutate();
    } catch (err) {
      console.error('Delete failed:', err);
      addToast('error', '删除失败，请重试');
    } finally {
      setDeletingId(null);
    }
  }, [confirmDialog, deleteBook, mutate, addToast]);

  const handleOpenBook = (id: string) => {
    router.push(`/library/read/${id}`);
  };

  // 阅读统计
  const totalBooks = books.length;
  const readingBooks = books.filter(b => b.progress && b.progress.percentage > 0 && b.progress.percentage < 100).length;
  const finishedBooks = books.filter(b => b.progress && b.progress.percentage >= 100).length;
  const totalReadTime = books.reduce((sum, b) => sum + (b.progress?.totalReadTime || 0), 0);

  return (
    <div className="min-h-screen pt-20 sm:pt-24 pb-12 bg-background/50">
      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-4 sm:px-6">

        {/* ---- Header：图书馆标题 + 统计 ---- */}
        <div className="mb-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20 shadow-sm">
                  <BookMarked className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold serif tracking-tight">图书馆</h1>
                  <p className="text-xs text-muted/50 mt-0.5">探索与阅读，在文字中寻找灵感</p>
                </div>
              </div>
            </div>

            {/* 上传按钮 — 仅开发者/管理员可见 */}
            {canUpload && (
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".epub,.pdf,.txt,.md,.markdown,.html,.htm,.docx,.mobi,.azw3,.azw"
                  multiple
                  onChange={(e) => handleUpload(e.target.files)}
                />
                {isUploading ? (
                  <div className="flex items-center gap-3 px-5 py-2.5 bg-card/80 border border-card-border/60 rounded-xl min-w-[220px]">
                    <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-foreground/80">
                          {uploadPhase === 'processing' ? '服务端处理中...' : '上传中'}
                        </span>
                        <span className="text-[10px] font-bold text-primary tabular-nums">
                          {progress}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-card-border/40 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ease-out ${
                            uploadPhase === 'processing'
                              ? 'bg-amber-500 animate-pulse'
                              : 'bg-primary'
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* 提取封面按钮 — 有无封面 EPUB 时显示 */}
                    {books.some(b => b.format === 'epub' && !b.cover) && (
                      <button
                        onClick={handleExtractCovers}
                        disabled={isExtractingCovers}
                        className="flex items-center gap-2 px-4 py-2.5 bg-card border border-card-border/60 rounded-xl text-sm font-medium text-muted hover:text-foreground hover:border-primary/40 transition-all"
                        title="为已有 EPUB 书籍提取封面"
                      >
                        {isExtractingCovers ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ImageIcon className="w-4 h-4" />
                        )}
                        <span>{isExtractingCovers ? '提取中...' : '提取封面'}</span>
                      </button>
                    )}
                    <button
                      onClick={() => setShowUploadHint(true)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:-translate-y-0.5"
                    >
                      <Upload className="w-4 h-4" />
                      <span>上传书籍</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 统计卡片 */}
          {totalBooks > 0 && (
            <div className="flex items-center gap-4 mt-5 flex-wrap">
              <div className="flex items-center gap-2 px-3.5 py-2 bg-card/60 border border-card-border/40 rounded-xl">
                <Library className="w-3.5 h-3.5 text-primary/60" />
                <span className="text-xs font-bold text-foreground/70">{totalBooks} 本</span>
              </div>
              {readingBooks > 0 && (
                <div className="flex items-center gap-2 px-3.5 py-2 bg-card/60 border border-card-border/40 rounded-xl">
                  <BookOpen className="w-3.5 h-3.5 text-blue-500/60" />
                  <span className="text-xs font-bold text-foreground/70">{readingBooks} 在读</span>
                </div>
              )}
              {finishedBooks > 0 && (
                <div className="flex items-center gap-2 px-3.5 py-2 bg-card/60 border border-card-border/40 rounded-xl">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/60" />
                  <span className="text-xs font-bold text-foreground/70">{finishedBooks} 读完</span>
                </div>
              )}
              {totalReadTime > 0 && (
                <div className="flex items-center gap-2 px-3.5 py-2 bg-card/60 border border-card-border/40 rounded-xl">
                  <Clock className="w-3.5 h-3.5 text-amber-500/60" />
                  <span className="text-xs font-bold text-foreground/70">累计 {formatReadTime(totalReadTime)}</span>
                </div>
              )}

              {/* 笔记管理入口 */}
              <button
                onClick={() => router.push('/library/notes')}
                className="flex items-center gap-2 px-3.5 py-2 bg-card/60 border border-card-border/40 rounded-xl hover:bg-primary/8 hover:border-primary/20 hover:text-primary transition-all cursor-pointer group"
              >
                <Highlighter className="w-3.5 h-3.5 text-purple-500/60 group-hover:text-primary transition-colors" />
                <span className="text-xs font-bold text-foreground/70 group-hover:text-primary transition-colors">笔记管理</span>
              </button>
            </div>
          )}
        </div>

        {/* ---- 搜索 & 排序工具栏 ---- */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-8">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/40" />
            <input
              type="text"
              placeholder="搜索书名或作者..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 bg-card/50 border border-card-border/60 rounded-xl text-sm placeholder:text-muted/40 focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted/40 hover:text-muted"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-card/50 border border-card-border/60 rounded-xl overflow-hidden">
              <button
                onClick={() => setSort('recent')}
                title="最近阅读"
                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                  sort === 'recent' ? 'bg-primary/10 text-primary' : 'text-muted/60 hover:text-muted'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setSort('title')}
                title="按书名排序"
                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                  sort === 'title' ? 'bg-primary/10 text-primary' : 'text-muted/60 hover:text-muted'
                }`}
              >
                <SortAsc className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setSort('added')}
                title="最近添加"
                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                  sort === 'added' ? 'bg-primary/10 text-primary' : 'text-muted/60 hover:text-muted'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center bg-card/50 border border-card-border/60 rounded-xl overflow-hidden">
              <button
                onClick={() => setView('grid')}
                title="网格视图"
                className={`px-3 py-2 transition-colors ${
                  view === 'grid' ? 'bg-primary/10 text-primary' : 'text-muted/60 hover:text-muted'
                }`}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setView('list')}
                title="列表视图"
                className={`px-3 py-2 transition-colors ${
                  view === 'list' ? 'bg-primary/10 text-primary' : 'text-muted/60 hover:text-muted'
                }`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ---- 书籍列表 ---- */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-3/4 bg-card-border/30 rounded-xl mb-3" />
                <div className="h-4 bg-card-border/30 rounded w-3/4 mb-2" />
                <div className="h-3 bg-card-border/20 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : books.length === 0 ? (
          /* ---- 空状态 ---- */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="relative mb-8">
              {/* 装饰性书籍堆叠 */}
              <div className="absolute -left-8 -top-4 w-16 h-20 bg-card-border/20 rounded-lg -rotate-12 border border-card-border/30" />
              <div className="absolute -right-6 -top-2 w-14 h-18 bg-card-border/15 rounded-lg rotate-[8deg] border border-card-border/20" />
              <div className="relative w-20 h-24 bg-primary/8 rounded-xl flex items-center justify-center border border-primary/15 shadow-lg">
                <BookOpen className="w-8 h-8 text-primary/40" />
              </div>
            </div>
            <h3 className="text-xl font-bold serif text-foreground/80 mb-2">
              {search ? '未找到相关书籍' : '图书馆尚未上架书籍'}
            </h3>
            <p className="text-sm text-muted/50 mb-6 max-w-sm leading-relaxed">
              {search
                ? '试试其他关键词，或浏览全部书籍'
                : canUpload
                  ? '上传你的第一本电子书，开启阅读之旅'
                  : '书籍正在整理中，请稍后再来'
              }
            </p>
            {!search && canUpload && (
              <button
                onClick={() => setShowUploadHint(true)}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
              >
                <Upload className="w-4 h-4" />
                <span>上传电子书</span>
              </button>
            )}
          </div>
        ) : view === 'grid' ? (
          /* ---- 网格视图 ---- */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
            {books.map((book) => (
              <div
                key={book.id}
                onClick={() => handleOpenBook(book.id)}
                className="group cursor-pointer"
              >
                {/* 书封面 — 仿真书脊效果 */}
                <div className="relative aspect-3/4 rounded-xl overflow-hidden mb-3 shadow-md group-hover:shadow-xl transition-all duration-300 group-hover:-translate-y-1.5">
                  {/* 书脊阴影装饰 */}
                  <div className="absolute left-0 top-0 bottom-0 w-3 bg-linear-to-r from-black/15 to-transparent z-10 pointer-events-none" />

                  {book.cover ? (
                    <img src={book.cover} alt={book.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full p-4 text-center bg-linear-to-br from-card via-card to-card-border/40 border border-card-border/60">
                      <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-lg font-bold mb-3 text-white ${FORMAT_BADGE_COLORS[book.format] || 'bg-gray-500'}`}>
                        {book.format.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-xs font-medium text-foreground/80 line-clamp-3 leading-relaxed serif">
                        {book.title}
                      </span>
                      {book.author && (
                        <span className="text-[10px] text-muted/50 mt-1.5 line-clamp-1">
                          {book.author}
                        </span>
                      )}
                    </div>
                  )}

                  {/* 阅读进度条 */}
                  {book.progress && book.progress.percentage > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                      <div
                        className={`h-full transition-all ${book.progress.percentage >= 100 ? 'bg-emerald-500' : 'bg-primary'}`}
                        style={{ width: `${Math.min(100, book.progress.percentage)}%` }}
                      />
                    </div>
                  )}

                  {/* 格式标签 */}
                  <span className={`absolute top-2 left-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-white/90 ${FORMAT_BADGE_COLORS[book.format] || 'bg-gray-500'}`}>
                    {book.format}
                  </span>

                  {/* 删除按钮 — 仅开发者/管理员可见 */}
                  {canDelete && (
                    <button
                      onClick={(e) => handleDeleteClick(book.id, book.title, e)}
                      disabled={deletingId === book.id}
                      className="absolute top-2 right-2 p-1.5 bg-background/80 backdrop-blur-sm rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white border border-card-border/60"
                    >
                      {deletingId === book.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>

                {/* 书信息 */}
                <h3 className="text-sm font-medium text-foreground line-clamp-2 mb-1 group-hover:text-primary transition-colors leading-snug">
                  {book.title}
                </h3>
                <div className="flex items-center gap-2 text-[10px] text-muted/50">
                  {book.author && (
                    <>
                      <span className="truncate max-w-[100px]">{book.author}</span>
                      <span className="w-0.5 h-0.5 rounded-full bg-muted/30 shrink-0" />
                    </>
                  )}
                  <span>{formatFileSize(book.fileSize)}</span>
                  {book.progress && book.progress.totalReadTime > 0 && (
                    <>
                      <span className="w-0.5 h-0.5 rounded-full bg-muted/30 shrink-0" />
                      <span>{formatReadTime(book.progress.totalReadTime)}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ---- 列表视图 ---- */
          <div className="space-y-2">
            {books.map((book) => (
              <div
                key={book.id}
                onClick={() => handleOpenBook(book.id)}
                className="group flex items-center gap-4 p-3 sm:p-4 bg-card/40 border border-card-border/50 rounded-xl hover:border-primary/30 hover:bg-card/60 hover:shadow-md transition-all cursor-pointer"
              >
                {/* 封面缩略图 */}
                <div className="w-12 h-16 sm:w-14 sm:h-[74px] rounded-lg overflow-hidden shrink-0 shadow-sm border border-card-border/40">
                  {book.cover ? (
                    <img src={book.cover} alt={book.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center text-sm font-bold text-white ${FORMAT_BADGE_COLORS[book.format] || 'bg-gray-500'}`}>
                      {book.format.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                    {book.title}
                  </h3>
                  <div className="flex items-center gap-3 text-[10px] text-muted/50 mt-1">
                    {book.author && <span className="truncate max-w-[150px]">{book.author}</span>}
                    <span>{formatFileSize(book.fileSize)}</span>
                    <span className={`uppercase font-bold px-1.5 py-0.5 rounded ${FORMAT_COLORS[book.format] || 'bg-card-border/30'}`}>
                      {book.format}
                    </span>
                  </div>
                </div>

                {/* 进度 */}
                {book.progress && book.progress.percentage > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-16 h-1.5 bg-card-border/30 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${book.progress.percentage >= 100 ? 'bg-emerald-500' : 'bg-primary'}`}
                        style={{ width: `${Math.min(100, book.progress.percentage)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-muted/50 tabular-nums">
                      {Math.round(book.progress.percentage)}%
                    </span>
                  </div>
                )}

                {/* 删除按钮 — 仅开发者/管理员可见 */}
                {canDelete && (
                  <button
                    onClick={(e) => handleDeleteClick(book.id, book.title, e)}
                    disabled={deletingId === book.id}
                    className="p-2 text-muted/30 hover:text-red-500 transition-colors shrink-0"
                  >
                    {deletingId === book.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- 自定义确认弹窗 ---- */}
      <ConfirmDialog
        open={confirmDialog.open}
        title="删除书籍"
        message={`确定要删除《${confirmDialog.bookTitle}》吗？该书的阅读进度、书签和笔记将一并清除，此操作不可撤销。`}
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDialog({ open: false, bookId: '', bookTitle: '' })}
      />

      {/* ---- 上传说明弹窗 ---- */}
      <UploadHintDialog
        open={showUploadHint}
        onClose={() => setShowUploadHint(false)}
        onSelectFiles={() => fileInputRef.current?.click()}
      />

      {/* ---- Toast 提示 ---- */}
      {toasts.length > 0 && (
        <div className="fixed top-20 right-4 z-200 flex flex-col gap-2 max-w-sm">
          {toasts.map(toast => (
            <Toast key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

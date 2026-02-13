'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Highlighter, Search, BookOpen, MessageSquare, ArrowLeft,
  Loader2, X, Check, Trash2, Pencil, Filter, ChevronDown,
} from 'lucide-react';
import { useAllHighlights, type AllHighlightItem } from '@/lib/hooks/use-library';

/* ============================================
   常量
   ============================================ */

const COLOR_MAP: Record<string, { hex: string; bg: string; label: string }> = {
  yellow: { hex: '#eab308', bg: 'bg-yellow-500/15', label: '黄色' },
  green:  { hex: '#22c55e', bg: 'bg-emerald-500/15', label: '绿色' },
  blue:   { hex: '#3b82f6', bg: 'bg-blue-500/15', label: '蓝色' },
  pink:   { hex: '#ec4899', bg: 'bg-pink-500/15', label: '粉色' },
  purple: { hex: '#a855f7', bg: 'bg-purple-500/15', label: '紫色' },
};

const ALL_COLORS = Object.keys(COLOR_MAP);

/* ============================================
   笔记管理页面
   ============================================ */

export default function NotesPage() {
  const router = useRouter();
  const { highlights, isLoading, mutate, updateHighlight, deleteHighlight } = useAllHighlights();

  // ---- 筛选 & 搜索状态 ----
  const [search, setSearch] = useState('');
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [onlyWithNotes, setOnlyWithNotes] = useState(false);
  const [showBookFilter, setShowBookFilter] = useState(false);
  const bookFilterRef = useRef<HTMLDivElement>(null);

  // ---- 编辑状态 ----
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const [editColor, setEditColor] = useState('yellow');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 点击外部关闭书籍筛选
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bookFilterRef.current && !bookFilterRef.current.contains(e.target as Node)) {
        setShowBookFilter(false);
      }
    };
    if (showBookFilter) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showBookFilter]);

  // 编辑时聚焦 textarea
  useEffect(() => {
    if (editingId) {
      setTimeout(() => editTextareaRef.current?.focus(), 100);
    }
  }, [editingId]);

  // ---- 派生数据 ----
  const books = useMemo(() => {
    const map = new Map<string, { id: string; title: string; author: string | null; cover: string | null; count: number }>();
    for (const hl of highlights) {
      if (!map.has(hl.book.id)) {
        map.set(hl.book.id, { ...hl.book, count: 0 });
      }
      map.get(hl.book.id)!.count++;
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [highlights]);

  const filteredHighlights = useMemo(() => {
    let list = highlights;
    if (selectedBook) list = list.filter(h => h.book.id === selectedBook);
    if (selectedColor) list = list.filter(h => h.color === selectedColor);
    if (onlyWithNotes) list = list.filter(h => h.note);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(h =>
        h.text.toLowerCase().includes(q) ||
        (h.note && h.note.toLowerCase().includes(q)) ||
        h.book.title.toLowerCase().includes(q)
      );
    }
    return list;
  }, [highlights, selectedBook, selectedColor, onlyWithNotes, search]);

  // 按书籍分组
  const grouped = useMemo(() => {
    const map = new Map<string, { book: AllHighlightItem['book']; items: AllHighlightItem[] }>();
    for (const hl of filteredHighlights) {
      if (!map.has(hl.book.id)) {
        map.set(hl.book.id, { book: hl.book, items: [] });
      }
      map.get(hl.book.id)!.items.push(hl);
    }
    return Array.from(map.values());
  }, [filteredHighlights]);

  const totalNotes = useMemo(() => highlights.filter(h => h.note).length, [highlights]);

  // ---- 操作回调 ----
  const handleStartEdit = useCallback((hl: AllHighlightItem) => {
    setEditingId(hl.id);
    setEditNote(hl.note ?? '');
    setEditColor(hl.color);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const original = highlights.find(h => h.id === editingId);
      const updates: { color?: string; note?: string } = {};
      if (editColor !== original?.color) updates.color = editColor;
      if (editNote !== (original?.note ?? '')) updates.note = editNote;
      if (Object.keys(updates).length > 0) {
        await updateHighlight({ id: editingId, ...updates });
        await mutate();
      }
    } catch { /* */ }
    setSaving(false);
    setEditingId(null);
  }, [editingId, editNote, editColor, highlights, updateHighlight, mutate]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await deleteHighlight({ id });
      await mutate();
    } catch { /* */ }
    setDeletingId(null);
    if (editingId === id) setEditingId(null);
  }, [deleteHighlight, mutate, editingId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  }, [handleSaveEdit, handleCancelEdit]);

  // ---- 统计数据 ----
  const stats = useMemo(() => {
    const colorCounts: Record<string, number> = {};
    for (const hl of highlights) {
      colorCounts[hl.color] = (colorCounts[hl.color] || 0) + 1;
    }
    return { total: highlights.length, notes: totalNotes, books: books.length, colorCounts };
  }, [highlights, totalNotes, books]);

  const selectedBookInfo = books.find(b => b.id === selectedBook);

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部区域 */}
      <div className="pt-24 sm:pt-28 pb-8 sm:pb-12 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          {/* 返回 + 标题 */}
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => router.push('/library')}
              className="p-2 rounded-xl hover:bg-card-border/30 transition-colors text-muted hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight serif">
                笔记管理
              </h1>
              <p className="text-xs sm:text-sm text-muted mt-0.5">
                你的所有划线与思考，汇聚于此
              </p>
            </div>
          </div>

          {/* 统计卡片 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
            <StatCard
              icon={<Highlighter className="w-4 h-4" />}
              label="总划线"
              value={stats.total}
              accent="text-primary"
            />
            <StatCard
              icon={<MessageSquare className="w-4 h-4" />}
              label="有笔记"
              value={stats.notes}
              accent="text-emerald-500"
            />
            <StatCard
              icon={<BookOpen className="w-4 h-4" />}
              label="涉及书籍"
              value={stats.books}
              accent="text-blue-500"
            />
            <div className="bg-card border border-card-border rounded-2xl p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted/60 mb-2">颜色分布</div>
              <div className="flex items-center gap-1.5">
                {ALL_COLORS.map(c => {
                  const count = stats.colorCounts[c] || 0;
                  if (count === 0) return null;
                  return (
                    <div
                      key={c}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                      style={{ background: `${COLOR_MAP[c].hex}18`, color: COLOR_MAP[c].hex }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ background: COLOR_MAP[c].hex }} />
                      {count}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 搜索 & 筛选栏 */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* 搜索框 */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted/50" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜索划线内容、笔记或书名..."
                className="w-full pl-9 pr-8 py-2.5 bg-card border border-card-border rounded-xl text-sm placeholder:text-muted/40 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-card-border/40 text-muted/40 hover:text-muted transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 书籍筛选 */}
            <div className="relative" ref={bookFilterRef}>
              <button
                onClick={() => setShowBookFilter(!showBookFilter)}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                  selectedBook
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-card border-card-border text-muted hover:text-foreground hover:border-card-border/80'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span className="max-w-[120px] truncate">
                  {selectedBookInfo ? selectedBookInfo.title : '全部书籍'}
                </span>
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>

              {showBookFilter && (
                <div className="absolute top-full mt-1.5 left-0 z-50 w-64 bg-card border border-card-border rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                  <button
                    onClick={() => { setSelectedBook(null); setShowBookFilter(false); }}
                    className={`w-full text-left px-3 py-2.5 text-xs transition-colors ${
                      !selectedBook ? 'bg-primary/8 text-primary font-medium' : 'text-muted hover:bg-card-border/30 hover:text-foreground'
                    }`}
                  >
                    全部书籍
                    <span className="ml-1.5 opacity-50">({highlights.length})</span>
                  </button>
                  <div className="max-h-64 overflow-y-auto border-t border-card-border/50">
                    {books.map(b => (
                      <button
                        key={b.id}
                        onClick={() => { setSelectedBook(b.id); setShowBookFilter(false); }}
                        className={`w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-colors ${
                          selectedBook === b.id ? 'bg-primary/8 text-primary font-medium' : 'text-muted hover:bg-card-border/30 hover:text-foreground'
                        }`}
                      >
                        {b.cover ? (
                          <img
                            src={b.cover}
                            alt=""
                            className="w-6 h-8 rounded object-cover shrink-0 shadow-sm"
                          />
                        ) : (
                          <div className="w-6 h-8 rounded bg-card-border/40 shrink-0 flex items-center justify-center">
                            <BookOpen className="w-3 h-3 opacity-30" />
                          </div>
                        )}
                        <span className="truncate flex-1">{b.title}</span>
                        <span className="text-[10px] opacity-40 shrink-0">{b.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 颜色筛选 */}
            <div className="flex items-center gap-1 px-1.5 py-1.5 rounded-xl border border-card-border bg-card">
              {ALL_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedColor(selectedColor === c ? null : c)}
                  className="relative w-6 h-6 rounded-full transition-all hover:scale-110"
                  style={{
                    background: COLOR_MAP[c].hex,
                    boxShadow: selectedColor === c ? `0 0 0 2px var(--background), 0 0 0 4px ${COLOR_MAP[c].hex}` : 'none',
                    opacity: selectedColor && selectedColor !== c ? 0.35 : 1,
                  }}
                  title={COLOR_MAP[c].label}
                />
              ))}
            </div>

            {/* 仅显示有笔记 */}
            <button
              onClick={() => setOnlyWithNotes(!onlyWithNotes)}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                onlyWithNotes
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'
                  : 'bg-card border-card-border text-muted hover:text-foreground'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              仅笔记
            </button>
          </div>

          {/* 活跃筛选标签 */}
          {(selectedBook || selectedColor || onlyWithNotes || search) && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-[10px] text-muted/50 uppercase tracking-wider">筛选中</span>
              <span className="text-xs text-muted">
                {filteredHighlights.length} / {highlights.length} 条
              </span>
              <button
                onClick={() => { setSelectedBook(null); setSelectedColor(null); setOnlyWithNotes(false); setSearch(''); }}
                className="ml-auto text-[10px] text-muted hover:text-foreground transition-colors underline underline-offset-2"
              >
                清除筛选
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="px-4 sm:px-6 pb-20">
        <div className="max-w-5xl mx-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted/30" />
              <p className="text-sm text-muted/40 mt-3">加载中...</p>
            </div>
          ) : filteredHighlights.length === 0 ? (
            <EmptyState hasHighlights={highlights.length > 0} />
          ) : (
            <div className="space-y-10">
              {grouped.map(({ book, items }) => (
                <BookGroup
                  key={book.id}
                  book={book}
                  items={items}
                  editingId={editingId}
                  editNote={editNote}
                  editColor={editColor}
                  saving={saving}
                  deletingId={deletingId}
                  editTextareaRef={editTextareaRef}
                  onStartEdit={handleStartEdit}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={handleCancelEdit}
                  onDelete={handleDelete}
                  onEditNoteChange={setEditNote}
                  onEditColorChange={setEditColor}
                  onKeyDown={handleKeyDown}
                  onNavigate={(bookId) => router.push(`/library/read/${bookId}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================
   子组件
   ============================================ */

function StatCard({ icon, label, value, accent }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="bg-card border border-card-border rounded-2xl p-3 sm:p-4">
      <div className={`flex items-center gap-1.5 ${accent} mb-1.5`}>
        {icon}
        <span className="text-[10px] uppercase tracking-widest opacity-60">{label}</span>
      </div>
      <div className="text-2xl sm:text-3xl font-bold tracking-tight">{value}</div>
    </div>
  );
}

function EmptyState({ hasHighlights }: { hasHighlights: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-card-border/20 flex items-center justify-center mb-4">
        <Highlighter className="w-7 h-7 text-muted/25" />
      </div>
      {hasHighlights ? (
        <>
          <p className="text-sm text-muted/50 mb-1">没有匹配的结果</p>
          <p className="text-[11px] text-muted/30">尝试调整筛选条件</p>
        </>
      ) : (
        <>
          <p className="text-sm text-muted/50 mb-1">还没有划线笔记</p>
          <p className="text-[11px] text-muted/30">在阅读时选中文字即可添加高亮和笔记</p>
          <Link
            href="/library"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-medium hover:bg-primary/15 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            去书架看看
          </Link>
        </>
      )}
    </div>
  );
}

function BookGroup({ book, items, editingId, editNote, editColor, saving, deletingId, editTextareaRef, onStartEdit, onSaveEdit, onCancelEdit, onDelete, onEditNoteChange, onEditColorChange, onKeyDown, onNavigate }: {
  book: AllHighlightItem['book'];
  items: AllHighlightItem[];
  editingId: string | null;
  editNote: string;
  editColor: string;
  saving: boolean;
  deletingId: string | null;
  editTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onStartEdit: (hl: AllHighlightItem) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onEditNoteChange: (note: string) => void;
  onEditColorChange: (color: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onNavigate: (bookId: string) => void;
}) {
  return (
    <div>
      {/* 书籍标题行 */}
      <div className="flex items-center gap-3 mb-4">
        {book.cover ? (
          <img
            src={book.cover}
            alt=""
            className="w-8 h-11 rounded-md object-cover shadow-sm shrink-0"
          />
        ) : (
          <div className="w-8 h-11 rounded-md bg-card-border/30 shrink-0 flex items-center justify-center">
            <BookOpen className="w-3.5 h-3.5 opacity-25" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold truncate">{book.title}</h2>
          {book.author && (
            <p className="text-[11px] text-muted/50 truncate">{book.author}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted/40 tabular-nums">{items.length} 条</span>
          <button
            onClick={() => onNavigate(book.id)}
            className="text-[10px] text-primary/60 hover:text-primary transition-colors underline underline-offset-2"
          >
            打开阅读
          </button>
        </div>
      </div>

      {/* 划线列表 */}
      <div className="space-y-2.5 pl-2 sm:pl-4 border-l-2 border-card-border/40">
        {items.map(hl => (
          <HighlightCard
            key={hl.id}
            hl={hl}
            isEditing={editingId === hl.id}
            editNote={editNote}
            editColor={editColor}
            saving={saving}
            isDeleting={deletingId === hl.id}
            editTextareaRef={editTextareaRef}
            onStartEdit={() => onStartEdit(hl)}
            onSaveEdit={onSaveEdit}
            onCancelEdit={onCancelEdit}
            onDelete={() => onDelete(hl.id)}
            onEditNoteChange={onEditNoteChange}
            onEditColorChange={onEditColorChange}
            onKeyDown={onKeyDown}
          />
        ))}
      </div>
    </div>
  );
}

function HighlightCard({ hl, isEditing, editNote, editColor, saving, isDeleting, editTextareaRef, onStartEdit, onSaveEdit, onCancelEdit, onDelete, onEditNoteChange, onEditColorChange, onKeyDown }: {
  hl: AllHighlightItem;
  isEditing: boolean;
  editNote: string;
  editColor: string;
  saving: boolean;
  isDeleting: boolean;
  editTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onEditNoteChange: (note: string) => void;
  onEditColorChange: (color: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const colorInfo = COLOR_MAP[hl.color] || COLOR_MAP.yellow;

  return (
    <div className={`group relative bg-card border border-card-border/60 rounded-xl overflow-hidden transition-all duration-200 hover:border-card-border hover:shadow-sm ${
      isEditing ? 'ring-1 ring-primary/30 border-primary/20' : ''
    } ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* 左侧颜色条 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
        style={{ background: colorInfo.hex }}
      />

      <div className="pl-4 pr-3 py-3">
        {/* 划线文字 */}
        <blockquote
          className="text-[13px] leading-relaxed mb-2"
          style={{ opacity: 0.75, borderLeft: 'none', paddingLeft: 0 }}
        >
          &ldquo;{hl.text}&rdquo;
        </blockquote>

        {isEditing ? (
          /* 编辑模式 */
          <div className="space-y-2.5">
            <textarea
              ref={editTextareaRef}
              value={editNote}
              onChange={e => onEditNoteChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="写下你的思考..."
              className="w-full min-h-[80px] px-3 py-2.5 bg-background border border-card-border rounded-lg text-sm resize-y focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-muted/30"
            />

            {/* 颜色选择 + 操作按钮 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {ALL_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => onEditColorChange(c)}
                    className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                    style={{
                      background: COLOR_MAP[c].hex,
                      boxShadow: editColor === c ? `0 0 0 2px var(--background), 0 0 0 3.5px ${COLOR_MAP[c].hex}` : 'none',
                    }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onCancelEdit}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-muted hover:text-foreground hover:bg-card-border/30 transition-all"
                >
                  取消
                </button>
                <button
                  onClick={onSaveEdit}
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-primary text-primary-foreground hover:opacity-90 transition-all disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  保存
                </button>
              </div>
            </div>

            <p className="text-[10px] text-muted/30">
              Ctrl/Cmd + Enter 保存 · Esc 取消
            </p>
          </div>
        ) : (
          /* 查看模式 */
          <>
            {hl.note && (
              <div className="flex items-start gap-2 mt-1.5 mb-2 px-3 py-2 rounded-lg bg-card-border/20">
                <MessageSquare className="w-3 h-3 text-muted/30 mt-0.5 shrink-0" />
                <p className="text-xs text-muted/70 leading-relaxed whitespace-pre-wrap">{hl.note}</p>
              </div>
            )}

            {/* 底部：时间 + 操作 */}
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-muted/30 tabular-nums">
                {new Date(hl.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={onStartEdit}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-muted/50 hover:text-foreground hover:bg-card-border/30 transition-all"
                  title="编辑"
                >
                  <Pencil className="w-3 h-3" />
                  编辑
                </button>
                <button
                  onClick={onDelete}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-red-400/60 hover:text-red-500 hover:bg-red-500/8 transition-all"
                  title="删除"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

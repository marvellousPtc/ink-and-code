'use client';

import { use, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, BookOpen, List, Settings, Bookmark, Highlighter,
  ChevronLeft, ChevronRight, Loader2, X, Moon, Sun, Type,
  Maximize, Minimize
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useBookDetail, useSaveProgress, useReadingSettings, useSaveReadingSettings, useBookmarks, useHighlights } from '@/lib/hooks/use-library';
import type { ReadingSettingsData } from '@/lib/hooks/use-library';

const EpubReaderView = dynamic(() => import('@/app/components/reader/EpubReaderView'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin opacity-40" /></div>,
});
const PdfReaderView = dynamic(() => import('@/app/components/reader/PdfReaderView'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin opacity-40" /></div>,
});
const HtmlReaderView = dynamic(() => import('@/app/components/reader/HtmlReaderView'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin opacity-40" /></div>,
});

interface ReaderPageProps {
  params: Promise<{ id: string }>;
}

export default function ReaderPage({ params }: ReaderPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { book, isLoading } = useBookDetail(id);
  const { settings, mutate: mutateSettings } = useReadingSettings();
  const { saveSettings } = useSaveReadingSettings();
  const { saveProgress } = useSaveProgress();
  const { bookmarks, addBookmark, deleteBookmark, mutate: mutateBookmarks } = useBookmarks(id);
  const { highlights, addHighlight, deleteHighlight, mutate: mutateHighlights } = useHighlights(id);

  const [showToolbar, setShowToolbar] = useState(true);
  const [showSidebar, setShowSidebar] = useState<'toc' | 'bookmarks' | 'highlights' | 'settings' | null>(null);
  const [percentage, setPercentage] = useState(0);
  const [currentLocation, setCurrentLocation] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 自动隐藏工具栏（移动端始终生效，桌面端仅全屏时生效）
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMobileRef = useRef(false);
  const containerElRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    isMobileRef.current = window.innerWidth < 768;
    const handleResize = () => { isMobileRef.current = window.innerWidth < 768; };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ---- 全屏 API ----
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await containerElRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen toggle failed:', err);
    }
  }, []);

  // 监听全屏变化（包括按 Esc 退出）
  useEffect(() => {
    const handleFullscreenChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (fs) {
        // 进入全屏：3秒后自动隐藏工具栏
        if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
        autoHideTimerRef.current = setTimeout(() => {
          if (!showSidebar) setShowToolbar(false);
        }, 3000);
      } else {
        // 退出全屏：恢复工具栏
        setShowToolbar(true);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [showSidebar]);

  // 全屏时鼠标移动到顶部/底部边缘显示工具栏
  useEffect(() => {
    if (!isFullscreen) return;

    const handleMouseMove = (e: MouseEvent) => {
      const nearTop = e.clientY < 60;
      const nearBottom = e.clientY > window.innerHeight - 60;

      if (nearTop || nearBottom) {
        setShowToolbar(true);
        // 重新启动自动隐藏
        if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
        autoHideTimerRef.current = setTimeout(() => {
          if (!showSidebar) setShowToolbar(false);
        }, 3000);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [isFullscreen, showSidebar]);

  // 键盘快捷键：F 键切换全屏
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      // 避免在输入框中触发
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [toggleFullscreen]);

  const shouldAutoHide = isMobileRef.current || isFullscreen;

  const resetAutoHide = useCallback(() => {
    if (!shouldAutoHide) return;
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    autoHideTimerRef.current = setTimeout(() => {
      if (!showSidebar) setShowToolbar(false);
    }, 3000);
  }, [showSidebar, shouldAutoHide]);

  // 工具栏显示时启动自动隐藏计时器
  useEffect(() => {
    if (showToolbar && shouldAutoHide && !showSidebar) {
      resetAutoHide();
    }
    return () => {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    };
  }, [showToolbar, showSidebar, shouldAutoHide, resetAutoHide]);

  // 阅读时间计时器
  const readTimeRef = useRef(0);
  const lastSaveRef = useRef(Date.now());

  // 自动保存进度（30s 间隔）
  useEffect(() => {
    const interval = setInterval(() => {
      if (book && percentage > 0) {
        const now = Date.now();
        const delta = Math.floor((now - lastSaveRef.current) / 1000);
        lastSaveRef.current = now;
        readTimeRef.current += delta;

        saveProgress({
          bookId: id,
          currentLocation: currentLocation || undefined,
          percentage,
          readTimeDelta: delta,
        }).catch(console.error);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [book, id, percentage, currentLocation, saveProgress]);

  // 页面关闭前保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (book && percentage > 0) {
        const delta = Math.floor((Date.now() - lastSaveRef.current) / 1000);
        navigator.sendBeacon(
          '/api/library/progress',
          new Blob([JSON.stringify({
            bookId: id,
            currentLocation,
            percentage,
            readTimeDelta: delta,
          })], { type: 'application/json' })
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [book, id, percentage, currentLocation]);

  // 恢复进度
  useEffect(() => {
    if (book?.progress) {
      setPercentage(book.progress.percentage);
      setCurrentLocation(book.progress.currentLocation);
    }
  }, [book?.progress]);

  const handleProgressUpdate = useCallback((pct: number, loc?: string) => {
    setPercentage(pct);
    if (loc) setCurrentLocation(loc);
  }, []);

  const handleToggleToolbar = useCallback(() => {
    setShowToolbar(prev => {
      const next = !prev;
      if (next && shouldAutoHide) {
        // 显示时启动自动隐藏
        if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
        autoHideTimerRef.current = setTimeout(() => {
          if (!showSidebar) setShowToolbar(false);
        }, 3000);
      }
      return next;
    });
    if (showSidebar) setShowSidebar(null);
  }, [showSidebar, shouldAutoHide]);

  const handleAddBookmark = useCallback(async (location: string, title?: string) => {
    await addBookmark({ bookId: id, location, title });
    mutateBookmarks();
  }, [id, addBookmark, mutateBookmarks]);

  const handleAddHighlight = useCallback(async (text: string, location: string, color?: string) => {
    await addHighlight({ bookId: id, text, location, color });
    mutateHighlights();
  }, [id, addHighlight, mutateHighlights]);

  // ---- 设置变更（按钮类：立即生效） ----
  const handleSettingsChange = useCallback(async (key: string, value: number | string) => {
    // 乐观更新 SWR 缓存，立即反映到 UI
    mutateSettings((prev: ReadingSettingsData | undefined) => prev ? { ...prev, [key]: value } : prev, false);
    await saveSettings({ [key]: value } as Partial<ReadingSettingsData>);
    mutateSettings();
  }, [saveSettings, mutateSettings]);

  // ---- 滑块变更（防抖：拖动时只更新显示值，释放后才触发保存 + 重排版） ----
  const [sliderOverrides, setSliderOverrides] = useState<Partial<ReadingSettingsData>>({});
  const sliderTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 合并后的设置（用于滑块显示值）
  const displaySettings = useMemo(() => {
    if (!settings) return null;
    return { ...settings, ...sliderOverrides } as ReadingSettingsData;
  }, [settings, sliderOverrides]);

  // 传给 reader 的设置（只在防抖结束后才更新，避免拖滑块时不停重排版）
  const readerSettings = settings;

  const handleSliderChange = useCallback((key: string, value: number | string) => {
    // 立即更新滑块显示值
    setSliderOverrides(prev => ({ ...prev, [key]: value }));

    // 防抖：500ms 后才保存到服务器并更新 reader
    if (sliderTimerRef.current) clearTimeout(sliderTimerRef.current);
    sliderTimerRef.current = setTimeout(async () => {
      setSliderOverrides({});
      // 乐观更新 SWR 缓存
      mutateSettings((prev: ReadingSettingsData | undefined) => prev ? { ...prev, [key]: value } : prev, false);
      await saveSettings({ [key]: value } as Partial<ReadingSettingsData>);
      mutateSettings();
    }, 500);
  }, [saveSettings, mutateSettings]);

  // 清理防抖定时器
  useEffect(() => {
    return () => {
      if (sliderTimerRef.current) clearTimeout(sliderTimerRef.current);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted/60 font-medium">正在加载...</p>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
        <div className="text-center">
          <BookOpen className="w-12 h-12 text-muted/30 mx-auto mb-4" />
          <h2 className="text-lg font-bold mb-2">书籍不存在</h2>
          <button onClick={() => router.push('/library')} className="text-primary text-sm hover:underline">
            返回书架
          </button>
        </div>
      </div>
    );
  }

  const readerTheme = settings?.theme || 'light';
  // 通过代理 API 获取文件，避免 CORS 问题
  const proxyUrl = `/api/library/file?id=${id}`;
  // EPUB 和 PDF 需要直接访问 OSS URL（二进制格式需要完整 URL）
  const directUrl = book.readableUrl || book.originalUrl;
  const format = book.readableUrl
    ? (book.readableUrl.endsWith('.html') ? 'html' : 'epub')
    : book.format;
  const isUnsupportedFormat = ['mobi', 'azw3'].includes(format) && !book.readableUrl;

  return (
    <div
      ref={containerElRef}
      className={`fixed inset-0 z-50 ${
        readerTheme === 'dark' ? 'bg-[#1a1a1a] text-[#ccc]' :
        readerTheme === 'sepia' ? 'bg-[#f4ecd8] text-[#5b4636]' :
        'bg-white text-[#333]'
      }`}
    >
      {/* 阅读区域 — 占满全屏（移动端翻页区域是整个屏幕） */}
      <div className="absolute inset-0" onClick={handleToggleToolbar}>
          {isUnsupportedFormat && (
            <div className="flex items-center justify-center h-full" onClick={(e) => e.stopPropagation()}>
              <div className="text-center max-w-sm px-4">
                <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-bold mb-2">暂不支持在线阅读</h3>
                <p className="text-sm opacity-60 mb-4">
                  {book.format.toUpperCase()} 格式需要安装 Calibre 进行转换。
                  你可以下载原始文件在本地阅读。
                </p>
                <a
                  href={book.originalUrl}
                  download
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors"
                >
                  下载原始文件
                </a>
              </div>
            </div>
          )}
          {format === 'epub' && (
            <EpubReaderView
              url={directUrl}
              bookId={id}
              initialLocation={book.progress?.currentLocation || undefined}
              settings={readerSettings}
              onProgressUpdate={handleProgressUpdate}
              onAddBookmark={handleAddBookmark}
              onAddHighlight={handleAddHighlight}
            />
          )}
          {format === 'pdf' && (
            <PdfReaderView
              url={directUrl}
              bookId={id}
              initialPage={book.progress?.currentLocation ? parseInt(book.progress.currentLocation) : undefined}
              settings={readerSettings}
              onProgressUpdate={handleProgressUpdate}
            />
          )}
          {['txt', 'md', 'html', 'markdown'].includes(format) && (
            <HtmlReaderView
              url={proxyUrl}
              format={format}
              initialScrollPercent={book.progress?.percentage}
              settings={readerSettings}
              onProgressUpdate={handleProgressUpdate}
            />
          )}
      </div>

      {/* 顶部工具栏 — 浮动在阅读区域上方 */}
      <div
        onPointerDown={resetAutoHide}
        className={`absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 h-12 border-b transition-all duration-300 ${
          showToolbar ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
        } ${
          readerTheme === 'dark' ? 'bg-[#222]/95 border-[#333] backdrop-blur-sm' :
          readerTheme === 'sepia' ? 'bg-[#ede0c8]/95 border-[#d4c5a9] backdrop-blur-sm' :
          'bg-gray-50/95 border-gray-200 backdrop-blur-sm'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/library')}
            className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium truncate max-w-[120px] sm:max-w-md">
            {book.title}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSidebar(showSidebar === 'toc' ? null : 'toc')}
            className={`p-2 rounded-lg transition-colors ${showSidebar === 'toc' ? 'bg-primary/10 text-primary' : 'hover:bg-black/5'}`}
            title="目录"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowSidebar(showSidebar === 'bookmarks' ? null : 'bookmarks')}
            className={`p-2 rounded-lg transition-colors ${showSidebar === 'bookmarks' ? 'bg-primary/10 text-primary' : 'hover:bg-black/5'}`}
            title="书签"
          >
            <Bookmark className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowSidebar(showSidebar === 'highlights' ? null : 'highlights')}
            className={`p-2 rounded-lg transition-colors ${showSidebar === 'highlights' ? 'bg-primary/10 text-primary' : 'hover:bg-black/5'}`}
            title="划线笔记"
          >
            <Highlighter className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowSidebar(showSidebar === 'settings' ? null : 'settings')}
            className={`p-2 rounded-lg transition-colors ${showSidebar === 'settings' ? 'bg-primary/10 text-primary' : 'hover:bg-black/5'}`}
            title="设置"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg transition-colors hover:bg-black/5 hidden sm:flex items-center justify-center"
            title={isFullscreen ? '退出全屏 (F)' : '沉浸阅读 (F)'}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 侧边栏 — 移动端全屏覆盖，桌面端侧栏 */}
      {showSidebar && (
        <>
          {/* 移动端遮罩层 */}
          <div
            className="fixed inset-0 bg-black/40 z-40 sm:hidden"
            onClick={() => setShowSidebar(null)}
          />
          <div
            className={`
              fixed inset-y-0 right-0 w-[85vw] max-w-80 z-50
              border-l shrink-0 flex flex-col overflow-hidden
              ${
                readerTheme === 'dark' ? 'bg-[#1e1e1e] border-[#333]' :
                readerTheme === 'sepia' ? 'bg-[#ede0c8] border-[#d4c5a9]' :
                'bg-gray-50 border-gray-200'
              }
            `}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-inherit">
              <span className="text-sm font-bold">
                {showSidebar === 'toc' && '目录'}
                {showSidebar === 'bookmarks' && '书签'}
                {showSidebar === 'highlights' && '划线笔记'}
                {showSidebar === 'settings' && '阅读设置'}
              </span>
              <button onClick={() => setShowSidebar(null)} className="p-1 rounded hover:bg-black/5">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {showSidebar === 'bookmarks' && (
                <div className="space-y-2">
                  {bookmarks.length === 0 ? (
                    <p className="text-sm text-center py-8 opacity-50">暂无书签</p>
                  ) : (
                    bookmarks.map((bm) => (
                      <div key={bm.id} className="p-3 rounded-lg bg-black/5 text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium truncate">{bm.title || '未命名书签'}</span>
                          <button
                            onClick={() => { deleteBookmark({ id: bm.id }); mutateBookmarks(); }}
                            className="text-red-400 hover:text-red-500 p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        {bm.note && <p className="text-xs opacity-60">{bm.note}</p>}
                      </div>
                    ))
                  )}
                </div>
              )}

              {showSidebar === 'highlights' && (
                <div className="space-y-2">
                  {highlights.length === 0 ? (
                    <p className="text-sm text-center py-8 opacity-50">暂无划线笔记</p>
                  ) : (
                    highlights.map((hl) => (
                      <div key={hl.id} className="p-3 rounded-lg bg-black/5 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div
                            className="flex-1 border-l-2 pl-2 text-xs italic opacity-80"
                            style={{
                              borderColor:
                                hl.color === 'yellow' ? '#eab308' :
                                hl.color === 'green' ? '#22c55e' :
                                hl.color === 'blue' ? '#3b82f6' :
                                hl.color === 'pink' ? '#ec4899' :
                                '#a855f7',
                            }}
                          >
                            {hl.text}
                          </div>
                          <button
                            onClick={() => { deleteHighlight({ id: hl.id }); mutateHighlights(); }}
                            className="text-red-400 hover:text-red-500 p-0.5 shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        {hl.note && <p className="text-xs opacity-60 mt-1.5">{hl.note}</p>}
                      </div>
                    ))
                  )}
                </div>
              )}

              {showSidebar === 'settings' && displaySettings && (
                <div className="space-y-6">
                  {/* 主题 */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider opacity-50 mb-3 block">主题</label>
                    <div className="flex gap-2">
                      {[
                        { value: 'light', icon: Sun, label: '白天', bg: 'bg-white border-gray-300' },
                        { value: 'sepia', icon: Type, label: '羊皮纸', bg: 'bg-[#f4ecd8] border-[#d4c5a9]' },
                        { value: 'dark', icon: Moon, label: '夜间', bg: 'bg-[#1a1a1a] border-[#444]' },
                      ].map(({ value, label, bg }) => (
                        <button
                          key={value}
                          onClick={() => handleSettingsChange('theme', value)}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium border-2 transition-all ${bg} ${
                            displaySettings.theme === value ? 'ring-2 ring-primary ring-offset-1' : ''
                          }`}
                        >
                          <span className={value === 'dark' ? 'text-gray-300' : value === 'sepia' ? 'text-[#5b4636]' : 'text-gray-700'}>
                            {label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 字号 — 用防抖滑块 */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider opacity-50 mb-3 block">
                      字号: {displaySettings.fontSize}px
                    </label>
                    <input
                      type="range"
                      min="12"
                      max="28"
                      value={displaySettings.fontSize}
                      onChange={(e) => handleSliderChange('fontSize', parseInt(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>

                  {/* 行高 — 用防抖滑块 */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider opacity-50 mb-3 block">
                      行高: {displaySettings.lineHeight}
                    </label>
                    <input
                      type="range"
                      min="1.2"
                      max="2.4"
                      step="0.1"
                      value={displaySettings.lineHeight}
                      onChange={(e) => handleSliderChange('lineHeight', parseFloat(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>

                  {/* 页面宽度 — 用防抖滑块（移动端隐藏，因为单页全宽） */}
                  <div className="hidden sm:block">
                    <label className="text-xs font-bold uppercase tracking-wider opacity-50 mb-3 block">
                      页宽: {displaySettings.pageWidth}px
                    </label>
                    <input
                      type="range"
                      min="500"
                      max="1200"
                      step="50"
                      value={displaySettings.pageWidth}
                      onChange={(e) => handleSliderChange('pageWidth', parseInt(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>

                  {/* 字体 — 按钮类立即生效 */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider opacity-50 mb-3 block">字体</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: 'system', label: '系统默认' },
                        { value: 'serif', label: '衬线体' },
                        { value: 'sans-serif', label: '无衬线' },
                        { value: 'mono', label: '等宽体' },
                      ].map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => handleSettingsChange('fontFamily', value)}
                          className={`py-2 px-3 rounded-lg text-xs font-medium border transition-all ${
                            displaySettings.fontFamily === value
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-black/10 hover:border-black/20'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {showSidebar === 'toc' && (
                <p className="text-sm text-center py-8 opacity-50">
                  目录将在打开 EPUB 书籍时显示
                </p>
              )}
            </div>
          </div>
          </>
        )}

      {/* 底部进度条 — 浮动在阅读区域下方 */}
      <div
        onPointerDown={resetAutoHide}
        className={`absolute bottom-0 left-0 right-0 z-20 px-4 py-2 border-t flex items-center gap-3 transition-all duration-300 ${
          showToolbar ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
        } ${
          readerTheme === 'dark' ? 'bg-[#222]/95 border-[#333] backdrop-blur-sm' :
          readerTheme === 'sepia' ? 'bg-[#ede0c8]/95 border-[#d4c5a9] backdrop-blur-sm' :
          'bg-gray-50/95 border-gray-200 backdrop-blur-sm'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <ChevronLeft className="w-4 h-4 opacity-40" />
        <div className="flex-1 h-1.5 bg-black/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <ChevronRight className="w-4 h-4 opacity-40" />
        <span className="text-xs font-bold opacity-50 tabular-nums w-10 text-right">
          {Math.round(percentage)}%
        </span>
      </div>
    </div>
  );
}

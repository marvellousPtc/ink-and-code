'use client';

import { use, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, BookOpen, List, Settings, Bookmark, Highlighter,
  Loader2, X, Moon, Sun, Type,
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
  const { book, isLoading, mutate: mutateBook } = useBookDetail(id);

  // 进入阅读页时后台 revalidate 最新进度，但**不阻塞渲染**。
  // 阅读器先用缓存数据立即显示，进度通过 initialLocation 的后续变化自动恢复。
  useEffect(() => {
    if (id) mutateBook();
  }, [id, mutateBook]);

  const { settings, mutate: mutateSettings } = useReadingSettings();
  const { saveSettings } = useSaveReadingSettings();
  const { saveProgress } = useSaveProgress();
  const { bookmarks, addBookmark, deleteBookmark, mutate: mutateBookmarks } = useBookmarks(id);
  const { highlights, addHighlight, deleteHighlight, mutate: mutateHighlights } = useHighlights(id);

  // ---- 首次加载保护 ----
  // 有缓存时立即渲染阅读器（不等 revalidation）。
  // 后台 revalidation 拿到最新 progress 后，initialLocation 变化 → EpubReaderView 自动跳页。
  const dataReady = !!book;
  const [readerReady, setReaderReady] = useState(false);
  const handleReaderReady = useCallback(() => setReaderReady(true), []);

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
          ...progressExtraRef.current,
        }).catch(console.error);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [book, id, percentage, currentLocation, saveProgress]);

  // ---- 离开页面时保存进度 ----
  // 使用 ref 持有最新值，避免 useEffect 闭包捕获过期数据
  const saveDataRef = useRef({ book, id, percentage, currentLocation });
  saveDataRef.current = { book, id, percentage, currentLocation };

  useEffect(() => {
    const doSave = () => {
      const { book: b, id: bookId, percentage: pct, currentLocation: loc } = saveDataRef.current;
      if (!b || (!loc && pct <= 0)) return;
      const delta = Math.floor((Date.now() - lastSaveRef.current) / 1000);
      navigator.sendBeacon(
        '/api/library/progress',
        new Blob([JSON.stringify({
          bookId,
          currentLocation: loc,
          percentage: pct,
          readTimeDelta: delta,
          ...progressExtraRef.current,
        })], { type: 'application/json' })
      );
    };

    // beforeunload: 桌面端关闭标签页/窗口
    const handleBeforeUnload = () => doSave();
    // visibilitychange: 移动端切 App / 切标签页
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') doSave();
    };
    // pagehide: 兜底
    const handlePageHide = () => doSave();

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    // 组件卸载时保存（SPA 路由跳转触发，如点击返回按钮 router.push）
    return () => {
      doSave();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  // 空依赖：只在 mount/unmount 时运行，通过 ref 读取最新值
   
  }, []);

  // 恢复进度
  useEffect(() => {
    if (book?.progress) {
      setPercentage(book.progress.percentage);
      setCurrentLocation(book.progress.currentLocation);
    }
  }, [book?.progress]);

  // 额外的进度数据（pageNumber + settingsFingerprint）
  const progressExtraRef = useRef<{ pageNumber?: number; settingsFingerprint?: string }>({});
  // 防抖保存定时器：翻页/设置变更后 1 秒内无新操作则保存到后端
  const debounceSaveRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleProgressUpdate = useCallback((pct: number, loc?: string, extra?: { pageNumber?: number; settingsFingerprint?: string }) => {
    setPercentage(pct);
    if (loc) setCurrentLocation(loc);
    if (extra) progressExtraRef.current = extra;

    // 防抖保存到后端：每次调用重置计时器，1.5 秒后执行（避免频繁保存影响翻页性能）
    // 通过 ref 读取最新值，避免依赖 state 导致回调频繁重建
    if (debounceSaveRef.current) clearTimeout(debounceSaveRef.current);
    debounceSaveRef.current = setTimeout(() => {
      const now = Date.now();
      const delta = Math.floor((now - lastSaveRef.current) / 1000);
      lastSaveRef.current = now;
      const data = saveDataRef.current;
      saveProgress({
        bookId: data.id,
        currentLocation: loc || data.currentLocation || undefined,
        percentage: pct,
        readTimeDelta: delta,
        ...progressExtraRef.current,
      }).catch(console.error);
    }, 1500);
  }, [saveProgress]);

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

  // ---- 设置管理 ----
  // 使用 local state 作为主控源，解耦 SWR 依赖。
  // 好处：
  // 1. 不依赖 SWR 加载完成 → 页面打开即可使用默认设置
  // 2. 不依赖登录/API → 未登录用户设置也能生效
  // 3. 按钮/滑块操作立即生效，无需等 SWR cache 更新
  const DEFAULT_SETTINGS: ReadingSettingsData = {
    id: '', fontSize: 16, fontFamily: 'system', lineHeight: 1.8, theme: 'light', pageWidth: 800,
  };

  const [localSettings, setLocalSettings] = useState<ReadingSettingsData>(DEFAULT_SETTINGS);
  const settingsInitialized = useRef(false);
  const sliderTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 从服务器初始化一次（displaySettings + readerSettings 同步更新）
  useEffect(() => {
    if (settings && !settingsInitialized.current) {
      settingsInitialized.current = true;
      setLocalSettings(settings);
      setReaderSettings(settings);
    }
  }, [settings]);

  // 显示用的设置 = local state（始终有值，不会是 null）
  const displaySettings = localSettings;

  // 传给 reader 的设置（按钮类立即生效，滑块类防抖后生效）
  const [readerSettings, setReaderSettings] = useState<ReadingSettingsData>(DEFAULT_SETTINGS);

  // 按钮类设置（主题、字体）：立即更新 display + reader
  const handleSettingsChange = useCallback(async (key: string, value: number | string) => {
    const patch = { [key]: value };
    setLocalSettings(prev => ({ ...prev, ...patch }));
    setReaderSettings(prev => ({ ...prev, ...patch }));
    try {
      await saveSettings(patch as Partial<ReadingSettingsData>);
      mutateSettings();
    } catch (e) {
      console.error('Failed to sync settings:', e);
    }
  }, [saveSettings, mutateSettings]);

  // 滑块类设置（字号、行高、页宽）：立即更新显示，防抖更新 reader + 服务器
  const handleSliderChange = useCallback((key: string, value: number | string) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));

    if (sliderTimerRef.current) clearTimeout(sliderTimerRef.current);
    sliderTimerRef.current = setTimeout(async () => {
      setReaderSettings(prev => ({ ...prev, [key]: value }));
      try {
        await saveSettings({ [key]: value } as Partial<ReadingSettingsData>);
        mutateSettings();
      } catch (e) {
        console.error('Failed to sync settings:', e);
      }
    }, 400);
  }, [saveSettings, mutateSettings]);

  // 清理防抖定时器
  useEffect(() => {
    return () => {
      if (sliderTimerRef.current) clearTimeout(sliderTimerRef.current);
      if (debounceSaveRef.current) clearTimeout(debounceSaveRef.current);
    };
  }, []);

  // 不使用 early return：始终渲染完整页面结构 + 遮罩层。
  // Early return 会导致 DOM 卸载/挂载产生绘制间隙（白色闪烁）。
  const readerTheme = localSettings.theme || 'light';
  const proxyUrl = book ? `/api/library/file?id=${id}` : '';
  const directUrl = book ? (book.readableUrl || book.originalUrl) : '';
  const format = book
    ? (book.readableUrl ? (book.readableUrl.endsWith('.html') ? 'html' : 'epub') : book.format)
    : '';
  const isUnsupportedFormat = book ? (['mobi', 'azw3'].includes(format) && !book.readableUrl) : false;

  // 整体是否就绪：书籍数据加载完 + EPUB 渲染到正确位置
  const showContent = !!book && !isLoading;
  const showEpubOverlay = format === 'epub' && !readerReady;

  return (
    <div
      ref={containerElRef}
      className={`fixed inset-0 z-50 ${
        readerTheme === 'dark' ? 'text-[#c8c0b8]' :
        readerTheme === 'sepia' ? 'text-[#5b4636]' :
        'text-[#3d3428]'
      }`}
      style={{
        background: readerTheme === 'dark'
          ? 'radial-gradient(ellipse at 50% 45%, #1e1a16 0%, #161310 65%, #100e0b 100%)'
          : readerTheme === 'sepia'
          ? 'radial-gradient(ellipse at 50% 45%, #e5d9c0 0%, #ddd0b4 65%, #d4c5a5 100%)'
          : 'radial-gradient(ellipse at 50% 45%, #ece6dc 0%, #e4ddd2 65%, #dbd3c6 100%)'
      }}
    >
      {/* 阅读区域 — 占满全屏 */}
      <div className="absolute inset-0" onClick={handleToggleToolbar}>
          {showContent && isUnsupportedFormat && (
            <div className="flex items-center justify-center h-full" onClick={(e) => e.stopPropagation()}>
              <div className="text-center max-w-sm px-4">
                <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-bold mb-2">暂不支持在线阅读</h3>
                <p className="text-sm opacity-60 mb-4">
                  {book!.format.toUpperCase()} 格式需要安装 Calibre 进行转换。
                  你可以下载原始文件在本地阅读。
                </p>
                <a
                  href={book!.originalUrl}
                  download
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors"
                >
                  下载原始文件
                </a>
              </div>
            </div>
          )}
          {showContent && format === 'epub' && dataReady && (
            <EpubReaderView
              url={directUrl}
              bookId={id}
              initialLocation={book!.progress?.currentLocation || undefined}
              settings={readerSettings}
              onProgressUpdate={handleProgressUpdate}
              onAddBookmark={handleAddBookmark}
              onAddHighlight={handleAddHighlight}
              onReady={handleReaderReady}
            />
          )}
          {showContent && format === 'pdf' && (
            <PdfReaderView
              url={directUrl}
              bookId={id}
              initialPage={book!.progress?.currentLocation ? parseInt(book!.progress.currentLocation) : undefined}
              settings={readerSettings}
              onProgressUpdate={handleProgressUpdate}
            />
          )}
          {showContent && ['txt', 'md', 'html', 'markdown'].includes(format) && (
            <HtmlReaderView
              url={proxyUrl}
              format={format}
              initialScrollPercent={book!.progress?.percentage}
              settings={readerSettings}
              onProgressUpdate={handleProgressUpdate}
            />
          )}
      </div>

      {/* 顶部工具栏 — 浮动在阅读区域上方 */}
      <div
        onPointerDown={resetAutoHide}
        className={`absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 h-12 transition-all duration-300 backdrop-blur-xl ${
          showToolbar ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
        } ${
          readerTheme === 'dark'
            ? 'bg-[#1e1a16]/75 border-b border-white/6'
            : readerTheme === 'sepia'
            ? 'bg-[#e8dcc4]/75 border-b border-[#c9b894]/25'
            : 'bg-[#f5f0e8]/75 border-b border-[#d4c5ae]/20'
        }`}
        style={{
          boxShadow: readerTheme === 'dark'
            ? '0 1px 12px rgba(0,0,0,0.25)'
            : '0 1px 12px rgba(120,100,70,0.06)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/library')}
            className={`p-1.5 rounded-lg transition-colors ${
              readerTheme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-black/5'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span
            className="text-sm font-medium truncate max-w-[120px] sm:max-w-md opacity-80"
            style={{ fontFamily: 'Georgia, "Times New Roman", "Songti SC", serif' }}
          >
            {book?.title}
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          {([
            { key: 'toc', icon: List, title: '目录' },
            { key: 'bookmarks', icon: Bookmark, title: '书签' },
            { key: 'highlights', icon: Highlighter, title: '划线笔记' },
            { key: 'settings', icon: Settings, title: '设置' },
          ] as const).map(({ key, icon: Icon, title }) => (
            <button
              key={key}
              onClick={() => setShowSidebar(showSidebar === key ? null : key)}
              className={`p-2 rounded-lg transition-colors ${
                showSidebar === key
                  ? 'bg-primary/10 text-primary'
                  : readerTheme === 'dark' ? 'hover:bg-white/10 opacity-70' : 'hover:bg-black/5 opacity-60'
              }`}
              title={title}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
          <button
            onClick={toggleFullscreen}
            className={`p-2 rounded-lg transition-colors hidden sm:flex items-center justify-center ${
              readerTheme === 'dark' ? 'hover:bg-white/10 opacity-70' : 'hover:bg-black/5 opacity-60'
            }`}
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
              border-l shrink-0 flex flex-col overflow-hidden backdrop-blur-xl
              ${
                readerTheme === 'dark' ? 'bg-[#1e1a16]/95 border-white/6' :
                readerTheme === 'sepia' ? 'bg-[#e8dcc4]/95 border-[#c9b894]/25' :
                'bg-[#f5f0e8]/95 border-[#d4c5ae]/20'
              }
            `}
            style={{
              boxShadow: readerTheme === 'dark'
                ? '-4px 0 24px rgba(0,0,0,0.3)'
                : '-4px 0 24px rgba(120,100,70,0.08)'
            }}
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

              {showSidebar === 'settings' && (
                <div className="space-y-7">
                  {/* ---- 主题选择 ---- */}
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.15em] opacity-35 mb-3"
                      style={{ fontFamily: 'Georgia, serif' }}>阅读主题</div>
                    <div className="flex gap-3 justify-center">
                      {[
                        { value: 'light', label: '日光', pageBg: '#faf7f2', textColor: '#2d2518', outerBg: '#e4ddd2' },
                        { value: 'sepia', label: '暖黄', pageBg: '#f4ecd8', textColor: '#4a3828', outerBg: '#d4c5a5' },
                        { value: 'dark', label: '夜间', pageBg: '#282420', textColor: '#c8c0b8', outerBg: '#161310' },
                      ].map(({ value, label, pageBg, textColor, outerBg }) => (
                        <button
                          key={value}
                          onClick={() => handleSettingsChange('theme', value)}
                          className={`flex flex-col items-center gap-1.5 transition-all ${
                            displaySettings.theme === value ? 'scale-105' : 'opacity-60 hover:opacity-80'
                          }`}
                        >
                          {/* 迷你书页预览 */}
                          <div
                            className="w-14 h-[72px] rounded-md overflow-hidden relative"
                            style={{
                              background: outerBg,
                              boxShadow: displaySettings.theme === value
                                ? `0 0 0 2px ${value === 'dark' ? '#8a7050' : '#c49a6c'}, 0 2px 8px rgba(0,0,0,0.15)`
                                : '0 1px 4px rgba(0,0,0,0.1)',
                            }}
                          >
                            <div
                              className="absolute inset-[4px] rounded-sm flex flex-col justify-center items-center gap-[3px] px-1.5"
                              style={{ background: pageBg }}
                            >
                              {[1, 0.7, 0.9, 0.5, 0.8].map((w, i) => (
                                <div key={i} className="rounded-full" style={{
                                  width: `${w * 100}%`, height: '2px',
                                  background: textColor, opacity: 0.25,
                                }} />
                              ))}
                            </div>
                          </div>
                          <span className="text-[10px] font-medium opacity-60">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="h-px opacity-[0.06]" style={{ background: 'currentColor' }} />

                  {/* ---- 字号 ---- */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.15em] opacity-35"
                        style={{ fontFamily: 'Georgia, serif' }}>字号</span>
                      <div className="flex items-baseline gap-1">
                        <span
                          className="text-lg font-bold opacity-60 tabular-nums"
                          style={{
                            fontFamily: 'Georgia, serif',
                            fontSize: `${Math.min(22, Math.max(14, displaySettings.fontSize))}px`
                          }}
                        >Aa</span>
                        <span className="text-[10px] opacity-30 tabular-nums ml-1">{displaySettings.fontSize}px</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] opacity-30" style={{ fontFamily: 'Georgia, serif', fontSize: '11px' }}>A</span>
                      <input
                        type="range" min="12" max="28"
                        value={displaySettings.fontSize}
                        onChange={(e) => handleSliderChange('fontSize', parseInt(e.target.value))}
                        className="reader-slider flex-1"
                      />
                      <span className="text-sm opacity-30" style={{ fontFamily: 'Georgia, serif', fontSize: '18px' }}>A</span>
                    </div>
                  </div>

                  {/* ---- 行高 ---- */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.15em] opacity-35"
                        style={{ fontFamily: 'Georgia, serif' }}>行距</span>
                      <span className="text-[10px] opacity-30 tabular-nums">{displaySettings.lineHeight}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* 行距预览 */}
                      <div className="flex flex-col gap-[2px] opacity-25">
                        <div className="w-3 h-[2px] rounded-full bg-current" />
                        <div className="w-3 h-[2px] rounded-full bg-current" />
                        <div className="w-3 h-[2px] rounded-full bg-current" />
                      </div>
                      <input
                        type="range" min="1.2" max="2.4" step="0.1"
                        value={displaySettings.lineHeight}
                        onChange={(e) => handleSliderChange('lineHeight', parseFloat(e.target.value))}
                        className="reader-slider flex-1"
                      />
                      <div className="flex flex-col gap-[4px] opacity-25">
                        <div className="w-3 h-[2px] rounded-full bg-current" />
                        <div className="w-3 h-[2px] rounded-full bg-current" />
                        <div className="w-3 h-[2px] rounded-full bg-current" />
                      </div>
                    </div>
                  </div>

                  {/* ---- 页宽（桌面端） ---- */}
                  <div className="hidden sm:block">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.15em] opacity-35"
                        style={{ fontFamily: 'Georgia, serif' }}>页面宽度</span>
                      <span className="text-[10px] opacity-30 tabular-nums">{displaySettings.pageWidth}px</span>
                    </div>
                    <input
                      type="range" min="600" max="1200" step="50"
                      value={displaySettings.pageWidth}
                      onChange={(e) => handleSliderChange('pageWidth', parseInt(e.target.value))}
                      className="reader-slider w-full"
                    />
                  </div>

                  <div className="h-px opacity-[0.06]" style={{ background: 'currentColor' }} />

                  {/* ---- 字体 ---- */}
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.15em] opacity-35 mb-3"
                      style={{ fontFamily: 'Georgia, serif' }}>字体</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: 'system', label: '系统默认', font: '-apple-system, system-ui, sans-serif' },
                        { value: 'serif', label: '衬线体', font: 'Georgia, "Times New Roman", serif' },
                        { value: 'sans-serif', label: '无衬线', font: '-apple-system, "Segoe UI", sans-serif' },
                        { value: 'mono', label: '等宽体', font: '"SF Mono", "Fira Code", monospace' },
                      ].map(({ value, label, font }) => (
                        <button
                          key={value}
                          onClick={() => handleSettingsChange('fontFamily', value)}
                          className={`py-2.5 px-3 rounded-xl text-xs transition-all ${
                            displaySettings.fontFamily === value
                              ? 'shadow-sm'
                              : 'opacity-50 hover:opacity-70'
                          }`}
                          style={{
                            fontFamily: font,
                            background: displaySettings.fontFamily === value
                              ? (readerTheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)')
                              : 'transparent',
                            border: `1.5px solid ${
                              displaySettings.fontFamily === value
                                ? (readerTheme === 'dark' ? '#8a7050' : '#c49a6c')
                                : (readerTheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)')
                            }`,
                          }}
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
        className={`absolute bottom-0 left-0 right-0 z-20 px-5 py-3 flex items-center gap-4 transition-all duration-300 backdrop-blur-xl ${
          showToolbar ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
        } ${
          readerTheme === 'dark'
            ? 'bg-[#1e1a16]/75 border-t border-white/6'
            : readerTheme === 'sepia'
            ? 'bg-[#e8dcc4]/75 border-t border-[#c9b894]/25'
            : 'bg-[#f5f0e8]/75 border-t border-[#d4c5ae]/20'
        }`}
        style={{
          boxShadow: readerTheme === 'dark'
            ? '0 -1px 12px rgba(0,0,0,0.25)'
            : '0 -1px 12px rgba(120,100,70,0.06)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 h-[3px] rounded-full overflow-hidden"
          style={{
            background: readerTheme === 'dark'
              ? 'rgba(255,255,255,0.08)'
              : 'rgba(0,0,0,0.06)'
          }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${percentage}%`,
              background: readerTheme === 'dark'
                ? 'linear-gradient(90deg, #8a7050, #b8956e)'
                : 'linear-gradient(90deg, #c4996c, #d4aa7e)'
            }}
          />
        </div>
        <span
          className="text-[11px] tabular-nums shrink-0 opacity-40"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500 }}
        >
          {Math.round(percentage)}%
        </span>
      </div>

      {/* ---- 全屏加载遮罩 ----
        始终在 DOM 中，用 opacity 控制显隐（不做条件挂载/卸载，避免绘制间隙闪烁）。
        覆盖在所有内容之上，直到内容完全就绪。
        - EPUB：等 EpubReaderView 发出 onReady 信号
        - 其他格式：等 showContent
        - 书籍不存在：显示提示
      */}
      <div
        className="fixed inset-0 z-100 flex flex-col items-center justify-center"
        style={{
          background: readerTheme === 'dark'
            ? 'rgb(26,23,20)'
            : readerTheme === 'sepia'
            ? 'rgb(228,216,191)'
            : 'rgb(250,247,242)',
          opacity: (isLoading || !book || showEpubOverlay) ? 1 : 0,
          pointerEvents: (isLoading || !book || showEpubOverlay) ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
        }}
      >
        {!book && !isLoading ? (
          <div className="text-center">
            <BookOpen className="w-12 h-12 mx-auto mb-4" style={{ opacity: 0.3, color: readerTheme === 'dark' ? '#c8c0b8' : '#3d3428' }} />
            <h2 className="text-lg font-bold mb-2" style={{ color: readerTheme === 'dark' ? '#c8c0b8' : '#3d3428' }}>书籍不存在</h2>
            <button onClick={() => router.push('/library')} className="text-primary text-sm hover:underline">
              返回书架
            </button>
          </div>
        ) : (
          <>
            <Loader2
              className="w-6 h-6 animate-spin mb-3"
              style={{ color: readerTheme === 'dark' ? 'rgba(200,192,184,0.4)' : 'rgba(80,60,30,0.25)' }}
            />
            <span
              className="text-xs"
              style={{
                fontFamily: 'Georgia, "Times New Roman", "Songti SC", serif',
                letterSpacing: '1px',
                color: readerTheme === 'dark' ? 'rgba(200,192,184,0.4)' : 'rgba(80,60,30,0.25)',
              }}
            >
              {!dataReady ? '正在加载…' : '排版中…'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

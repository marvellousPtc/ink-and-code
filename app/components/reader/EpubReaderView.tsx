'use client';

import {
  createContext,
  useEffect,
  useRef,
  useCallback,
  useState,
  useMemo,
} from 'react';
import HTMLFlipBook from 'react-pageflip-enhanced';
import { useServerChapters } from '@/lib/hooks/use-server-chapters';
import {
  useBookPagination,
  getChapterForPage,
} from '@/lib/hooks/use-book-pagination';
import type { ReadingSettingsData } from '@/lib/hooks/use-library';
import BookPage from './BookPage';
import './epub-reader.css';

/**
 * 懒渲染窗口：只有当前页 ± WINDOW 范围内的页面才渲染真实 HTML。
 * 翻页时 handleFlip 会立即同步 store，确保目标页始终在窗口内。
 * 窗口大小决定"预加载缓冲区"——即使 React 调度有延迟，也有足够余量。
 */
const LAZY_WINDOW_DESKTOP = 20;
const LAZY_WINDOW_MOBILE = 12;

// ---- 页面状态外部存储 ----
//
// 核心性能优化：翻页时不再触发父组件 re-render。
//
// 翻页 → pageStore.setPage() → 仅通知订阅的 BookPage
//   → useSyncExternalStore：getSnapshot 调用
//   → 只有跨越窗口边界的 BookPage 实际 re-render
//   → 父组件零 re-render → children 引用不变 → 库零重建

export interface PageStoreType {
  subscribe: (cb: () => void) => () => void;
  getPage: () => number;
  setPage: (page: number) => void;
  /** 初始目标页：翻页前的安全网，确保 startPage 附近的页面始终渲染 */
  getInitialPage: () => number;
  setInitialPage: (page: number) => void;
  getLazyWindow: () => number;
  setLazyWindow: (w: number) => void;
}

export const PageStoreContext = createContext<PageStoreType | null>(null);

function createPageStore(): PageStoreType {
  let currentPage = 0;
  let initialPage = 0;
  let lazyWindow = LAZY_WINDOW_DESKTOP;
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach(l => l());

  return {
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    getPage: () => currentPage,
    setPage: (page: number) => {
      if (currentPage !== page) {
        currentPage = page;
        notify();
      }
    },
    getInitialPage: () => initialPage,
    setInitialPage: (page: number) => {
      if (initialPage !== page) {
        initialPage = page;
        notify();
      }
    },
    getLazyWindow: () => lazyWindow,
    setLazyWindow: (w: number) => {
      if (lazyWindow !== w) {
        lazyWindow = w;
        notify();
      }
    },
  };
}

interface EpubReaderViewProps {
  url: string;
  bookId: string;
  initialLocation?: string;
  settings?: ReadingSettingsData | null;
  onProgressUpdate?: (percentage: number, location?: string, extra?: { pageNumber?: number; settingsFingerprint?: string }) => void;
  onAddBookmark?: (location: string, title?: string) => void;
  onAddHighlight?: (text: string, location: string, color?: string) => void;
}

/** 从 initialLocation 中解析初始 charOffset（仅处理 "char:N" 格式） */
function parseInitialCharOffset(initialLocation?: string): number {
  if (!initialLocation) return 0;
  if (initialLocation.startsWith('char:')) {
    const parsed = parseInt(initialLocation.replace('char:', ''), 10);
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  }
  return 0;
}

export default function EpubReaderView({
  bookId,
  initialLocation,
  settings,
  onProgressUpdate,
}: EpubReaderViewProps) {
  // ---- 容器尺寸 ----
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const HEIGHT_THRESHOLD = 100;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const newW = rect.width;
      const newH = rect.height;

      setContainerSize(prev => {
        if (prev.w === 0 && prev.h === 0) {
          return { w: newW, h: newH };
        }
        const widthChanged = Math.abs(newW - prev.w) > 1;
        const heightChanged = Math.abs(newH - prev.h) > HEIGHT_THRESHOLD;

        if (widthChanged || heightChanged) {
          return { w: newW, h: heightChanged ? newH : prev.h };
        }
        return prev;
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- 解析初始 charOffset（同步计算，用于 useServerChapters 的初始参数）----
  const initialCharOffset = useMemo(() => parseInitialCharOffset(initialLocation), [initialLocation]);

  // ---- 服务端章节加载（替代旧的 useEpubContent）----
  const {
    chaptersMeta,
    chaptersForPagination: chapters,
    styles: epubStyles,
    totalCharacters,
    isLoading,
    error,
    updateCurrentChapter,
  } = useServerChapters(bookId, initialCharOffset);

  // ---- 响应式 ----
  const isMobile = containerSize.w > 0 && containerSize.w < 768;

  // ---- 计算单页尺寸 ----
  const settingsPageWidth = settings?.pageWidth ?? 800;

  const pageDimensions = useMemo(() => {
    if (containerSize.w === 0 || containerSize.h === 0) {
      return { pageW: 400, pageH: 560 };
    }

    const availH = containerSize.h - 32;

    if (isMobile) {
      return { pageW: containerSize.w, pageH: containerSize.h };
    }

    const maxBookWidth = containerSize.w - 48;
    const targetBookWidth = Math.min(settingsPageWidth, maxBookWidth);
    const singlePageW = Math.floor(targetBookWidth / 2);
    const singlePageH = Math.min(availH, singlePageW * 1.4);

    return {
      pageW: singlePageW,
      pageH: singlePageH,
    };
  }, [containerSize, isMobile, settingsPageWidth]);

  // ---- 内容区域尺寸（去除 padding 和页码空间） ----
  const pagePadding = isMobile ? 16 : 40;
  const contentWidth = Math.max(200, pageDimensions.pageW - pagePadding * 2);
  const contentHeight = Math.max(200, pageDimensions.pageH - pagePadding * 2 - 24);

  // ---- 分页（混合：已加载精确 + 未加载估算） ----
  const pagination = useBookPagination(
    chapters,
    chaptersMeta,
    epubStyles,
    settings,
    contentWidth,
    contentHeight,
  );

  // ---- 章节字符偏移表（基于服务端元数据，不依赖 HTML 解析） ----
  const { chapterTextLengths, chapterCumOffsets, totalTextLength } = useMemo(() => {
    if (chaptersMeta.length === 0) {
      return { chapterTextLengths: [], chapterCumOffsets: [0], totalTextLength: totalCharacters };
    }
    const lengths: number[] = [];
    const cumOffsets: number[] = [0];
    let total = 0;
    for (const meta of chaptersMeta) {
      lengths.push(meta.charLength);
      total += meta.charLength;
      cumOffsets.push(total);
    }
    return { chapterTextLengths: lengths, chapterCumOffsets: cumOffsets, totalTextLength: total };
  }, [chaptersMeta, totalCharacters]);

  /** 页码 → 全书字符偏移量 */
  const pageToCharOffset = useCallback((page: number): number => {
    if (totalTextLength === 0 || pagination.totalPages === 0) return 0;
    const info = getChapterForPage(page, pagination.chapterPageRanges);
    if (!info) return 0;
    const chIdx = info.chapterIndex;
    const chPages = pagination.chapterPageRanges[chIdx]?.pageCount ?? 1;
    const ratio = info.pageInChapter / Math.max(1, chPages);
    return Math.round(chapterCumOffsets[chIdx] + ratio * chapterTextLengths[chIdx]);
  }, [totalTextLength, pagination.totalPages, pagination.chapterPageRanges, chapterCumOffsets, chapterTextLengths]);

  /** 全书字符偏移量 → 页码 */
  const charOffsetToPage = useCallback((offset: number): number => {
    if (totalTextLength === 0 || pagination.totalPages === 0 || offset <= 0) return 0;
    let chIdx = 0;
    for (let i = 1; i < chapterCumOffsets.length; i++) {
      if (offset < chapterCumOffsets[i]) { chIdx = i - 1; break; }
      chIdx = i - 1;
    }
    const localOffset = offset - chapterCumOffsets[chIdx];
    const chTextLen = chapterTextLengths[chIdx] || 1;
    const ratio = Math.min(localOffset / chTextLen, 1);
    const range = pagination.chapterPageRanges[chIdx];
    if (!range) return 0;
    const pageInChapter = Math.min(Math.round(ratio * range.pageCount), range.pageCount - 1);
    return Math.min(range.startPage + pageInChapter, pagination.totalPages - 1);
  }, [totalTextLength, pagination.totalPages, pagination.chapterPageRanges, chapterCumOffsets, chapterTextLengths]);

  // ---- 解析保存的阅读进度 → charOffset ----
  const savedCharOffset = useMemo(() => {
    if (!initialLocation) return 0;
    if (initialLocation.startsWith('char:')) {
      const parsed = parseInt(initialLocation.replace('char:', ''), 10);
      return isNaN(parsed) || parsed < 0 ? 0 : parsed;
    }
    // 兼容旧 page:N/Total 格式
    if (initialLocation.startsWith('page:')) {
      const rest = initialLocation.replace('page:', '');
      if (rest.includes('/')) {
        const [p, t] = rest.split('/');
        const page = parseInt(p, 10) || 0;
        const total = parseInt(t, 10) || 0;
        if (total > 0 && page > 0) {
          return Math.round((page / Math.max(1, total - 1)) * totalTextLength);
        }
      }
      const page = parseInt(rest, 10) || 0;
      if (page > 0 && pagination.totalPages > 0) {
        return Math.round((page / Math.max(1, pagination.totalPages - 1)) * totalTextLength);
      }
    }
    return 0;
  }, [initialLocation, totalTextLength, pagination.totalPages]);

  const startPage = useMemo(() => {
    if (!pagination.isReady || pagination.totalPages === 0) return 0;
    if (savedCharOffset <= 0) return 0;
    return charOffsetToPage(savedCharOffset);
  }, [pagination.isReady, pagination.totalPages, savedCharOffset, charOffsetToPage]);

  // ---- 主题 & 排版设置 ----
  const theme = settings?.theme || 'light';
  const themeClass =
    theme === 'dark' ? 'book-theme-dark' :
    theme === 'sepia' ? 'book-theme-sepia' : '';
  const fontSize = settings?.fontSize ?? 16;
  const lineHeightVal = settings?.lineHeight ?? 1.8;
  const fontFamily = settings?.fontFamily ?? 'system';

  // ---- 设置指纹（用于进度恢复） ----
  const settingsFingerprint = `${fontSize}_${lineHeightVal}_${fontFamily}_${pageDimensions.pageW}_${pageDimensions.pageH}`;

  // ---- 外部页面存储 ----
  const [pageStore] = useState(createPageStore);

  useEffect(() => {
    pageStore.setLazyWindow(isMobile ? LAZY_WINDOW_MOBILE : LAZY_WINDOW_DESKTOP);
  }, [isMobile, pageStore]);

  const [showBook, setShowBook] = useState(false);
  const [flipBookKey, setFlipBookKey] = useState('');
  const [paginatedSettingsKey, setPaginatedSettingsKey] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flipBookRef = useRef<any>(null);
  const initializedRef = useRef(false);
  const prevTotalRef = useRef(0);
  const flipTargetRef = useRef(0);
  const currentPageRef = useRef(0);
  const lazyUpdateTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const remountCountRef = useRef(0);
  // 用 ref 持有 onProgressUpdate，避免 effect 依赖变化
  const onProgressUpdateRef = useRef(onProgressUpdate);
  useEffect(() => {
    onProgressUpdateRef.current = onProgressUpdate;
  }, [onProgressUpdate]);

  useEffect(() => {
    if (!pagination.isReady) return;

    let settingsChanged = false;

    if (!initializedRef.current) {
      initializedRef.current = true;
      prevTotalRef.current = pagination.totalPages;
      flipTargetRef.current = startPage;
      currentPageRef.current = startPage;
    } else if (prevTotalRef.current > 0 && pagination.totalPages !== prevTotalRef.current) {
      // 设置变化导致总页数改变 → 按比例映射到新页码
      const ratio = currentPageRef.current / Math.max(1, prevTotalRef.current - 1);
      const newPage = Math.min(
        Math.round(ratio * (pagination.totalPages - 1)),
        pagination.totalPages - 1,
      );
      prevTotalRef.current = pagination.totalPages;
      currentPageRef.current = newPage;
      settingsChanged = true;
    }

    pageStore.setInitialPage(currentPageRef.current);
    pageStore.setPage(currentPageRef.current);

    remountCountRef.current++;
    setFlipBookKey(`${remountCountRef.current}_${pagination.totalPages}_${pageDimensions.pageW}_${pageDimensions.pageH}`);
    setShowBook(false);
    setPaginatedSettingsKey(settingsFingerprint);

    // 设置变更后，上报新页码（防抖由 reader page 的 handleProgressUpdate 负责）
    if (settingsChanged && pagination.totalPages > 0) {
      const page = currentPageRef.current;
      const pct = Math.round((page / Math.max(1, pagination.totalPages - 1)) * 100);
      const charOffset = pageToCharOffset(page);
      onProgressUpdateRef.current?.(pct, `char:${charOffset}`, {
        pageNumber: page,
        settingsFingerprint,
      });
    }
  }, [pagination.isReady, pagination.totalPages, startPage, pageDimensions.pageW, pageDimensions.pageH, fontSize, lineHeightVal, fontFamily, pageStore, settingsFingerprint, pageToCharOffset]);

  useEffect(() => {
    if (!flipBookKey) return;

    const timer = setTimeout(() => {
      const page = currentPageRef.current;
      if (page > 0) {
        flipBookRef.current?.pageFlip()?.turnToPage(page);
      }
      pageStore.setPage(page);
      setShowBook(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [flipBookKey, pageStore]);

  // ---- 翻页事件 + 章节预取 ----

  const handleFlip = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      const targetPage = e.data as number;
      flipTargetRef.current = targetPage;
      currentPageRef.current = targetPage;

      if (lazyUpdateTimer.current) clearTimeout(lazyUpdateTimer.current);
      pageStore.setPage(targetPage);

      // 通知 useServerChapters 当前章节，触发预取
      const info = getChapterForPage(targetPage, pagination.chapterPageRanges);
      if (info) {
        updateCurrentChapter(info.chapterIndex);
      }
    },
    [pageStore, pagination.chapterPageRanges, updateCurrentChapter],
  );

  const handleChangeState = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      if (e.data === 'read') {
        const page = flipTargetRef.current;
        currentPageRef.current = page;

        if (lazyUpdateTimer.current) clearTimeout(lazyUpdateTimer.current);
        lazyUpdateTimer.current = setTimeout(() => {
          pageStore.setPage(page);
          if (pagination.totalPages > 0) {
            const pct = Math.round((page / Math.max(1, pagination.totalPages - 1)) * 100);
            const charOffset = pageToCharOffset(page);
            onProgressUpdate?.(pct, `char:${charOffset}`, {
              pageNumber: page,
              settingsFingerprint,
            });
          }
        }, 300);
      }
    },
    [pagination.totalPages, onProgressUpdate, pageStore, pageToCharOffset, settingsFingerprint],
  );

  useEffect(() => {
    return () => {
      if (lazyUpdateTimer.current) clearTimeout(lazyUpdateTimer.current);
    };
  }, []);

  // ---- 键盘翻页 ----
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const pageFlip = flipBookRef.current?.pageFlip();
      if (!pageFlip) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        pageFlip.flipNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        pageFlip.flipPrev();
      }
    };

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, []);

  // ---- 是否就绪 ----
  const contentParsed = !isLoading && !error;
  const ready = contentParsed && pagination.isReady && pagination.totalPages > 0 && containerSize.w > 0;
  const emptyContent = contentParsed && pagination.isReady && pagination.totalPages === 0 && chaptersMeta.length === 0;

  // ---- render 阶段立刻检测设置变化 ----
  const settingsChanged = paginatedSettingsKey !== '' && paginatedSettingsKey !== settingsFingerprint;

  // ---- 构建页面数据 ----
  const chapterPageCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const range of pagination.chapterPageRanges) {
      counts[range.chapterIndex] = range.pageCount;
    }
    return counts;
  }, [pagination.chapterPageRanges]);

  const pages = useMemo(() => {
    if (pagination.totalPages === 0 || containerSize.w === 0) return [];
    return Array.from({ length: pagination.totalPages }, (_, i) => {
      const info = getChapterForPage(i, pagination.chapterPageRanges);
      const chIdx = info?.chapterIndex ?? 0;
      return {
        pageIndex: i,
        chapterIndex: chIdx,
        pageInChapter: info?.pageInChapter ?? 0,
        chapterPages: chapterPageCounts[chIdx] ?? 1,
      };
    });
  }, [pagination.totalPages, pagination.chapterPageRanges, chapterPageCounts, containerSize.w]);

  // ---- 稳定的 children 数组 ----
  const stableChildren = useMemo(() => {
    return pages.map((p) => (
      <BookPage
        key={p.pageIndex}
        pageIndex={p.pageIndex}
        chapterHtml={chapters[p.chapterIndex]?.html || ''}
        pageInChapter={p.pageInChapter}
        chapterPages={p.chapterPages}
        pageWidth={contentWidth}
        pageHeight={contentHeight}
        pageNumber={p.pageIndex + 1}
        totalPages={pagination.totalPages}
        fontSize={fontSize}
        lineHeight={lineHeightVal}
        fontFamily={fontFamily}
        theme={theme}
        padding={pagePadding}
      />
    ));
  }, [pages, chapters, contentWidth, contentHeight, pagination.totalPages, fontSize, lineHeightVal, fontFamily, theme, pagePadding]);

  return (
    <div ref={containerRef} className={`book-container ${themeClass}`}>
      {error && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-sm opacity-60 mb-2">EPUB 加载失败</p>
            <p className="text-xs opacity-40">{error}</p>
          </div>
        </div>
      )}

      {emptyContent && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-sm opacity-60 mb-2">EPUB 内容为空</p>
            <p className="text-xs opacity-40">未能从该文件中提取到任何章节内容</p>
          </div>
        </div>
      )}

      {ready && (
        <style dangerouslySetInnerHTML={{ __html: `
          .epub-page-content * {
            max-width: 100% !important;
            box-sizing: border-box !important;
          }
          .epub-page-content img {
            max-width: 100% !important;
            height: auto !important;
            object-fit: contain !important;
          }
          .epub-page-content a {
            color: inherit !important;
            text-decoration: underline;
          }
          .epub-page-content h1, .epub-page-content h2, .epub-page-content h3 {
            margin-top: 0.5em;
            margin-bottom: 0.3em;
          }
          .epub-page-content p {
            margin: 0.5em 0;
            text-align: justify !important;
            text-indent: 2em !important;
          }
          .epub-page-content h1, .epub-page-content h2, .epub-page-content h3,
          .epub-page-content h4, .epub-page-content h5, .epub-page-content h6 {
            text-indent: 0 !important;
            text-align: left !important;
          }
          .epub-page-content blockquote {
            text-indent: 0 !important;
          }
          .epub-page-content {
            text-align: justify !important;
          }
          ${epubStyles}
        ` }} />
      )}

      {pages.length > 0 && containerSize.w > 0 && flipBookKey && (
        <div
          className="book-frame"
          style={{
            position: 'relative',
            opacity: showBook ? 1 : 0,
            transition: 'opacity 0.3s ease-in',
          }}
        >
          {!isMobile && <div className="book-shadow" />}
          {!isMobile && <div className="page-stack-left" />}
          {!isMobile && <div className="page-stack-right" />}

          <PageStoreContext.Provider value={pageStore}>
            <HTMLFlipBook
              key={flipBookKey}
              ref={flipBookRef}
              className="book-flipbook"
              width={pageDimensions.pageW}
              height={pageDimensions.pageH}
              size="fixed"
              minWidth={200}
              maxWidth={600}
              minHeight={300}
              maxHeight={900}
              showCover={false}
              mobileScrollSupport={true}
              useMouseEvents={true}
              usePortrait={isMobile}
              singlePage={isMobile}
              flippingTime={isMobile ? 300 : 600}
              drawShadow={!isMobile}
              maxShadowOpacity={isMobile ? 0.15 : 0.25}
              showPageCorners={!isMobile}
              disableFlipByClick={isMobile}
              clickEventForward={!isMobile}
              swipeDistance={15}
              startPage={startPage}
              startZIndex={2}
              autoSize={false}
              onFlip={handleFlip}
              onChangeState={handleChangeState}
              style={{}}
            >
              {stableChildren}
            </HTMLFlipBook>
          </PageStoreContext.Provider>

          {!isMobile && (
            <div className="book-spine" />
          )}

        </div>
      )}

      {/* ---- 统一遮罩 ---- */}
      <div
        className="book-loading"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 30,
          background:
            theme === 'dark'
              ? 'rgb(26,23,20)'
              : theme === 'sepia'
              ? 'rgb(228,216,191)'
              : 'rgb(250,247,242)',
          opacity: (!error && !emptyContent && (!showBook || !pagination.isReady || settingsChanged)) ? 1 : 0,
          pointerEvents: (!error && !emptyContent && (!showBook || !pagination.isReady || settingsChanged)) ? 'auto' : 'none',
          transition: 'opacity 0.15s ease',
        }}
      >
        <div className="book-loading-spinner" />
        <span className="text-xs opacity-50" style={{
          fontFamily: 'Georgia, "Times New Roman", "Songti SC", serif',
          letterSpacing: '1px',
        }}>
          {isLoading
            ? '正在加载章节…'
            : '排版中…'}
        </span>
      </div>
    </div>
  );
}

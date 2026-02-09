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

// ---- 页面级滑动窗口配置 ----
// 只给 HTMLFlipBook 传 windowSize 个页面，而非全部。
// 接近边界时移窗重建，DOM 节点数从 N 降到 ~windowSize。
const PAGE_WINDOW_DESKTOP = 60;   // 桌面端窗口页数
const PAGE_WINDOW_MOBILE = 30;    // 移动端窗口页数
const SHIFT_THRESHOLD = 6;        // 距离窗口边界多少页时触发移窗

// ---- 页面状态外部存储 ----
export interface PageStoreType {
  subscribe: (cb: () => void) => () => void;
  getPage: () => number;
  setPage: (page: number) => void;
  getInitialPage: () => number;
  setInitialPage: (page: number) => void;
  getLazyWindow: () => number;
  setLazyWindow: (w: number) => void;
}

export const PageStoreContext = createContext<PageStoreType | null>(null);

function createPageStore(): PageStoreType {
  let currentPage = 0;
  let initialPage = 0;
  let lazyWindow = 30;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(l => l());

  return {
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    getPage: () => currentPage,
    setPage: (page: number) => {
      if (currentPage !== page) { currentPage = page; notify(); }
    },
    getInitialPage: () => initialPage,
    setInitialPage: (page: number) => {
      if (initialPage !== page) { initialPage = page; notify(); }
    },
    getLazyWindow: () => lazyWindow,
    setLazyWindow: (w: number) => {
      if (lazyWindow !== w) { lazyWindow = w; notify(); }
    },
  };
}

/** 计算以 center 为中心的页面窗口 [start, end) */
function calcPageWindow(center: number, totalPages: number, windowSize: number) {
  if (totalPages <= windowSize) {
    return { start: 0, end: totalPages };
  }
  let start = Math.max(0, center - Math.floor(windowSize / 2));
  let end = start + windowSize;
  if (end > totalPages) {
    end = totalPages;
    start = end - windowSize;
  }
  return { start, end };
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
        if (prev.w === 0 && prev.h === 0) return { w: newW, h: newH };
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

  // ---- 初始 charOffset ----
  const initialCharOffset = useMemo(() => parseInitialCharOffset(initialLocation), [initialLocation]);

  // ---- 服务端章节加载 ----
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
  const pageWindowSize = isMobile ? PAGE_WINDOW_MOBILE : PAGE_WINDOW_DESKTOP;

  // ---- 计算单页尺寸 ----
  const settingsPageWidth = settings?.pageWidth ?? 800;
  const pageDimensions = useMemo(() => {
    if (containerSize.w === 0 || containerSize.h === 0) return { pageW: 400, pageH: 560 };
    const availH = containerSize.h - 32;
    if (isMobile) return { pageW: containerSize.w, pageH: containerSize.h };
    const maxBookWidth = containerSize.w - 48;
    const targetBookWidth = Math.min(settingsPageWidth, maxBookWidth);
    const singlePageW = Math.floor(targetBookWidth / 2);
    const singlePageH = Math.min(availH, singlePageW * 1.4);
    return { pageW: singlePageW, pageH: singlePageH };
  }, [containerSize, isMobile, settingsPageWidth]);

  // ---- 内容区域尺寸 ----
  const pagePadding = isMobile ? 16 : 40;
  const contentWidth = Math.max(200, pageDimensions.pageW - pagePadding * 2);
  const contentHeight = Math.max(200, pageDimensions.pageH - pagePadding * 2 - 24);

  // ---- 分页 ----
  const pagination = useBookPagination(chapters, chaptersMeta, epubStyles, settings, contentWidth, contentHeight);

  // ---- 章节字符偏移表（基于服务端元数据）----
  const { chapterTextLengths, chapterCumOffsets, totalTextLength } = useMemo(() => {
    if (chaptersMeta.length === 0) return { chapterTextLengths: [], chapterCumOffsets: [0], totalTextLength: totalCharacters };
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

  const pageToCharOffset = useCallback((page: number): number => {
    if (totalTextLength === 0 || pagination.totalPages === 0) return 0;
    const info = getChapterForPage(page, pagination.chapterPageRanges);
    if (!info) return 0;
    const chIdx = info.chapterIndex;
    const chPages = pagination.chapterPageRanges[chIdx]?.pageCount ?? 1;
    const ratio = info.pageInChapter / Math.max(1, chPages);
    return Math.round(chapterCumOffsets[chIdx] + ratio * chapterTextLengths[chIdx]);
  }, [totalTextLength, pagination.totalPages, pagination.chapterPageRanges, chapterCumOffsets, chapterTextLengths]);

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

  // ---- 解析保存的阅读进度 ----
  const savedCharOffset = useMemo(() => {
    if (!initialLocation) return 0;
    if (initialLocation.startsWith('char:')) {
      const parsed = parseInt(initialLocation.replace('char:', ''), 10);
      return isNaN(parsed) || parsed < 0 ? 0 : parsed;
    }
    if (initialLocation.startsWith('page:')) {
      const rest = initialLocation.replace('page:', '');
      if (rest.includes('/')) {
        const [p, t] = rest.split('/');
        const page = parseInt(p, 10) || 0;
        const total = parseInt(t, 10) || 0;
        if (total > 0 && page > 0) return Math.round((page / Math.max(1, total - 1)) * totalTextLength);
      }
      const page = parseInt(rest, 10) || 0;
      if (page > 0 && pagination.totalPages > 0) return Math.round((page / Math.max(1, pagination.totalPages - 1)) * totalTextLength);
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
  const themeClass = theme === 'dark' ? 'book-theme-dark' : theme === 'sepia' ? 'book-theme-sepia' : '';
  const fontSize = settings?.fontSize ?? 16;
  const lineHeightVal = settings?.lineHeight ?? 1.8;
  const fontFamily = settings?.fontFamily ?? 'system';
  const settingsFingerprint = `${fontSize}_${lineHeightVal}_${fontFamily}_${pageDimensions.pageW}_${pageDimensions.pageH}`;

  // ---- 外部页面存储 ----
  const [pageStore] = useState(createPageStore);
  useEffect(() => {
    pageStore.setLazyWindow(Math.floor(pageWindowSize / 2));
  }, [pageWindowSize, pageStore]);

  const [showBook, setShowBook] = useState(false);
  const [flipBookKey, setFlipBookKey] = useState('');
  const [paginatedSettingsKey, setPaginatedSettingsKey] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flipBookRef = useRef<any>(null);
  const initializedRef = useRef(false);
  const prevTotalRef = useRef(0);
  const flipTargetRef = useRef(0);
  const currentPageRef = useRef(0);            // 全局页码
  const lazyUpdateTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const remountCountRef = useRef(0);

  // ---- 页面级滑动窗口 ----
  // windowStart: 当前窗口的全局起始页码（state，参与渲染）
  // 只传窗口内的页面给 HTMLFlipBook，大幅减少 DOM 节点数
  const [windowStart, setWindowStart] = useState(0);

  const onProgressUpdateRef = useRef(onProgressUpdate);
  useEffect(() => { onProgressUpdateRef.current = onProgressUpdate; }, [onProgressUpdate]);

  const prevSettingsFpRef = useRef('');
  const prevStartPageRef = useRef(-1);

  /** 触发 FlipBook remount：设置窗口 + key */
  const doRemount = useCallback((globalPage: number) => {
    const win = calcPageWindow(globalPage, pagination.totalPages, pageWindowSize);
    setWindowStart(win.start);

    pageStore.setInitialPage(globalPage);
    pageStore.setPage(globalPage);

    remountCountRef.current++;
    setFlipBookKey(`${remountCountRef.current}_${pagination.totalPages}_${pageDimensions.pageW}_${pageDimensions.pageH}_${win.start}`);
    setShowBook(false);
    setPaginatedSettingsKey(settingsFingerprint);
  }, [pagination.totalPages, pageWindowSize, pageDimensions.pageW, pageDimensions.pageH, settingsFingerprint, pageStore]);

  useEffect(() => {
    if (!pagination.isReady) return;

    const isSettingsChange = prevSettingsFpRef.current !== '' && prevSettingsFpRef.current !== settingsFingerprint;
    const isProgressRestore = prevStartPageRef.current >= 0 && startPage !== prevStartPageRef.current && startPage > 0;

    prevSettingsFpRef.current = settingsFingerprint;
    prevStartPageRef.current = startPage;

    if (!initializedRef.current) {
      // ---- 首次初始化 ----
      initializedRef.current = true;
      prevTotalRef.current = pagination.totalPages;
      flipTargetRef.current = startPage;
      currentPageRef.current = startPage;
      doRemount(startPage); // eslint-disable-line
    } else if (isSettingsChange) {
      // ---- 设置变更 → 全量 remount ----
      if (prevTotalRef.current > 0 && pagination.totalPages !== prevTotalRef.current) {
        const ratio = currentPageRef.current / Math.max(1, prevTotalRef.current - 1);
        currentPageRef.current = Math.min(Math.round(ratio * (pagination.totalPages - 1)), pagination.totalPages - 1);
      }
      prevTotalRef.current = pagination.totalPages;
      doRemount(currentPageRef.current);

      if (pagination.totalPages > 0) {
        const page = currentPageRef.current;
        const pct = Math.round((page / Math.max(1, pagination.totalPages - 1)) * 100);
        const charOffset = pageToCharOffset(page);
        onProgressUpdateRef.current?.(pct, `char:${charOffset}`, { pageNumber: page, settingsFingerprint });
      }
    } else if (isProgressRestore) {
      // ---- SWR 重新验证带来新进度 ----
      prevTotalRef.current = pagination.totalPages;
      currentPageRef.current = startPage;
      flipTargetRef.current = startPage;
      doRemount(startPage);
    } else if (pagination.totalPages !== prevTotalRef.current) {
      // ---- 新章节加载导致页数微调 → 静默更新 ----
      prevTotalRef.current = pagination.totalPages;
    }
  }, [pagination.isReady, pagination.totalPages, startPage, pageDimensions.pageW, pageDimensions.pageH, fontSize, lineHeightVal, fontFamily, pageStore, settingsFingerprint, pageToCharOffset, doRemount]);

  // FlipBook remount 后 → 跳转到正确页码 → 淡入
  // windowStart 在 doRemount 中已同步设置，此处通过闭包捕获最新值
  const windowStartForEffect = windowStart;
  useEffect(() => {
    if (!flipBookKey) return;
    const timer = setTimeout(() => {
      const globalPage = currentPageRef.current;
      const localPage = globalPage - windowStartForEffect;
      if (localPage > 0) {
        flipBookRef.current?.pageFlip()?.turnToPage(localPage);
      }
      pageStore.setPage(globalPage);
      setShowBook(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [flipBookKey, pageStore, windowStartForEffect]);

  // ---- 翻页事件 ----
  const handleFlip = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      const localPage = e.data as number;
      const globalPage = localPage + windowStart;
      flipTargetRef.current = globalPage;
      currentPageRef.current = globalPage;

      if (lazyUpdateTimer.current) clearTimeout(lazyUpdateTimer.current);
      pageStore.setPage(globalPage);

      // 章节预取
      const info = getChapterForPage(globalPage, pagination.chapterPageRanges);
      if (info) updateCurrentChapter(info.chapterIndex);

      // 检查是否需要移窗
      const winStart = windowStart;
      const winEnd = winStart + pageWindowSize;
      const nearStart = localPage < SHIFT_THRESHOLD && winStart > 0;
      const nearEnd = localPage > (winEnd - winStart) - SHIFT_THRESHOLD && winEnd < pagination.totalPages;

      if (nearStart || nearEnd) {
        // 延迟移窗，等翻页动画完成
        setTimeout(() => {
          doRemount(currentPageRef.current);
        }, 400);
      }
    },
    [pageStore, pagination.chapterPageRanges, pagination.totalPages, updateCurrentChapter, pageWindowSize, doRemount, windowStart],
  );

  const handleChangeState = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      if (e.data === 'read') {
        const globalPage = flipTargetRef.current;
        currentPageRef.current = globalPage;

        if (lazyUpdateTimer.current) clearTimeout(lazyUpdateTimer.current);
        lazyUpdateTimer.current = setTimeout(() => {
          pageStore.setPage(globalPage);
          if (pagination.totalPages > 0) {
            const pct = Math.round((globalPage / Math.max(1, pagination.totalPages - 1)) * 100);
            const charOffset = pageToCharOffset(globalPage);
            onProgressUpdate?.(pct, `char:${charOffset}`, { pageNumber: globalPage, settingsFingerprint });
          }
        }, 300);
      }
    },
    [pagination.totalPages, onProgressUpdate, pageStore, pageToCharOffset, settingsFingerprint],
  );

  useEffect(() => { return () => { if (lazyUpdateTimer.current) clearTimeout(lazyUpdateTimer.current); }; }, []);

  // ---- 键盘翻页 ----
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const pageFlip = flipBookRef.current?.pageFlip();
      if (!pageFlip) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') pageFlip.flipNext();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') pageFlip.flipPrev();
    };
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, []);

  // ---- 是否就绪 ----
  const contentParsed = !isLoading && !error;
  const ready = contentParsed && pagination.isReady && pagination.totalPages > 0 && containerSize.w > 0;
  const emptyContent = contentParsed && pagination.isReady && pagination.totalPages === 0 && chaptersMeta.length === 0;
  const settingsChanged = paginatedSettingsKey !== '' && paginatedSettingsKey !== settingsFingerprint;

  // ---- 构建页面数据（全量元数据，用于查找）----
  const chapterPageCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const range of pagination.chapterPageRanges) counts[range.chapterIndex] = range.pageCount;
    return counts;
  }, [pagination.chapterPageRanges]);

  // ---- 窗口内的页面 ----
  const windowedPages = useMemo(() => {
    if (pagination.totalPages === 0 || containerSize.w === 0) return [];
    const winEnd = Math.min(windowStart + pageWindowSize, pagination.totalPages);

    return Array.from({ length: winEnd - windowStart }, (_, idx) => {
      const globalIdx = windowStart + idx;
      const info = getChapterForPage(globalIdx, pagination.chapterPageRanges);
      const chIdx = info?.chapterIndex ?? 0;
      return {
        globalPageIndex: globalIdx,
        chapterIndex: chIdx,
        pageInChapter: info?.pageInChapter ?? 0,
        chapterPages: chapterPageCounts[chIdx] ?? 1,
      };
    });
  }, [pagination.totalPages, pagination.chapterPageRanges, chapterPageCounts, containerSize.w, pageWindowSize, windowStart]);

  // ---- 稳定的 children 数组（仅窗口内的页面）----
  const stableChildren = useMemo(() => {
    return windowedPages.map((p) => (
      <BookPage
        key={p.globalPageIndex}
        pageIndex={p.globalPageIndex}
        chapterHtml={chapters[p.chapterIndex]?.html || ''}
        pageInChapter={p.pageInChapter}
        chapterPages={p.chapterPages}
        pageWidth={contentWidth}
        pageHeight={contentHeight}
        pageNumber={p.globalPageIndex + 1}
        totalPages={pagination.totalPages}
        fontSize={fontSize}
        lineHeight={lineHeightVal}
        fontFamily={fontFamily}
        theme={theme}
        padding={pagePadding}
      />
    ));
  }, [windowedPages, chapters, contentWidth, contentHeight, pagination.totalPages, fontSize, lineHeightVal, fontFamily, theme, pagePadding]);

  // 当前页在窗口内的本地起始位置
  const localStartPage = startPage >= windowStart ? startPage - windowStart : 0;

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
          .epub-page-content * { max-width: 100% !important; box-sizing: border-box !important; }
          .epub-page-content img { max-width: 100% !important; height: auto !important; object-fit: contain !important; }
          .epub-page-content a { color: inherit !important; text-decoration: underline; }
          .epub-page-content h1, .epub-page-content h2, .epub-page-content h3 { margin-top: 0.5em; margin-bottom: 0.3em; }
          .epub-page-content p { margin: 0.5em 0; text-align: justify !important; text-indent: 2em !important; }
          .epub-page-content h1, .epub-page-content h2, .epub-page-content h3,
          .epub-page-content h4, .epub-page-content h5, .epub-page-content h6 { text-indent: 0 !important; text-align: left !important; }
          .epub-page-content blockquote { text-indent: 0 !important; }
          .epub-page-content { text-align: justify !important; }
          ${epubStyles}
        ` }} />
      )}

      {windowedPages.length > 0 && containerSize.w > 0 && flipBookKey && (
        <div
          className="book-frame"
          style={{ position: 'relative', opacity: showBook ? 1 : 0, transition: 'opacity 0.3s ease-in' }}
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
              startPage={localStartPage}
              startZIndex={2}
              autoSize={false}
              onFlip={handleFlip}
              onChangeState={handleChangeState}
              style={{}}
            >
              {stableChildren}
            </HTMLFlipBook>
          </PageStoreContext.Provider>

          {!isMobile && <div className="book-spine" />}
        </div>
      )}

      {/* 统一遮罩 */}
      <div
        className="book-loading"
        style={{
          position: 'absolute', inset: 0, zIndex: 30,
          background: theme === 'dark' ? 'rgb(26,23,20)' : theme === 'sepia' ? 'rgb(228,216,191)' : 'rgb(250,247,242)',
          opacity: (!error && !emptyContent && (!showBook || !pagination.isReady || settingsChanged)) ? 1 : 0,
          pointerEvents: (!error && !emptyContent && (!showBook || !pagination.isReady || settingsChanged)) ? 'auto' : 'none',
          transition: 'opacity 0.15s ease',
        }}
      >
        <div className="book-loading-spinner" />
        <span className="text-xs opacity-50" style={{ fontFamily: 'Georgia, "Times New Roman", "Songti SC", serif', letterSpacing: '1px' }}>
          {isLoading ? '正在加载章节…' : '排版中…'}
        </span>
      </div>
    </div>
  );
}

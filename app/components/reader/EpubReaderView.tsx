/*
 * :file description: 
 * :name: /ink-and-code/app/components/reader/EpubReaderView.tsx
 * :author: PTC
 * :copyright: (c) 2026, Tungee
 * :date created: 2026-02-07 11:33:11
 * :last editor: PTC
 * :date last edited: 2026-02-12 17:46:09
 */
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

// ---- 页面状态外部存储（BookPage 子组件订阅，避免父组件重渲染） ----
export interface PageStoreType {
  subscribe: (cb: () => void) => () => void;
  getPage: () => number;
  setPage: (page: number) => void;
  getInitialPage: () => number;
  setInitialPage: (page: number) => void;
  /** 批量更新 page + initialPage，只触发一次 notify */
  setBoth: (page: number) => void;
  getLazyWindow: () => number;
  setLazyWindow: (w: number) => void;
}

export const PageStoreContext = createContext<PageStoreType | null>(null);

function createPageStore(): PageStoreType {
  let currentPage = 0;
  let initialPage = 0;
  let lazyWindow = 10;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(l => l());
  return {
    subscribe: (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    getPage: () => currentPage,
    setPage: (p: number) => { if (currentPage !== p) { currentPage = p; notify(); } },
    getInitialPage: () => initialPage,
    setInitialPage: (p: number) => { if (initialPage !== p) { initialPage = p; notify(); } },
    /** 批量更新 page + initialPage，只触发一次 notify */
    setBoth: (p: number) => {
      const changed = currentPage !== p || initialPage !== p;
      currentPage = p; initialPage = p;
      if (changed) notify();
    },
    getLazyWindow: () => lazyWindow,
    setLazyWindow: (w: number) => { if (lazyWindow !== w) { lazyWindow = w; notify(); } },
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
  onReady?: () => void;
}

/**
 * 解析进度位置字符串。
 * 格式："char:25000|page:50|fp:16_1.8_system_376_527"
 * 向后兼容旧格式 "char:25000"（无 page/fp 部分）。
 */
function parseInitialLocation(loc?: string): { charOffset: number; pageNumber: number; settingsFingerprint: string } {
  if (!loc) return { charOffset: 0, pageNumber: -1, settingsFingerprint: '' };
  let charOffset = 0, pageNumber = -1, fp = '';
  for (const part of loc.split('|')) {
    if (part.startsWith('char:')) { const n = parseInt(part.slice(5), 10); if (!isNaN(n) && n >= 0) charOffset = n; }
    else if (part.startsWith('page:')) { const n = parseInt(part.slice(5), 10); if (!isNaN(n) && n >= 0) pageNumber = n; }
    else if (part.startsWith('fp:')) { fp = part.slice(3); }
  }
  return { charOffset, pageNumber, settingsFingerprint: fp };
}

export default function EpubReaderView({
  bookId, initialLocation, settings, onProgressUpdate, onReady,
}: EpubReaderViewProps) {
  // ---- 容器尺寸 ----
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize(prev => {
        if (prev.w === 0 && prev.h === 0) return { w: rect.width, h: rect.height };
        const wc = Math.abs(rect.width - prev.w) > 1;
        const hc = Math.abs(rect.height - prev.h) > 100;
        return (wc || hc) ? { w: rect.width, h: hc ? rect.height : prev.h } : prev;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const parsedLocation = useMemo(() => parseInitialLocation(initialLocation), [initialLocation]);
  const initialCharOffset = parsedLocation.charOffset;

  // ---- 服务端章节 ----
  const {
    chaptersMeta, chaptersForPagination: chapters, styles: epubStyles,
    totalCharacters, isLoading, isFetchingChapters, error,
    updateCurrentChapter, isChapterLoaded, ensureChaptersLoaded,
  } = useServerChapters(bookId, initialCharOffset);

  const isMobile = containerSize.w > 0 && containerSize.w < 768;
  const settingsPageWidth = settings?.pageWidth ?? 800;

  const pageDimensions = useMemo(() => {
    if (containerSize.w === 0 || containerSize.h === 0) return { pageW: 400, pageH: 560 };
    if (isMobile) return { pageW: containerSize.w, pageH: containerSize.h };
    const maxBW = containerSize.w - 48;
    const targetBW = Math.min(settingsPageWidth, maxBW);
    const pw = Math.floor(targetBW / 2);
    const ph = Math.min(containerSize.h - 32, pw * 1.4);
    return { pageW: pw, pageH: ph };
  }, [containerSize, isMobile, settingsPageWidth]);

  const pagePadding = isMobile ? 16 : 40;
  const contentWidth = Math.max(200, pageDimensions.pageW - pagePadding * 2);
  const contentHeight = Math.max(200, pageDimensions.pageH - pagePadding * 2 - 24);

  const pagination = useBookPagination(chapters, chaptersMeta, epubStyles, settings, contentWidth, contentHeight);

  // ---- 章节字符偏移表 ----
  const { chapterTextLengths, chapterCumOffsets, totalTextLength } = useMemo(() => {
    if (chaptersMeta.length === 0) return { chapterTextLengths: [] as number[], chapterCumOffsets: [0], totalTextLength: totalCharacters };
    const lens: number[] = [], cum: number[] = [0];
    let t = 0;
    for (const m of chaptersMeta) { lens.push(m.charLength); t += m.charLength; cum.push(t); }
    return { chapterTextLengths: lens, chapterCumOffsets: cum, totalTextLength: t };
  }, [chaptersMeta, totalCharacters]);

  const pageToCharOffset = useCallback((page: number): number => {
    if (totalTextLength === 0 || pagination.totalPages === 0) return 0;
    const info = getChapterForPage(page, pagination.chapterPageRanges);
    if (info) {
      const chIdx = info.chapterIndex;
      const chPages = pagination.chapterPageRanges[chIdx]?.pageCount ?? 1;
      return Math.round(chapterCumOffsets[chIdx] + (info.pageInChapter / Math.max(1, chPages)) * chapterTextLengths[chIdx]);
    }
    return Math.round((page / Math.max(1, pagination.totalPages - 1)) * totalTextLength);
  }, [totalTextLength, pagination.totalPages, pagination.chapterPageRanges, chapterCumOffsets, chapterTextLengths]);

  const charOffsetToPage = useCallback((offset: number): number => {
    if (totalTextLength === 0 || pagination.totalPages === 0 || offset <= 0) return 0;
    if (pagination.chapterPageRanges.length > 0) {
      let chIdx = 0;
      for (let i = 1; i < chapterCumOffsets.length; i++) { if (offset < chapterCumOffsets[i]) { chIdx = i - 1; break; } chIdx = i - 1; }
      const localOff = offset - chapterCumOffsets[chIdx];
      const ratio = Math.min(localOff / (chapterTextLengths[chIdx] || 1), 1);
      const range = pagination.chapterPageRanges[chIdx];
      if (range) return Math.min(range.startPage + Math.min(Math.round(ratio * range.pageCount), range.pageCount - 1), pagination.totalPages - 1);
    }
    return Math.min(Math.round((offset / totalTextLength) * (pagination.totalPages - 1)), pagination.totalPages - 1);
  }, [totalTextLength, pagination.totalPages, pagination.chapterPageRanges, chapterCumOffsets, chapterTextLengths]);

  // ---- 排版设置（提前到 startPage 之前，精确恢复需要比较 settingsFingerprint） ----
  const theme = settings?.theme || 'light';
  const themeClass = theme === 'dark' ? 'book-theme-dark' : theme === 'sepia' ? 'book-theme-sepia' : '';
  const fontSize = settings?.fontSize ?? 16;
  const lineHeightVal = settings?.lineHeight ?? 1.8;
  const fontFamily = settings?.fontFamily ?? 'system';
  const settingsFingerprint = `${fontSize}_${lineHeightVal}_${fontFamily}_${pageDimensions.pageW}_${pageDimensions.pageH}`;

  // ---- 进度恢复 ----
  // 位置格式："char:25000|page:50|fp:16_1.8_system_376_527"
  //  - char: 字符偏移（跨设置近似恢复）
  //  - page: 精确页码（同设置精确恢复）
  //  - fp:   排版指纹（判断页码是否仍有效）
  const savedCharOffset = parsedLocation.charOffset;
  const savedPageNumber = parsedLocation.pageNumber;
  const savedSettingsFp = parsedLocation.settingsFingerprint;

  const startPage = useMemo(() => {
    if (!pagination.isReady || pagination.totalPages === 0) return 0;
    // 精确恢复：排版设置未变 + 已保存页码有效 → 直接使用页码（零偏差）
    if (savedPageNumber >= 0 && savedSettingsFp === settingsFingerprint && savedPageNumber < pagination.totalPages) {
      return savedPageNumber;
    }
    // 降级恢复：通过字符偏移近似定位（设置变更或旧格式数据）
    if (savedCharOffset <= 0) return 0;
    return charOffsetToPage(savedCharOffset);
  }, [pagination.isReady, pagination.totalPages, savedPageNumber, savedSettingsFp, settingsFingerprint, savedCharOffset, charOffsetToPage]);

  // ---- 外部页面存储 ----
  const [pageStore] = useState(createPageStore);
  const LAZY_WINDOW = isMobile ? 3 : 4;
  useEffect(() => { pageStore.setLazyWindow(LAZY_WINDOW); }, [LAZY_WINDOW, pageStore]);

  // ---- 核心状态 ----
  const [showBook, setShowBook] = useState(false);
  const [settingsKey, setSettingsKey] = useState('');
  // currentPage 状态仅在 需要库导航 时更新（init / 设置变更 / 进度恢复）。
  // 普通翻页只更新 ref，不触发 React 重渲染，避免库冗余 turnToPage。
  const [currentPage, setCurrentPage] = useState(0);
  const currentPageRef = useRef(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flipBookRef = useRef<any>(null);
  const initializedRef = useRef(false);
  const prevTotalRef = useRef(0);
  // rAF handle for deferred store updates during flip
  const flipRafRef = useRef(0);

  const onProgressUpdateRef = useRef(onProgressUpdate);
  useEffect(() => { onProgressUpdateRef.current = onProgressUpdate; }, [onProgressUpdate]);
  const onReadyRef = useRef(onReady);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  const prevSettingsFpRef = useRef('');
  const prevInitialLocationRef = useRef<string | undefined>(undefined);

  // ---- 初始化 & 变更 ----
  useEffect(() => {
    if (!pagination.isReady) return;
    if (!initializedRef.current && isLoading) return;
    // 等待 chapterPageRanges 的前提：需要通过 charOffset 近似定位（无精确页码可用）
    const canUseExactPage = savedPageNumber >= 0 && savedSettingsFp === settingsFingerprint;
    if (!initializedRef.current && !canUseExactPage && savedCharOffset > 0 && pagination.chapterPageRanges.length === 0) return;

    const isSettingsChange = prevSettingsFpRef.current !== '' && prevSettingsFpRef.current !== settingsFingerprint;
    const isProgressRestore = initializedRef.current && initialLocation !== prevInitialLocationRef.current && startPage > 0;
    const isLateProgressApply = initializedRef.current && startPage > 0 && currentPageRef.current === 0;

    prevSettingsFpRef.current = settingsFingerprint;

    if (!initializedRef.current) {
      initializedRef.current = true;
      prevInitialLocationRef.current = initialLocation;
      prevTotalRef.current = pagination.totalPages;
      currentPageRef.current = startPage;
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setCurrentPage(startPage);
      pageStore.setBoth(startPage);
      setSettingsKey(`init_${pagination.totalPages}_${pageDimensions.pageW}_${pageDimensions.pageH}`);
    } else if (isSettingsChange) {
      if (prevTotalRef.current > 0 && pagination.totalPages !== prevTotalRef.current) {
        const ratio = currentPageRef.current / Math.max(1, prevTotalRef.current - 1);
        currentPageRef.current = Math.min(Math.round(ratio * (pagination.totalPages - 1)), pagination.totalPages - 1);
      }
      prevTotalRef.current = pagination.totalPages;
      const gp = currentPageRef.current;
      setCurrentPage(gp);
      pageStore.setBoth(gp);
      setSettingsKey(`settings_${settingsFingerprint}`);
      setShowBook(false);
      if (pagination.totalPages > 0) {
        const pct = Math.round((gp / Math.max(1, pagination.totalPages - 1)) * 100);
        const charOff = pageToCharOffset(gp);
        onProgressUpdateRef.current?.(pct, `char:${charOff}|page:${gp}|fp:${settingsFingerprint}`, { pageNumber: gp, settingsFingerprint });
      }
    } else if (isProgressRestore || isLateProgressApply) {
      if (isProgressRestore) prevInitialLocationRef.current = initialLocation;
      prevTotalRef.current = pagination.totalPages;
      currentPageRef.current = startPage;
      setCurrentPage(startPage);
      pageStore.setBoth(startPage);
    } else if (pagination.totalPages !== prevTotalRef.current) {
      prevTotalRef.current = pagination.totalPages;
    }
  }, [pagination.isReady, isLoading, pagination.totalPages, pagination.chapterPageRanges.length, startPage, savedCharOffset, savedPageNumber, savedSettingsFp, initialLocation, pageDimensions.pageW, pageDimensions.pageH, fontSize, lineHeightVal, fontFamily, pageStore, settingsFingerprint, pageToCharOffset]);

  // ---- 淡入 ----
  useEffect(() => {
    if (!settingsKey) return;
    const t = setTimeout(() => { setShowBook(true); onReadyRef.current?.(); }, 300);
    return () => clearTimeout(t);
  }, [settingsKey]);

  // ---- refs for handleFlip 闭包，避免因 state 变化重建 callback ----
  const paginationRef = useRef(pagination);
  const settingsFingerprintRef = useRef(settingsFingerprint);
  const chaptersMetaLenRef = useRef(chaptersMeta.length);
  const pageToCharOffsetRef = useRef(pageToCharOffset);
  useEffect(() => { paginationRef.current = pagination; }, [pagination]);
  useEffect(() => { settingsFingerprintRef.current = settingsFingerprint; }, [settingsFingerprint]);
  useEffect(() => { chaptersMetaLenRef.current = chaptersMeta.length; }, [chaptersMeta.length]);
  useEffect(() => { pageToCharOffsetRef.current = pageToCharOffset; }, [pageToCharOffset]);

  // ---- 翻页（所有副作用延迟到 rAF，不在翻页动画帧中阻塞） ----
  const handleFlip = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      const page = e.data as number;
      currentPageRef.current = page;

      // 所有副作用延迟到下一帧，不在翻页动画帧中触发重渲染或计算
      if (flipRafRef.current) cancelAnimationFrame(flipRafRef.current);
      flipRafRef.current = requestAnimationFrame(() => {
        // 批量更新 page + initialPage，只触发一次 notify
        pageStore.setBoth(page);

        // 通知上层进度（上层自行防抖 2s，不阻塞翻页）
        const totalPages = paginationRef.current.totalPages;
        if (totalPages > 0 && onProgressUpdateRef.current) {
          const pct = Math.round((page / Math.max(1, totalPages - 1)) * 100);
          const charOffset = pageToCharOffsetRef.current(page);
          const fp = settingsFingerprintRef.current;
          onProgressUpdateRef.current(pct, `char:${charOffset}|page:${page}|fp:${fp}`, { pageNumber: page, settingsFingerprint: fp });
        }
      });

      // 章节预取（轻量操作，同步执行）
      const chapterPageRanges = paginationRef.current.chapterPageRanges;
      const info = getChapterForPage(page, chapterPageRanges);
      if (info) {
        updateCurrentChapter(info.chapterIndex);
        if (!isChapterLoaded(info.chapterIndex)) {
          ensureChaptersLoaded(Math.max(0, info.chapterIndex - 2), Math.min(chaptersMetaLenRef.current - 1, info.chapterIndex + 2));
        }
      }
    },
    [pageStore, updateCurrentChapter, isChapterLoaded, ensureChaptersLoaded],
  );

  // ---- 键盘 ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const pf = flipBookRef.current?.pageFlip();
      if (!pf) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') pf.flipNext();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') pf.flipPrev();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ---- 就绪 ----
  const contentParsed = !isLoading && !error;
  const ready = contentParsed && pagination.isReady && pagination.totalPages > 0 && containerSize.w > 0;
  const emptyContent = contentParsed && pagination.isReady && pagination.totalPages === 0 && chaptersMeta.length === 0;

  // ---- 页面数据 ----
  const chapterPageCounts = useMemo(() => {
    const c: Record<number, number> = {};
    for (const r of pagination.chapterPageRanges) c[r.chapterIndex] = r.pageCount;
    return c;
  }, [pagination.chapterPageRanges]);

  const allPages = useMemo(() => {
    if (pagination.totalPages === 0 || containerSize.w === 0) return [];
    return Array.from({ length: pagination.totalPages }, (_, i) => {
      const info = getChapterForPage(i, pagination.chapterPageRanges);
      const ci = info?.chapterIndex ?? 0;
      return { globalPageIndex: i, chapterIndex: ci, pageInChapter: info?.pageInChapter ?? 0, chapterPages: chapterPageCounts[ci] ?? 1 };
    });
  }, [pagination.totalPages, pagination.chapterPageRanges, chapterPageCounts, containerSize.w]);

  const stableChildren = useMemo(() => allPages.map(p => (
    <BookPage key={p.globalPageIndex} pageIndex={p.globalPageIndex}
      chapterHtml={chapters[p.chapterIndex]?.html || ''} pageInChapter={p.pageInChapter}
      chapterPages={p.chapterPages} pageWidth={contentWidth} pageHeight={contentHeight}
      pageNumber={p.globalPageIndex + 1} totalPages={pagination.totalPages}
      fontSize={fontSize} lineHeight={lineHeightVal} fontFamily={fontFamily} theme={theme} padding={pagePadding} />
  )), [allPages, chapters, contentWidth, contentHeight, pagination.totalPages, fontSize, lineHeightVal, fontFamily, theme, pagePadding]);

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

      {allPages.length > 0 && containerSize.w > 0 && settingsKey && (
        <div className="book-frame"
          style={{ position: 'relative', opacity: showBook ? 1 : 0, transition: 'opacity 0.3s ease-in' }}>
          {!isMobile && <div className="book-shadow" />}
          {!isMobile && <div className="page-stack-left" />}
          {!isMobile && <div className="page-stack-right" />}

          <PageStoreContext.Provider value={pageStore}>
            <HTMLFlipBook key={settingsKey} ref={flipBookRef} className="book-flipbook"
              width={pageDimensions.pageW} height={pageDimensions.pageH} size="fixed"
              minWidth={200} maxWidth={600} minHeight={300} maxHeight={900}
              showCover={false} mobileScrollSupport={true} useMouseEvents={true}
              usePortrait={isMobile} singlePage={isMobile}
              flippingTime={isMobile ? 300 : 400}
              drawShadow={false} maxShadowOpacity={0}
              showPageCorners={false} disableFlipByClick={isMobile} clickEventForward={!isMobile}
              swipeDistance={15} startPage={currentPage} startZIndex={2} autoSize={false}
              onFlip={handleFlip} style={{}}>
              {stableChildren}
            </HTMLFlipBook>
          </PageStoreContext.Provider>

          {!isMobile && <div className="book-spine" />}

          {isFetchingChapters && showBook && (
            <div style={{
              position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20,
              background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
              backdropFilter: 'blur(8px)', pointerEvents: 'none',
            }}>
              <div style={{
                width: 12, height: 12,
                border: `2px solid ${theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.15)'}`,
                borderTop: `2px solid ${theme === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)'}`,
                borderRadius: '50%', animation: 'spin 0.8s linear infinite',
              }} />
              <span style={{ fontSize: 11, opacity: 0.6, color: theme === 'dark' ? '#fff' : '#333',
                fontFamily: 'Georgia, "Times New Roman", "Songti SC", serif', letterSpacing: '0.5px' }}>
                加载中…
              </span>
            </div>
          )}
        </div>
      )}

      <div className="book-loading" style={{
        position: 'absolute', inset: 0, zIndex: 30,
        background: theme === 'dark' ? 'rgb(26,23,20)' : theme === 'sepia' ? 'rgb(228,216,191)' : 'rgb(250,247,242)',
        opacity: (!error && !emptyContent && (!showBook || !pagination.isReady)) ? 1 : 0,
        pointerEvents: (!error && !emptyContent && (!showBook || !pagination.isReady)) ? 'auto' : 'none',
        transition: 'opacity 0.15s ease',
      }}>
        <div className="book-loading-spinner" />
        <span className="text-xs opacity-50" style={{ fontFamily: 'Georgia, "Times New Roman", "Songti SC", serif', letterSpacing: '1px' }}>
          {isLoading ? '正在加载章节…' : '排版中…'}
        </span>
      </div>
    </div>
  );
}

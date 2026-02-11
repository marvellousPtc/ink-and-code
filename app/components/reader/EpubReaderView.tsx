/*
 * :file description: 
 * :name: /ink-and-code/app/components/reader/EpubReaderView.tsx
 * :author: PTC
 * :copyright: (c) 2026, Tungee
 * :date created: 2026-02-07 11:33:11
 * :last editor: PTC
 * :date last edited: 2026-02-10 16:53:28
 */
'use client';

import {
  createContext,
  useEffect,
  useLayoutEffect,
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
// 库的 updateFromHtml 支持原地替换，窗口滑动零闪烁，因此窗口无需过大。
// 60 页 ≈ 用户翻 30 次才可能触发一次窗口滑动，体验足够流畅。
const PAGE_WINDOW_SIZE_DESKTOP = 60;
const PAGE_WINDOW_SIZE_MOBILE = 40;
const SHIFT_THRESHOLD = 10;

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
  /** 书页完全渲染到正确位置后触发，父组件可据此隐藏全局 loading */
  onReady?: () => void;
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
  onReady,
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
    isFetchingChapters,
    error,
    updateCurrentChapter,
    isChapterLoaded,
    ensureChaptersLoaded,
  } = useServerChapters(bookId, initialCharOffset);

  // ---- 响应式 ----
  const isMobile = containerSize.w > 0 && containerSize.w < 768;

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

  // ---- 窗口大小 ----
  // 固定窗口：库的 updateFromHtml 已支持原地替换，窗口滑动无闪烁，
  // 不再需要"小书全量覆盖"的策略，统一用固定小窗口减少 DOM 数量。
  const pageWindowSize = useMemo(() => {
    const winSize = isMobile ? PAGE_WINDOW_SIZE_MOBILE : PAGE_WINDOW_SIZE_DESKTOP;
    // 总页数比窗口还小时，直接用总页数
    if (pagination.totalPages > 0 && pagination.totalPages <= winSize) {
      return pagination.totalPages;
    }
    return winSize;
  }, [isMobile, pagination.totalPages]);

  // ---- 章节字符偏移表 ----
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
    if (info) {
      // 精确计算（chapterPageRanges 已就绪）
      const chIdx = info.chapterIndex;
      const chPages = pagination.chapterPageRanges[chIdx]?.pageCount ?? 1;
      const ratio = info.pageInChapter / Math.max(1, chPages);
      return Math.round(chapterCumOffsets[chIdx] + ratio * chapterTextLengths[chIdx]);
    }
    // 兜底：chapterPageRanges 尚未就绪时，按比例估算
    const ratio = page / Math.max(1, pagination.totalPages - 1);
    return Math.round(ratio * totalTextLength);
  }, [totalTextLength, pagination.totalPages, pagination.chapterPageRanges, chapterCumOffsets, chapterTextLengths]);

  const charOffsetToPage = useCallback((offset: number): number => {
    if (totalTextLength === 0 || pagination.totalPages === 0 || offset <= 0) return 0;

    // 尝试精确计算
    if (pagination.chapterPageRanges.length > 0) {
      let chIdx = 0;
      for (let i = 1; i < chapterCumOffsets.length; i++) {
        if (offset < chapterCumOffsets[i]) { chIdx = i - 1; break; }
        chIdx = i - 1;
      }
      const localOffset = offset - chapterCumOffsets[chIdx];
      const chTextLen = chapterTextLengths[chIdx] || 1;
      const ratio = Math.min(localOffset / chTextLen, 1);
      const range = pagination.chapterPageRanges[chIdx];
      if (range) {
        const pageInChapter = Math.min(Math.round(ratio * range.pageCount), range.pageCount - 1);
        return Math.min(range.startPage + pageInChapter, pagination.totalPages - 1);
      }
    }

    // 兜底：chapterPageRanges 尚未就绪时，按比例估算
    const ratio = Math.min(offset / totalTextLength, 1);
    return Math.min(Math.round(ratio * (pagination.totalPages - 1)), pagination.totalPages - 1);
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
  // lazyWindow 决定距当前页多远的页面渲染真实 HTML。
  // 过大（如 pageWindowSize/2=30）会导致窗口内全部 60 页都做 CSS 列布局，DOM 爆炸。
  // 设为 5：只有当前页 ±5（共 ~11 页）渲染内容，其余显示轻量占位符。
  const LAZY_WINDOW = isMobile ? 3 : 5;
  useEffect(() => {
    pageStore.setLazyWindow(LAZY_WINDOW);
  }, [LAZY_WINDOW, pageStore]);

  // ==================================================================
  //  核心状态（简化后）
  //  - settingsKey:      仅在设置变更 / 首次初始化时改变 → 触发 FlipBook 硬重建
  //  - windowStart:      滑动窗口起始全局页码
  //  - currentLocalPage: 当前用户在窗口内的本地页码，同步给 FlipBook 的 startPage
  //                      窗口滑动时：children 变化 → 库内部 updateFromHtml(items, startPage) 原地替换
  //                      不需要改 key，不需要 DOM 快照，零闪烁
  // ==================================================================
  const [showBook, setShowBook] = useState(false);
  const [settingsKey, setSettingsKey] = useState('');
  const [windowStart, setWindowStart] = useState(0);
  const [currentLocalPage, setCurrentLocalPage] = useState(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flipBookRef = useRef<any>(null);
  const initializedRef = useRef(false);
  const prevTotalRef = useRef(0);
  const flipTargetRef = useRef(0);
  const currentPageRef = useRef(0);
  const currentLocalPageRef = useRef(0); // 翻页时同步更新（不触发重渲染），供 useLayoutEffect 同步到 state
  const windowStartRef = useRef(0); // 避免 handleFlip 的 useCallback 依赖 windowStart state
  const lazyUpdateTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // 待执行的窗口滑动（等翻页动画结束后再执行，避免打断动画造成卡顿）
  const pendingWindowShift = useRef<(() => void) | null>(null);

  const onProgressUpdateRef = useRef(onProgressUpdate);
  useEffect(() => { onProgressUpdateRef.current = onProgressUpdate; }, [onProgressUpdate]);
  const onReadyRef = useRef(onReady);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  const prevSettingsFpRef = useRef('');
  const prevInitialLocationRef = useRef<string | undefined>(undefined);

  // ---- 主初始化 & 变更响应 ----
  useEffect(() => {
    if (!pagination.isReady) return;
    if (!initializedRef.current && isLoading) return;
    // 有进度时必须等 chapterPageRanges 就绪再初始化，否则 charOffsetToPage 用比例兜底会定位不准
    if (!initializedRef.current && savedCharOffset > 0 && pagination.chapterPageRanges.length === 0) return;

    const isSettingsChange = prevSettingsFpRef.current !== '' && prevSettingsFpRef.current !== settingsFingerprint;
    const isProgressRestore = initializedRef.current &&
      initialLocation !== prevInitialLocationRef.current &&
      startPage > 0;
    // 首次初始化时 startPage 可能为 0（chapterPageRanges 尚未就绪），等分页完成后 startPage 会变成正确值，
    // 此时需跳到该页，否则会一直停在第一页。
    const isLateProgressApply =
      initializedRef.current &&
      startPage > 0 &&
      currentPageRef.current === 0 &&
      savedCharOffset > 0;

    prevSettingsFpRef.current = settingsFingerprint;

    if (!initializedRef.current) {
      // ---- 首次初始化 ----
      initializedRef.current = true;
      prevInitialLocationRef.current = initialLocation;
      prevTotalRef.current = pagination.totalPages;
      currentPageRef.current = startPage;
      flipTargetRef.current = startPage;

      const win = calcPageWindow(startPage, pagination.totalPages, pageWindowSize);
      // 首次渲染需同步设置窗口与页码，否则 FlipBook 会以错误 startPage 挂载
      windowStartRef.current = win.start;
      currentLocalPageRef.current = startPage - win.start;
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- 首次渲染需同步设置窗口位置 */
      setWindowStart(win.start);
      setCurrentLocalPage(startPage - win.start);
      pageStore.setInitialPage(startPage);
      pageStore.setPage(startPage);
      setSettingsKey(`init_${pagination.totalPages}_${pageDimensions.pageW}_${pageDimensions.pageH}`);
    } else if (isSettingsChange) {
      // ---- 设置变更 → 硬重建（改 key，显示 loading） ----
      if (prevTotalRef.current > 0 && pagination.totalPages !== prevTotalRef.current) {
        const ratio = currentPageRef.current / Math.max(1, prevTotalRef.current - 1);
        currentPageRef.current = Math.min(Math.round(ratio * (pagination.totalPages - 1)), pagination.totalPages - 1);
      }
      prevTotalRef.current = pagination.totalPages;

      const globalPage = currentPageRef.current;
      const win = calcPageWindow(globalPage, pagination.totalPages, pageWindowSize);
      windowStartRef.current = win.start;
      currentLocalPageRef.current = globalPage - win.start;
      setWindowStart(win.start);
      setCurrentLocalPage(globalPage - win.start);
      pageStore.setInitialPage(globalPage);
      pageStore.setPage(globalPage);
      setSettingsKey(`settings_${settingsFingerprint}`);
      setShowBook(false);

      if (pagination.totalPages > 0) {
        const pct = Math.round((globalPage / Math.max(1, pagination.totalPages - 1)) * 100);
        const charOffset = pageToCharOffset(globalPage);
        onProgressUpdateRef.current?.(pct, `char:${charOffset}`, { pageNumber: globalPage, settingsFingerprint });
      }
    } else if (isProgressRestore || isLateProgressApply) {
      // ---- 进度恢复：SWR 新进度 或 分页就绪后补跳（之前 startPage 曾为 0） ----
      if (isProgressRestore) prevInitialLocationRef.current = initialLocation;
      prevTotalRef.current = pagination.totalPages;
      currentPageRef.current = startPage;
      flipTargetRef.current = startPage;

      const win = calcPageWindow(startPage, pagination.totalPages, pageWindowSize);
      windowStartRef.current = win.start;
      currentLocalPageRef.current = startPage - win.start;
      pageStore.setInitialPage(startPage);
      pageStore.setPage(startPage);
      queueMicrotask(() => {
        setWindowStart(win.start);
        setCurrentLocalPage(startPage - win.start);
      });
    } else if (pagination.totalPages !== prevTotalRef.current) {
      // ---- 新章节加载导致页数微调 → 静默更新 ----
      prevTotalRef.current = pagination.totalPages;
    }
  }, [pagination.isReady, isLoading, pagination.totalPages, pagination.chapterPageRanges.length, startPage, savedCharOffset, initialLocation, pageDimensions.pageW, pageDimensions.pageH, fontSize, lineHeightVal, fontFamily, pageStore, settingsFingerprint, pageToCharOffset, pageWindowSize]);

  // ---- FlipBook 挂载后淡入 ----
  useEffect(() => {
    if (!settingsKey) return;
    const timer = setTimeout(() => {
      setShowBook(true);
      onReadyRef.current?.();
    }, 300);
    return () => clearTimeout(timer);
  }, [settingsKey]);

  // ---- 通过 ref 读取最新值，避免 handleFlip callback 依赖 state 频繁重建 ----
  const paginationRef = useRef(pagination);
  const pageToCharOffsetRef = useRef(pageToCharOffset);
  const settingsFpRef = useRef(settingsFingerprint);
  const chaptersMetaLenRef = useRef(chaptersMeta.length);
  useEffect(() => {
    paginationRef.current = pagination;
    pageToCharOffsetRef.current = pageToCharOffset;
    settingsFpRef.current = settingsFingerprint;
    chaptersMetaLenRef.current = chaptersMeta.length;
  });

  const handleFlip = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      const localPage = e.data as number;
      const ws = windowStartRef.current;
      const globalPage = localPage + ws;
      flipTargetRef.current = globalPage;
      currentPageRef.current = globalPage;
      currentLocalPageRef.current = localPage;

      // 只更新 pageStore（通知 BookPage 子组件 isNear 变化），不 setState 父组件
      pageStore.setPage(globalPage);

      // ---- 防抖保存阅读进度 ----
      if (lazyUpdateTimer.current) clearTimeout(lazyUpdateTimer.current);
      lazyUpdateTimer.current = setTimeout(() => {
        const pg = paginationRef.current;
        if (pg.totalPages > 0) {
          const gp = currentPageRef.current;
          const pct = Math.round((gp / Math.max(1, pg.totalPages - 1)) * 100);
          const charOffset = pageToCharOffsetRef.current(gp);
          onProgressUpdateRef.current?.(pct, `char:${charOffset}`, { pageNumber: gp, settingsFingerprint: settingsFpRef.current });
        }
      }, 800);

      // 章节预取 + 窗口滑动检测（放到 microtask，不阻塞翻页动画帧）
      queueMicrotask(() => {
        const pg = paginationRef.current;
        const info = getChapterForPage(globalPage, pg.chapterPageRanges);
        if (info) {
          updateCurrentChapter(info.chapterIndex);
          if (!isChapterLoaded(info.chapterIndex)) {
            const from = Math.max(0, info.chapterIndex - 2);
            const to = Math.min(chaptersMetaLenRef.current - 1, info.chapterIndex + 2);
            ensureChaptersLoaded(from, to);
          }
        }

        // ---- 窗口滑动检测 ----
        const winEnd = ws + pageWindowSize;
        const nearStart = localPage < SHIFT_THRESHOLD && ws > 0;
        const nearEnd = localPage > (winEnd - ws) - SHIFT_THRESHOLD && winEnd < pg.totalPages;

        if (nearStart || nearEnd) {
          pendingWindowShift.current = () => {
            const gp = currentPageRef.current;
            const pg2 = paginationRef.current;
            const newWin = calcPageWindow(gp, pg2.totalPages, pageWindowSize);
            windowStartRef.current = newWin.start;
            currentLocalPageRef.current = gp - newWin.start;
            setWindowStart(newWin.start);
            setCurrentLocalPage(gp - newWin.start);
            pageStore.setInitialPage(gp);
          };
        }
      });
    },
    // 只依赖稳定的 ref / 函数，翻页时不会因为 windowStart 等 state 变化而重建
    [pageStore, updateCurrentChapter, isChapterLoaded, ensureChaptersLoaded, pageWindowSize],
  );


  const handleChangeState = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      if (e.data === 'read') {
        // ---- 执行待定的窗口滑动（下一帧执行，避免与翻页动画结束同帧 setState 造成卡顿） ----
        if (pendingWindowShift.current) {
          const shift = pendingWindowShift.current;
          pendingWindowShift.current = null;
          requestAnimationFrame(() => shift());
        }
      }
    },
    [],
  );

  // ---- 清理 ----
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

  // ---- 稳定的 children 数组 ----
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

  // 当 stableChildren 变化（章节加载 / 窗口滑动）时，同步 ref 到 state，
  // 确保 FlipBook 收到 updateFromHtml(items, startPage) 时 startPage 正确。
  // useLayoutEffect 在浏览器 paint 之前执行，避免一帧闪到旧位置。
  useLayoutEffect(() => {
    setCurrentLocalPage(currentLocalPageRef.current);
  }, [stableChildren]);

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

      {windowedPages.length > 0 && containerSize.w > 0 && settingsKey && (
        <div
          className="book-frame"
          style={{ position: 'relative', opacity: showBook ? 1 : 0, transition: 'opacity 0.3s ease-in' }}
        >
          {!isMobile && <div className="book-shadow" />}
          {!isMobile && <div className="page-stack-left" />}
          {!isMobile && <div className="page-stack-right" />}

          <PageStoreContext.Provider value={pageStore}>
            <HTMLFlipBook
              key={settingsKey}
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
              startPage={currentLocalPage}
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

          {/* 章节加载指示器：书保持可见，只在书中央显示一个小 loading */}
          {isFetchingChapters && showBook && (
            <div
              style={{
                position: 'absolute',
                bottom: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 20,
                background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                backdropFilter: 'blur(8px)',
                pointerEvents: 'none',
                transition: 'opacity 0.2s ease',
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  border: `2px solid ${theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.15)'}`,
                  borderTop: `2px solid ${theme === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)'}`,
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  opacity: 0.6,
                  color: theme === 'dark' ? '#fff' : '#333',
                  fontFamily: 'Georgia, "Times New Roman", "Songti SC", serif',
                  letterSpacing: '0.5px',
                }}
              >
                加载中…
              </span>
            </div>
          )}
        </div>
      )}

      {/* 统一遮罩 */}
      <div
        className="book-loading"
        style={{
          position: 'absolute', inset: 0, zIndex: 30,
          background: theme === 'dark' ? 'rgb(26,23,20)' : theme === 'sepia' ? 'rgb(228,216,191)' : 'rgb(250,247,242)',
          opacity: (!error && !emptyContent && (!showBook || !pagination.isReady)) ? 1 : 0,
          pointerEvents: (!error && !emptyContent && (!showBook || !pagination.isReady)) ? 'auto' : 'none',
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

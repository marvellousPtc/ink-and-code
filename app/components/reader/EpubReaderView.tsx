/*
 * :file description: 
 * :name: /ink-and-code/app/components/reader/EpubReaderView.tsx
 * :author: PTC
 * :copyright: (c) 2026, Tungee
 * :date created: 2026-02-07 11:33:11
 * :last editor: PTC
 * :date last edited: 2026-02-13 09:58:42
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
import {
  deserializeAnchor,
  serializeAnchor,
  pageToAnchor as computeAnchorForPage,
  anchorToPage as computePageForAnchor,
} from '@/lib/reading-anchor';
import type { ReadingAnchor } from '@/lib/reading-anchor';
import {
  selectionToHighlightAnchor,
  serializeHighlightLoc,
  deserializeHighlightLoc,
  type HighlightData,
} from '@/lib/highlight-anchor';
import type { HighlightItem } from '@/lib/hooks/use-library';
import BookPage from './BookPage';
import HighlightToolbar from './HighlightToolbar';
import NotePopover from './NotePopover';
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

// ---- 高亮数据外部存储（BookPage 子组件订阅，避免 props 变化触发库重建页面集合） ----
export interface HighlightStoreType {
  subscribe: (cb: () => void) => () => void;
  getHighlights: (chapterIndex: number) => HighlightData[] | undefined;
  setHighlightsByChapter: (map: Record<number, HighlightData[]>) => void;
}

export const HighlightStoreContext = createContext<HighlightStoreType | null>(null);

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

function createHighlightStore(): HighlightStoreType {
  let data: Record<number, HighlightData[]> = {};
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(l => l());
  return {
    subscribe: (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    getHighlights: (chapterIndex: number) => data[chapterIndex],
    setHighlightsByChapter: (map: Record<number, HighlightData[]>) => { data = map; notify(); },
  };
}

interface EpubReaderViewProps {
  url: string;
  bookId: string;
  initialLocation?: string;
  settings?: ReadingSettingsData | null;
  highlights?: HighlightItem[];
  onProgressUpdate?: (percentage: number, location?: string, extra?: { pageNumber?: number; settingsFingerprint?: string }) => void;
  onAddBookmark?: (location: string, title?: string) => void;
  onAddHighlight?: (text: string, location: string, color?: string, note?: string) => void;
  onUpdateHighlight?: (id: string, data: { color?: string; note?: string }) => void;
  onDeleteHighlight?: (id: string) => void;
  onReady?: () => void;
  /** 注册导航函数，供外部（如侧边栏高亮列表）调用跳转到指定位置 */
  onRegisterNavigate?: (fn: (location: string) => void) => void;
}

export default function EpubReaderView({
  bookId, initialLocation, settings, highlights: rawHighlights, onProgressUpdate, onAddHighlight, onUpdateHighlight, onDeleteHighlight, onReady, onRegisterNavigate,
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

  const parsedLocation = useMemo(() => deserializeAnchor(initialLocation), [initialLocation]);
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

  // ---- 排版设置 ----
  const theme = settings?.theme || 'light';
  const themeClass = theme === 'dark' ? 'book-theme-dark' : theme === 'sepia' ? 'book-theme-sepia' : '';
  const fontSize = settings?.fontSize ?? 16;
  const lineHeightVal = settings?.lineHeight ?? 1.8;
  const fontFamily = settings?.fontFamily ?? 'system';
  const settingsFingerprint = `${fontSize}_${lineHeightVal}_${fontFamily}_${pageDimensions.pageW}_${pageDimensions.pageH}`;

  // ---- 进度恢复 ----
  // 新格式（锚点）：anchor:3:12:45|snippet:这是一段文字|char:25000
  // 旧格式（字符偏移）：char:25000|page:50|fp:16_1.8_system_376_527
  // 锚点与设备/字体/排版无关，任何设置下都能精确定位
  const startPage = useMemo(() => {
    if (!pagination.isReady || pagination.totalPages === 0) return 0;
    // 优先使用锚点定位（设备无关，字体/排版变化也精确）
    if (parsedLocation.anchor && pagination.blockMaps.length > 0) {
      return computePageForAnchor(parsedLocation.anchor, pagination.chapterPageRanges, pagination.blockMaps);
    }
    // 旧格式 fallback 1：页码 + settingsFingerprint
    if (parsedLocation.pageNumber >= 0 && parsedLocation.settingsFingerprint === settingsFingerprint && parsedLocation.pageNumber < pagination.totalPages) {
      return parsedLocation.pageNumber;
    }
    // 旧格式 fallback 2：字符偏移
    if (parsedLocation.charOffset <= 0) return 0;
    return charOffsetToPage(parsedLocation.charOffset);
  }, [pagination.isReady, pagination.totalPages, pagination.blockMaps, pagination.chapterPageRanges, parsedLocation, settingsFingerprint, charOffsetToPage]);

  // ---- 外部页面存储 ----
  const [pageStore] = useState(createPageStore);
  const LAZY_WINDOW = isMobile ? 3 : 4;
  useEffect(() => { pageStore.setLazyWindow(LAZY_WINDOW); }, [LAZY_WINDOW, pageStore]);

  // ---- 外部高亮存储（BookPage 通过 useSyncExternalStore 订阅，不通过 props） ----
  const [highlightStore] = useState(createHighlightStore);

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
  // 当前阅读位置的锚点（设备/排版无关，用于字体变更后精确重定位）
  const currentAnchorRef = useRef<ReadingAnchor | null>(null);
  // 用户是否已主动翻页（一旦翻页则不再自动修正位置，避免打断阅读）
  const userHasFlippedRef = useRef(false);
  // flipbook 组件是否已就绪（初始化/重挂载后需要等 300ms 淡入才算就绪）
  // 在就绪前忽略 onFlip 的副作用（锚点更新、进度保存），
  // 因为 flipbook 初始化时可能发射伪翻页事件（page=0 等）。
  const flipReadyRef = useRef(false);

  const onProgressUpdateRef = useRef(onProgressUpdate);
  useEffect(() => { onProgressUpdateRef.current = onProgressUpdate; }, [onProgressUpdate]);
  const onReadyRef = useRef(onReady);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  const prevSettingsFpRef = useRef('');
  const prevInitialLocationRef = useRef<string | undefined>(undefined);
  // 设置变更后等待分页重新测量再导航（防止用旧 blockMaps 解析锚点到错误页码）
  const pendingSettingsNavRef = useRef(false);

  // ---- 初始化 & 变更 ----
  useEffect(() => {
    if (!pagination.isReady) return;
    if (!initializedRef.current && isLoading) return;
    // 需要 blockMaps 来从锚点/charOffset 定位页码；有旧格式精确页码时可跳过等待
    const hasRestoreData = parsedLocation.anchor || parsedLocation.charOffset > 0;
    const canSkipWait = parsedLocation.pageNumber >= 0 && parsedLocation.settingsFingerprint === settingsFingerprint;
    if (!initializedRef.current && hasRestoreData && !canSkipWait && pagination.chapterPageRanges.length === 0) return;

    const isSettingsChange = prevSettingsFpRef.current !== '' && prevSettingsFpRef.current !== settingsFingerprint;
    const isProgressRestore = initializedRef.current && initialLocation !== prevInitialLocationRef.current && startPage > 0;
    const isLateProgressApply = initializedRef.current && startPage > 0 && currentPageRef.current === 0;

    // 检测到设置变更 → 标记等待分页重新测量，先不导航
    // 原因：此时 pagination.blockMaps 仍是旧设置的数据
    // （useBookPagination 的 setResult(isReady:false) 还在 React 队列中），
    // 用旧 blockMaps 解析锚点会得到错误页码。
    if (isSettingsChange) {
      prevSettingsFpRef.current = settingsFingerprint;
      pendingSettingsNavRef.current = true;
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setShowBook(false);
      return;
    }

    if (!initializedRef.current) {
      prevSettingsFpRef.current = settingsFingerprint;
      initializedRef.current = true;
      prevInitialLocationRef.current = initialLocation;
      prevTotalRef.current = pagination.totalPages;
      currentPageRef.current = startPage;
      // 初始化锚点
      currentAnchorRef.current = parsedLocation.anchor
        || computeAnchorForPage(startPage, pagination.chapterPageRanges, pagination.blockMaps);
      console.log('[Reader] Init → page:', startPage, 'anchor:', parsedLocation.anchor, 'totalPages:', pagination.totalPages, 'blockMapsCount:', pagination.blockMaps.length);
      flipReadyRef.current = false; // flipbook 即将(重)挂载，标记为未就绪
      setCurrentPage(startPage);
      pageStore.setBoth(startPage);
      setSettingsKey(`init_${pagination.totalPages}_${pageDimensions.pageW}_${pageDimensions.pageH}`);
    } else if (pendingSettingsNavRef.current) {
      // 分页已用新设置重新测量完成 → 现在可以安全导航
      pendingSettingsNavRef.current = false;
      prevTotalRef.current = pagination.totalPages;

      // 字体/排版变更 → 用锚点在新分页中精确定位（锚点与排版无关）
      const anchor = currentAnchorRef.current;
      if (anchor && pagination.blockMaps.length > 0) {
        currentPageRef.current = computePageForAnchor(anchor, pagination.chapterPageRanges, pagination.blockMaps);
      } else if (prevTotalRef.current > 0 && pagination.totalPages !== prevTotalRef.current) {
        // 无锚点时的降级：按比例估算
        const ratio = currentPageRef.current / Math.max(1, prevTotalRef.current - 1);
        currentPageRef.current = Math.min(Math.round(ratio * (pagination.totalPages - 1)), pagination.totalPages - 1);
      }
      const gp = currentPageRef.current;
      // 不从页码反算锚点 — 锚点是基于内容位置的，与排版设置无关。
      // anchor → page → anchor 转换有损（pageToAnchor 返回页首第一个块），
      // 且渐进加载期间 blockMaps 不完整时会导致锚点漂移到错误章节。
      // 只有用户真正翻页时才更新 currentAnchorRef。
      flipReadyRef.current = false; // flipbook 即将重挂载
      setCurrentPage(gp);
      pageStore.setBoth(gp);
      setSettingsKey(`settings_${settingsFingerprint}`);
      if (pagination.totalPages > 0 && currentAnchorRef.current) {
        const pct = Math.round((gp / Math.max(1, pagination.totalPages - 1)) * 100);
        const charOff = pageToCharOffset(gp);
        const loc = serializeAnchor(currentAnchorRef.current, charOff);
        onProgressUpdateRef.current?.(pct, loc, { pageNumber: gp, settingsFingerprint });
      }
    } else if (isProgressRestore || isLateProgressApply) {
      prevSettingsFpRef.current = settingsFingerprint;
      if (isProgressRestore) prevInitialLocationRef.current = initialLocation;
      prevTotalRef.current = pagination.totalPages;
      currentPageRef.current = startPage;
      currentAnchorRef.current = parsedLocation.anchor
        || computeAnchorForPage(startPage, pagination.chapterPageRanges, pagination.blockMaps);
      setCurrentPage(startPage);
      pageStore.setBoth(startPage);
    } else if (pagination.totalPages !== prevTotalRef.current || startPage !== currentPageRef.current) {
      // 渐进加载：章节继续加载 → 分页重新计算 → chapterPageRanges/totalPages 变化
      prevSettingsFpRef.current = settingsFingerprint;
      prevTotalRef.current = pagination.totalPages;

      // 如果用户还没翻页（还在初始打开阶段），自动修正到更新后的正确页码。
      // 用 turnToPage 直接翻页（不 remount flipbook，避免 onFlip 竞态条件）。
      if (!userHasFlippedRef.current && startPage > 0 && startPage !== currentPageRef.current) {
        console.log('[Reader] AutoCorrect → old:', currentPageRef.current, '→ new:', startPage,
          'totalPages:', pagination.totalPages, 'blockMaps:', pagination.blockMaps.length);
        currentPageRef.current = startPage;
        currentAnchorRef.current = parsedLocation.anchor
          || computeAnchorForPage(startPage, pagination.chapterPageRanges, pagination.blockMaps);
        setCurrentPage(startPage);
        pageStore.setBoth(startPage);
        // 直接命令 flipbook 翻到正确页码（不 remount，不触发 onFlip 竞态）
        const pf = flipBookRef.current?.pageFlip();
        if (pf) {
          try { pf.turnToPage(startPage); } catch { /* ignore if flipbook not ready */ }
        }
      }
    } else {
      prevSettingsFpRef.current = settingsFingerprint;
    }
  }, [pagination.isReady, isLoading, pagination.totalPages, pagination.blockMaps, pagination.chapterPageRanges, startPage, parsedLocation, initialLocation, pageDimensions.pageW, pageDimensions.pageH, fontSize, lineHeightVal, fontFamily, pageStore, settingsFingerprint, pageToCharOffset]);

  // ---- 淡入 ----
  useEffect(() => {
    if (!settingsKey) return;
    const t = setTimeout(() => {
      setShowBook(true);
      flipReadyRef.current = true; // flipbook 淡入完成，可以处理翻页事件了
      onReadyRef.current?.();
    }, 300);
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
      const prevPage = currentPageRef.current;

      // flipbook 未就绪时（初始化/重挂载阶段），不更新 currentPageRef——
      // 此时的 onFlip 可能是 flipbook 内部初始化触发的伪事件（如 page=0），
      // 会污染 currentPageRef 导致后续自动修正失效。
      if (flipReadyRef.current) {
        currentPageRef.current = page;
      }

      // 所有副作用延迟到下一帧，不在翻页动画帧中触发重渲染或计算
      if (flipRafRef.current) cancelAnimationFrame(flipRafRef.current);
      flipRafRef.current = requestAnimationFrame(() => {
        if (flipReadyRef.current) {
          pageStore.setBoth(page);
        }

        // 页码未变（如组件 remount 时的初始回调），跳过锚点更新和进度保存，
        // 避免用不完整的 blockMaps 反算出错误锚点覆盖已保存的精确位置。
        if (page === prevPage) return;

        // flipbook 未就绪 → 跳过所有副作用
        if (!flipReadyRef.current) return;

        // 标记用户已主动翻页 → 停止渐进加载自动修正位置
        userHasFlippedRef.current = true;

        // 计算并缓存当前页的锚点（用于字体变更后重定位）
        const p = paginationRef.current;
        const anchor = computeAnchorForPage(page, p.chapterPageRanges, p.blockMaps);
        currentAnchorRef.current = anchor;

        // 通知上层进度（上层自行防抖 2s，不阻塞翻页）
        const totalPages = p.totalPages;
        if (totalPages > 0 && onProgressUpdateRef.current) {
          const pct = Math.round((page / Math.max(1, totalPages - 1)) * 100);
          if (anchor) {
            const charOffset = pageToCharOffsetRef.current(page);
            const loc = serializeAnchor(anchor, charOffset);
            onProgressUpdateRef.current(pct, loc, { pageNumber: page, settingsFingerprint: settingsFingerprintRef.current });
          } else {
            // blockMap 尚未就绪时降级为旧格式
            const charOffset = pageToCharOffsetRef.current(page);
            const fp = settingsFingerprintRef.current;
            onProgressUpdateRef.current(pct, `char:${charOffset}|page:${page}|fp:${fp}`, { pageNumber: page, settingsFingerprint: fp });
          }
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

  // ---- 高亮数据：按章节分组 + 转换为 HighlightData ----
  const highlightsByChapter = useMemo(() => {
    const map: Record<number, HighlightData[]> = {};
    if (!rawHighlights || rawHighlights.length === 0) return map;
    for (const hl of rawHighlights) {
      const anchor = deserializeHighlightLoc(hl.location);
      if (!anchor) continue;
      const data: HighlightData = {
        id: hl.id,
        chapterIndex: anchor.chapterIndex,
        startBlockIndex: anchor.startBlockIndex,
        startCharOffset: anchor.startCharOffset,
        endBlockIndex: anchor.endBlockIndex,
        endCharOffset: anchor.endCharOffset,
        text: hl.text,
        color: hl.color,
        note: hl.note,
      };
      if (!map[data.chapterIndex]) map[data.chapterIndex] = [];
      map[data.chapterIndex].push(data);
    }
    return map;
  }, [rawHighlights]);

  // 同步高亮数据到外部存储 → BookPage 通过 useSyncExternalStore 自动重渲染
  useEffect(() => { highlightStore.setHighlightsByChapter(highlightsByChapter); }, [highlightsByChapter, highlightStore]);

  // ---- 高亮工具栏状态 ----
  interface ToolbarState {
    visible: boolean;
    x: number;
    y: number;
    flipDown: boolean; // true = 弹窗在文字下方（顶部空间不足时）
    chapterIndex: number;
    text: string;
  }
  const [toolbar, setToolbar] = useState<ToolbarState>({ visible: false, x: 0, y: 0, flipDown: false, chapterIndex: 0, text: '' });
  // 保存选区锚点，以便在工具栏操作时使用
  const pendingHighlightRef = useRef<{ chapterIndex: number; location: string; text: string } | null>(null);

  // ---- 笔记弹窗状态 ----
  interface PopoverState {
    visible: boolean;
    readOnly: boolean;
    x: number;
    y: number;
    flipDown: boolean; // true = 弹窗在文字下方（顶部空间不足时）
    highlightId: string;
    text: string;
    color: string;
    note: string | null;
  }
  const [popover, setPopover] = useState<PopoverState>({ visible: false, readOnly: false, x: 0, y: 0, flipDown: false, highlightId: '', text: '', color: 'yellow', note: null });

  // ---- 划线模式（禁用翻页手势，启用文字选择） ----
  const [selectionMode, setSelectionMode] = useState(false);
  const bookFrameRef = useRef<HTMLDivElement>(null);

  const toggleSelectionMode = useCallback(() => {
    setToolbar(prev => prev.visible ? { ...prev, visible: false } : prev);
    setPopover(prev => prev.visible ? { ...prev, visible: false } : prev);
    window.getSelection()?.removeAllRanges();
    setSelectionMode(prev => !prev);
  }, []);

  // 事件拦截层：capture 阶段拦截 mousedown/touchstart。
  // 1. 始终拦截点击 <mark> 高亮文字（阻止翻页，让 mouseup 显示弹窗）
  // 2. 划线模式下拦截所有事件（阻止翻页，启用文字选择）
  // 仅 stopPropagation()，不 preventDefault() — 浏览器原生行为不受影响。
  // 用 ref 追踪 selectionMode，避免闭包捕获旧值，同时减少 effect 重建次数。
  const selectionModeForInterceptRef = useRef(selectionMode);
  useEffect(() => { selectionModeForInterceptRef.current = selectionMode; }, [selectionMode]);

  useEffect(() => {
    const frame = bookFrameRef.current;
    if (!frame) return;

    const intercept = (e: Event) => {
      const t = e.target as HTMLElement;
      // 不拦截 UI 控件
      if (t.closest('.hl-toolbar') || t.closest('.hl-popover') || t.closest('.hl-note-viewer') || t.closest('.hl-mode-toggle')) return;
      // 始终拦截点击高亮文字
      if (t.closest('mark.hl-mark')) { e.stopPropagation(); return; }
      // 划线模式：拦截全部
      if (selectionModeForInterceptRef.current) { e.stopPropagation(); }
    };

    frame.addEventListener('mousedown', intercept, true);
    frame.addEventListener('touchstart', intercept, true);
    return () => {
      frame.removeEventListener('mousedown', intercept, true);
      frame.removeEventListener('touchstart', intercept, true);
    };
    // settingsKey 变化时书页重新挂载，bookFrameRef 更新，需要重新绑定
  }, [settingsKey]);

  // 只读笔记弹窗 → 切换到编辑模式
  const handleSwitchToEdit = useCallback(() => {
    setPopover(prev => ({ ...prev, readOnly: false }));
    setSelectionMode(true);
  }, []);

  // ---- 文字选择 → 显示工具栏 / 点击高亮 → 显示笔记弹窗 ----
  const selectionModeRef = useRef(selectionMode);
  useEffect(() => { selectionModeRef.current = selectionMode; }, [selectionMode]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    // 忽略 UI 控件内部的事件
    const target = e.target as HTMLElement;
    if (target.closest('.hl-toolbar') || target.closest('.hl-popover') || target.closest('.hl-note-viewer')) return;

    // 检查是否点击了已高亮的文字
    const markEl = target.closest('mark.hl-mark') as HTMLElement | null;
    if (markEl) {
      const hlId = markEl.getAttribute('data-hl-id');
      if (hlId && rawHighlights) {
        const hl = rawHighlights.find(h => h.id === hlId);
        if (hl) {
          const rect = markEl.getBoundingClientRect();
          const frameRect = bookFrameRef.current?.getBoundingClientRect();
          if (frameRect) {
            // 判断弹窗方向：顶部空间不足时翻转到下方
            // 编辑弹窗约 280px 高，只读弹窗约 160px 高
            const isReadOnly = !selectionModeRef.current;
            const spaceAbove = rect.top - frameRect.top;
            const threshold = isReadOnly ? 160 : 280;
            const flipDown = spaceAbove < threshold;
            setToolbar({ visible: false, x: 0, y: 0, flipDown: false, chapterIndex: 0, text: '' });
            setPopover({
              visible: true,
              readOnly: isReadOnly,
              x: rect.left + rect.width / 2 - frameRect.left,
              y: flipDown ? (rect.bottom - frameRect.top) : (rect.top - frameRect.top),
              flipDown,
              highlightId: hl.id,
              text: hl.text,
              color: hl.color,
              note: hl.note,
            });
          }
          return;
        }
      }
    }

    // 关闭弹窗
    setPopover(prev => prev.visible ? { ...prev, visible: false } : prev);

    // 非划线模式下不处理文字选择
    if (!selectionModeRef.current) {
      setToolbar(prev => prev.visible ? { ...prev, visible: false } : prev);
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setToolbar(prev => prev.visible ? { ...prev, visible: false } : prev);
      return;
    }

    const text = sel.toString().trim();
    if (!text) {
      setToolbar(prev => prev.visible ? { ...prev, visible: false } : prev);
      return;
    }

    // 找到包含选区的 .epub-page-content 元素
    const anchorNode = sel.anchorNode;
    const contentEl = anchorNode && (anchorNode.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode as HTMLElement)?.closest('.epub-page-content') as HTMLElement | null;
    if (!contentEl) {
      setToolbar(prev => prev.visible ? { ...prev, visible: false } : prev);
      return;
    }

    // 确定章节索引：从 BookPage 的页面信息推算
    const page = currentPageRef.current;
    const info = getChapterForPage(page, paginationRef.current.chapterPageRanges);
    if (!info) return;

    const hlAnchor = selectionToHighlightAnchor(contentEl, info.chapterIndex);
    if (!hlAnchor) return;

    const location = serializeHighlightLoc(hlAnchor);
    pendingHighlightRef.current = { chapterIndex: info.chapterIndex, location, text };

    // 定位工具栏
    const range = sel.getRangeAt(0);
    const rangeRect = range.getBoundingClientRect();
    const frameRect = bookFrameRef.current?.getBoundingClientRect();
    if (frameRect) {
      const spaceAbove = rangeRect.top - frameRect.top;
      const flipDown = spaceAbove < 50; // 工具栏约 40px 高
      setToolbar({
        visible: true,
        x: rangeRect.left + rangeRect.width / 2 - frameRect.left,
        y: flipDown ? (rangeRect.bottom - frameRect.top) : (rangeRect.top - frameRect.top),
        flipDown,
        chapterIndex: info.chapterIndex,
        text,
      });
    }
  }, [rawHighlights]);

  // 监听 mouseup
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('mouseup', handleMouseUp);
    return () => el.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  // ---- 工具栏操作回调 ----
  const handleToolbarHighlight = useCallback((color: string) => {
    const pending = pendingHighlightRef.current;
    if (!pending) return;
    onAddHighlight?.(pending.text, pending.location, color);
    pendingHighlightRef.current = null;
    window.getSelection()?.removeAllRanges();
  }, [onAddHighlight]);

  const handleToolbarNote = useCallback(() => {
    const pending = pendingHighlightRef.current;
    if (!pending) return;
    // 先创建高亮（默认黄色），然后通过监听新增高亮来弹出笔记弹窗
    onAddHighlight?.(pending.text, pending.location, 'yellow');
    pendingHighlightRef.current = null;
    window.getSelection()?.removeAllRanges();
    // TODO: 理想情况下应等高亮创建完成后弹出笔记编辑弹窗
    // 当前实现是创建后用户点击高亮文字来编辑笔记
  }, [onAddHighlight]);

  const handleToolbarCopy = useCallback(() => {
    const pending = pendingHighlightRef.current;
    if (pending) {
      navigator.clipboard.writeText(pending.text).catch(() => {});
    }
    pendingHighlightRef.current = null;
    window.getSelection()?.removeAllRanges();
  }, []);

  const handleToolbarClose = useCallback(() => {
    setToolbar(prev => ({ ...prev, visible: false }));
  }, []);

  // ---- 笔记弹窗操作回调 ----
  const handlePopoverUpdate = useCallback((id: string, data: { color?: string; note?: string }) => {
    onUpdateHighlight?.(id, data);
  }, [onUpdateHighlight]);

  const handlePopoverDelete = useCallback((id: string) => {
    onDeleteHighlight?.(id);
  }, [onDeleteHighlight]);

  const handlePopoverClose = useCallback(() => {
    setPopover(prev => ({ ...prev, visible: false }));
  }, []);

  // ---- 修复 react-pageflip-enhanced 内部 bug ----
  // 库内部 getBottomPage/getFlippingPage 可能返回 undefined（索引越界），
  // 但 setRightPage 等方法只检查 !== null，导致对 undefined 调用 .setOrientation() 崩溃。
  // 在 Render 对象上包裹这些方法，将 undefined 转为 null。
  //
  // 使用 onInit 回调而非 useEffect：
  // key={settingsKey} 导致 HTMLFlipBook 重新挂载，其内部 PageFlip 实例在第二个 render cycle
  // 的 effect 中才创建。而父组件的 useEffect 在第一个 cycle 就运行了——此时
  // flipBookRef.current.pageFlip() 返回 undefined，导致 monkeypatch 永远无法应用。
  // onInit 在 PageFlip.loadFromHTML 完成后立即触发，此时 render 对象已就绪。
  const handleFlipBookInit = useCallback(() => {
    const pf = flipBookRef.current?.pageFlip();
    if (!pf) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const render = (pf as any).render;
    if (!render) return;
    const methods = ['setRightPage', 'setLeftPage', 'setBottomPage', 'setFlippingPage'] as const;
    for (const m of methods) {
      if (typeof render[m] === 'function' && !render[`__patched_${m}`]) {
        const original = render[m].bind(render);
        render[m] = (page: unknown) => original(page ?? null);
        render[`__patched_${m}`] = true;
      }
    }
  }, []);

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

  // ---- 外部导航（侧边栏高亮点击跳转） ----
  const navigateTo = useCallback((location: string) => {
    // 尝试解析高亮位置
    const hlAnchor = deserializeHighlightLoc(location);
    if (hlAnchor && paginationRef.current.blockMaps.length > 0) {
      // 将高亮的 startBlock/startOffset 映射为 ReadingAnchor
      const readingAnchor: ReadingAnchor = {
        chapterIndex: hlAnchor.chapterIndex,
        blockIndex: hlAnchor.startBlockIndex,
        charOffset: hlAnchor.startCharOffset,
        textSnippet: hlAnchor.text?.slice(0, 30) ?? '',
      };
      const page = computePageForAnchor(readingAnchor, paginationRef.current.chapterPageRanges, paginationRef.current.blockMaps);
      if (page >= 0 && page < paginationRef.current.totalPages) {
        currentPageRef.current = page;
        currentAnchorRef.current = readingAnchor;
        userHasFlippedRef.current = true;
        setCurrentPage(page);
        pageStore.setBoth(page);
        const pf = flipBookRef.current?.pageFlip();
        if (pf) { try { pf.turnToPage(page); } catch { /* */ } }
        return;
      }
    }
    // fallback: 尝试解析为阅读锚点
    const parsed = deserializeAnchor(location);
    if (parsed.anchor && paginationRef.current.blockMaps.length > 0) {
      const page = computePageForAnchor(parsed.anchor, paginationRef.current.chapterPageRanges, paginationRef.current.blockMaps);
      if (page >= 0) {
        currentPageRef.current = page;
        currentAnchorRef.current = parsed.anchor;
        userHasFlippedRef.current = true;
        setCurrentPage(page);
        pageStore.setBoth(page);
        const pf = flipBookRef.current?.pageFlip();
        if (pf) { try { pf.turnToPage(page); } catch { /* */ } }
      }
    }
  }, [pageStore]);

  // 注册导航函数给外部使用
  const onRegisterNavigateRef = useRef(onRegisterNavigate);
  useEffect(() => { onRegisterNavigateRef.current = onRegisterNavigate; }, [onRegisterNavigate]);
  useEffect(() => {
    onRegisterNavigateRef.current?.(navigateTo);
  }, [navigateTo]);

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
      chapterIndex={p.chapterIndex}
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
        <div ref={bookFrameRef} className={`book-frame ${selectionMode ? 'hl-selection-active' : ''}`}
          style={{ position: 'relative', opacity: showBook ? 1 : 0, transition: 'opacity 0.3s ease-in' }}>
          {!isMobile && <div className="book-shadow" />}
          {!isMobile && <div className="page-stack-left" />}
          {!isMobile && <div className="page-stack-right" />}

          <HighlightStoreContext.Provider value={highlightStore}>
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
              renderOnlyPageLengthChange={true}
              onInit={handleFlipBookInit} onFlip={handleFlip} style={{}}>
              {stableChildren}
            </HTMLFlipBook>
          </PageStoreContext.Provider>
          </HighlightStoreContext.Provider>

          {!isMobile && <div className="book-spine" />}

          {/* 高亮工具栏 */}
          {toolbar.visible && (
            <HighlightToolbar
              position={{ x: toolbar.x, y: toolbar.y }}
              flipDown={toolbar.flipDown}
              onHighlight={handleToolbarHighlight}
              onNote={handleToolbarNote}
              onCopy={handleToolbarCopy}
              onClose={handleToolbarClose}
            />
          )}

          {/* 笔记弹窗：编辑模式 */}
          {popover.visible && !popover.readOnly && (
            <NotePopover
              position={{ x: popover.x, y: popover.y }}
              flipDown={popover.flipDown}
              highlightId={popover.highlightId}
              text={popover.text}
              color={popover.color}
              note={popover.note}
              onUpdate={handlePopoverUpdate}
              onDelete={handlePopoverDelete}
              onClose={handlePopoverClose}
            />
          )}

          {/* 笔记弹窗：只读模式（非划线模式下点击高亮文字） */}
          {popover.visible && popover.readOnly && (
            <div
              className="hl-note-viewer"
              style={{
                position: 'absolute', zIndex: 100,
                left: popover.x, top: popover.y,
                transform: popover.flipDown
                  ? 'translate(-50%, 0%) translateY(12px)'
                  : 'translate(-50%, -100%) translateY(-12px)',
              }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            >
              {/* 颜色标记条 */}
              <div className="hl-nv-bar" style={{
                background: popover.color === 'yellow' ? '#ffd84d' : popover.color === 'green' ? '#6cc96c' : popover.color === 'blue' ? '#5ca8ff' : popover.color === 'pink' ? '#ff7fa0' : '#a47aff',
              }} />

              {/* 引用文字 */}
              <div className="hl-nv-quote">
                &ldquo;{popover.text.length > 100 ? popover.text.slice(0, 100) + '…' : popover.text}&rdquo;
              </div>

              {/* 笔记内容 */}
              {popover.note ? (
                <div className="hl-nv-note">{popover.note}</div>
              ) : (
                <div className="hl-nv-empty">暂无笔记</div>
              )}

              {/* 底部操作 */}
              <div className="hl-nv-footer">
                <button className="hl-nv-edit" onClick={handleSwitchToEdit}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  编辑
                </button>
                <button className="hl-nv-close" onClick={handlePopoverClose}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* 划线模式切换按钮 */}
          <button
            className={`hl-mode-toggle ${selectionMode ? 'hl-mode-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); toggleSelectionMode(); }}
            title={selectionMode ? '退出划线模式（可用键盘 ← → 翻页）' : '进入划线模式'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill={selectionMode ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span className="hl-mode-label">{selectionMode ? '划线中' : '划线'}</span>
          </button>

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

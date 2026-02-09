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
import { useEpubContent } from '@/lib/hooks/use-epub-content';
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
// 旧架构问题链（假设 800 页的书）：
// setCurrentPage → EpubReaderView re-render
//   → pages.map(800) 创建 800 个新 JSX 元素
//   → HTMLFlipBook 收到新 children（引用变了）→ 也 re-render
//   → 库内部 React.Children.map 克隆 800 个元素
//   → updateFromHtml 重建整个 PageCollection
//   → 800 个 React.memo 比较（手机端 ~15ms）
//   → ~13 个 BookPage innerHTML 更新（50-200ms 每个大章节）
//
// 新架构：
// 翻页 → pageStore.setPage() → 仅通知订阅的 BookPage
//   → useSyncExternalStore：800 个 getSnapshot 调用（~0.5ms）
//   → 只有 ~4 个跨越窗口边界的 BookPage 实际 re-render
//   → 父组件零 re-render → children 引用不变 → 库零重建
//
// 效果：翻页开销从 O(N) 降到 O(1)，800 页的书和 50 页的书一样流畅。

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
        // 初始页变化也通知订阅者，确保 BookPage 重新计算 isNear
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
  onProgressUpdate?: (percentage: number, location?: string) => void;
  onAddBookmark?: (location: string, title?: string) => void;
  onAddHighlight?: (text: string, location: string, color?: string) => void;
}

export default function EpubReaderView({
  url,
  bookId,
  initialLocation,
  settings,
  onProgressUpdate,
}: EpubReaderViewProps) {
  // ---- 容器尺寸 ----
  // 移动端浏览器地址栏随滑动收缩/展开会导致视口高度频繁变化（±50~80px）。
  // 如果每次都触发重排版，用户一滑动就闪烁。
  // 策略：宽度变化始终响应（设备旋转等），高度变化需超过阈值才响应。
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // 高度变化阈值：移动端地址栏变化通常在 50-80px，设 100px 过滤掉
    const HEIGHT_THRESHOLD = 100;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const newW = rect.width;
      const newH = rect.height;

      setContainerSize(prev => {
        // 首次测量：直接设置
        if (prev.w === 0 && prev.h === 0) {
          return { w: newW, h: newH };
        }
        // 宽度变化：始终更新（设备旋转、窗口缩放）
        const widthChanged = Math.abs(newW - prev.w) > 1;
        // 高度变化：仅当超过阈值时更新（过滤地址栏抖动）
        const heightChanged = Math.abs(newH - prev.h) > HEIGHT_THRESHOLD;

        if (widthChanged || heightChanged) {
          return { w: newW, h: heightChanged ? newH : prev.h };
        }
        return prev; // 无显著变化，不更新
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- EPUB 内容解析 ----
  const { chapters, styles: epubStyles, isLoading, error } = useEpubContent(bookId, url);

  // ---- 响应式：判断是否为移动端（单页模式） ----
  const isMobile = containerSize.w > 0 && containerSize.w < 768;

  // ---- 计算单页尺寸 ----
  // 用户设置的页宽（双页总宽度），仅桌面端生效
  const settingsPageWidth = settings?.pageWidth ?? 800;

  const pageDimensions = useMemo(() => {
    if (containerSize.w === 0 || containerSize.h === 0) {
      return { pageW: 400, pageH: 560 };
    }

    const availH = containerSize.h - 32; // 上下留白

    if (isMobile) {
      // 移动端：全屏显示，宽高占满可用空间
      return { pageW: containerSize.w, pageH: containerSize.h };
    }

    // 桌面端：使用用户设置的页宽，但不超过容器可用宽度
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

  // ---- 分页 ----
  const pagination = useBookPagination(
    chapters,
    epubStyles,
    settings,
    contentWidth,
    contentHeight,
  );

  // ---- 章节文本长度（用于字符偏移量定位）----
  // 提取每个章节的纯文本长度，构建全书字符偏移表。
  // 进度存储为 "char:12345"（全书第 12345 个字符），设备无关。
  const { chapterTextLengths, chapterCumOffsets, totalTextLength } = useMemo(() => {
    const lengths: number[] = [];
    const cumOffsets: number[] = [0];
    let total = 0;
    for (const ch of chapters) {
      // 去除 HTML 标签，只保留纯文本，计算字符数
      const textLen = ch.html.replace(/<[^>]*>/g, '').length;
      lengths.push(textLen);
      total += textLen;
      cumOffsets.push(total);
    }
    return { chapterTextLengths: lengths, chapterCumOffsets: cumOffsets, totalTextLength: total };
  }, [chapters]);

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
    // 二分查找：找到该偏移量所在的章节
    let chIdx = 0;
    for (let i = 1; i < chapterCumOffsets.length; i++) {
      if (offset < chapterCumOffsets[i]) { chIdx = i - 1; break; }
      chIdx = i - 1;
    }
    // 在章节内的比例 → 页内位置
    const localOffset = offset - chapterCumOffsets[chIdx];
    const chTextLen = chapterTextLengths[chIdx] || 1;
    const ratio = Math.min(localOffset / chTextLen, 1);
    const range = pagination.chapterPageRanges[chIdx];
    if (!range) return 0;
    const pageInChapter = Math.min(Math.round(ratio * range.pageCount), range.pageCount - 1);
    return Math.min(range.startPage + pageInChapter, pagination.totalPages - 1);
  }, [totalTextLength, pagination.totalPages, pagination.chapterPageRanges, chapterCumOffsets, chapterTextLengths]);

  // ---- 当前页 ----
  // 解析保存的阅读进度：
  //   "char:12345"  — 字符偏移（设备无关，最精确）
  //   "page:N/Total" — 页码/总页数（旧格式兼容，按比例映射）
  //   "page:N"       — 页码（更旧格式兼容）
  const savedCharOffset = useMemo(() => {
    if (!initialLocation) return 0;
    if (initialLocation.startsWith('char:')) {
      const parsed = parseInt(initialLocation.replace('char:', ''), 10);
      return isNaN(parsed) || parsed < 0 ? 0 : parsed;
    }
    // 兼容旧 page:N/Total 格式 → 转为比例
    if (initialLocation.startsWith('page:')) {
      const rest = initialLocation.replace('page:', '');
      if (rest.includes('/')) {
        const [p, t] = rest.split('/');
        const page = parseInt(p, 10) || 0;
        const total = parseInt(t, 10) || 0;
        if (total > 0 && page > 0) {
          // 用旧页码比例估算字符偏移
          return Math.round((page / Math.max(1, total - 1)) * totalTextLength);
        }
      }
      const page = parseInt(rest, 10) || 0;
      // 无总页数参考，用当前总页数估算
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

  // ---- 主题 & 排版设置（提前声明，供后续 effect 引用）----
  const theme = settings?.theme || 'light';
  const themeClass =
    theme === 'dark' ? 'book-theme-dark' :
    theme === 'sepia' ? 'book-theme-sepia' : '';
  const fontSize = settings?.fontSize ?? 16;
  const lineHeightVal = settings?.lineHeight ?? 1.8;
  const fontFamily = settings?.fontFamily ?? 'system';

  // ---- 外部页面存储（不触发父组件 re-render）----
  // 创建一次，整个组件生命周期内稳定
  const [pageStore] = useState(createPageStore);

  // 同步 lazyWindow 到 store
  useEffect(() => {
    pageStore.setLazyWindow(isMobile ? LAZY_WINDOW_MOBILE : LAZY_WINDOW_DESKTOP);
  }, [isMobile, pageStore]);

  const [showBook, setShowBook] = useState(false);
  // 稳定的 key：仅在重排版完成后才更新，防止设置变化导致 HTMLFlipBook 提前 remount
  const [flipBookKey, setFlipBookKey] = useState('');
  // 记录上次分页完成时的排版设置指纹，用于 render 阶段立刻检测设置是否变化
  const [paginatedSettingsKey, setPaginatedSettingsKey] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flipBookRef = useRef<any>(null);
  const initializedRef = useRef(false);
  const prevTotalRef = useRef(0);
  const flipTargetRef = useRef(0);
  const currentPageRef = useRef(0);
  /** 防抖定时器：进度上报 */
  const lazyUpdateTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 分页完成 → 更新 flipBookKey + showBook(false)，在同一个批次更新
  //
  // 关键：setFlipBookKey 和 setShowBook(false) 必须在同一个 effect 中调用，
  // 这样 React 将它们合并为一次 re-render。
  // 如果分成两个 effect，中间会有一帧 (isReady=true, settingsChanged=false, showBook=true)
  // 导致遮罩短暂消失又出现（"闪两次"）。
  const remountCountRef = useRef(0);

  useEffect(() => {
    if (!pagination.isReady) return;

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
    }

    // 同步 store：确保 BookPage 首次渲染时 isNear 基于正确的页码计算。
    // 设置两个中心点：currentPage（翻页更新）+ initialPage（安全网）
    // BookPage 的 isNear 会检查两者，避免因 effect 时序导致空白。
    pageStore.setInitialPage(currentPageRef.current);
    pageStore.setPage(currentPageRef.current);

    // 递增计数器，确保即使排版结果完全相同（如设置 A→B→A），key 也会变化触发 remount
    remountCountRef.current++;

    // 同一个批次：flipBookKey + showBook(false) + settingsKey
    // React 将这三个 setState 合并为一次 re-render，遮罩不会中间消失
    setFlipBookKey(`${remountCountRef.current}_${pagination.totalPages}_${pageDimensions.pageW}_${pageDimensions.pageH}`);
    setShowBook(false);
    setPaginatedSettingsKey(`${fontSize}_${lineHeightVal}_${fontFamily}_${pageDimensions.pageW}_${pageDimensions.pageH}`);
  }, [pagination.isReady, pagination.totalPages, startPage, pageDimensions.pageW, pageDimensions.pageH, fontSize, lineHeightVal, fontFamily, pageStore]);

  // flipBookKey 变化 → HTMLFlipBook 已 remount → 等待渲染完成 → 跳转页码 → 淡入
  useEffect(() => {
    if (!flipBookKey) return;

    const timer = setTimeout(() => {
      const page = currentPageRef.current;
      if (page > 0) {
        flipBookRef.current?.pageFlip()?.turnToPage(page);
      }
      // 同步 store，让 BookPage 们知道当前位置
      pageStore.setPage(page);
      setShowBook(true);
    }, 300); // 300ms 足够 HTMLFlipBook 内部初始化 + React 渲染页面内容

    return () => clearTimeout(timer);
  }, [flipBookKey, pageStore]);

  // ---- 翻页事件 ----
  //
  // 新架构：翻页只更新 pageStore（ref-based），不触发任何 React state 变更。
  // BookPage 通过 useSyncExternalStore 订阅 pageStore，仅跨越窗口边界的 ~4 个页面 re-render。
  // 进度上报延迟到 300ms 防抖，避免连续翻页时触发父组件 re-render。

  const handleFlip = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      const targetPage = e.data as number;
      flipTargetRef.current = targetPage;
      currentPageRef.current = targetPage;

      // 每次翻页都同步 store，确保目标页的 isNear 立即为 true。
      // useSyncExternalStore 的 getSnapshot 只做减法+比较（~0.5ms/800页），
      // 只有 isNear 值变化的页面才会 re-render，不会有性能问题。
      if (lazyUpdateTimer.current) clearTimeout(lazyUpdateTimer.current);
      pageStore.setPage(targetPage);
    },
    [pageStore],
  );

  const handleChangeState = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      if (e.data === 'read') {
        const page = flipTargetRef.current;
        currentPageRef.current = page;

        // store 已由 handleFlip 立即同步，这里只需处理进度上报。
        // 防抖 300ms：用户停止翻页后上报进度（避免连续翻页触发大量 API 请求）
        if (lazyUpdateTimer.current) clearTimeout(lazyUpdateTimer.current);
        lazyUpdateTimer.current = setTimeout(() => {
          // 确保 store 和当前页一致（兜底）
          pageStore.setPage(page);
          if (pagination.totalPages > 0) {
            const pct = Math.round((page / Math.max(1, pagination.totalPages - 1)) * 100);
            // 存储字符偏移量（设备无关）：char:12345
            const charOffset = pageToCharOffset(page);
            onProgressUpdate?.(pct, `char:${charOffset}`);
          }
        }, 300);
      }
    },
    [pagination.totalPages, onProgressUpdate, pageStore, pageToCharOffset],
  );

  // 清理定时器
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
  const emptyContent = contentParsed && pagination.isReady && pagination.totalPages === 0 && chapters.length === 0;

  // ---- render 阶段立刻检测设置变化 ----
  const currentSettingsKey = `${fontSize}_${lineHeightVal}_${fontFamily}_${pageDimensions.pageW}_${pageDimensions.pageH}`;
  const settingsChanged = paginatedSettingsKey !== '' && paginatedSettingsKey !== currentSettingsKey;

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
  //
  // 关键优化：children 不依赖 currentPage！
  // 每个 BookPage 始终收到完整的 chapterHtml（引用稳定），
  // 由 BookPage 内部通过 useSyncExternalStore 决定是否渲染内容。
  //
  // 结果：翻页时 children 引用不变 → HTMLFlipBook 的 React.memo 命中 →
  //       库内部 effect 不触发 → 零 cloneElement → 零 PageCollection 重建
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

      {/* ---- 统一遮罩 ----
        始终渲染在 DOM 中（不做条件卸载），用 opacity 控制显隐。
        渲染在 book-frame 之后，DOM 顺序天然覆盖书页，无需依赖 z-index 竞争。
        避免条件渲染导致的 DOM 增删重排闪烁。
      */}
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
            ? '正在解析 EPUB…'
            : '排版中…'}
        </span>
      </div>
    </div>
  );
}

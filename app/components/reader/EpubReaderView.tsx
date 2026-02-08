'use client';

import {
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
 * 桌面端懒渲染窗口 ±6 = 覆盖 13 页。
 * 桌面端是双页模式，每次翻页跳 2 页，距离增长更快。
 * ±6 允许连续翻 3 次（跳 6 页）才触发一次窗口更新。
 */
const LAZY_WINDOW_DESKTOP = 6;
/**
 * 移动端懒渲染窗口 ±4 = 覆盖 9 页。
 * 配合"防抖 + 边缘预更新"策略：
 * - 正常翻页（距中心 < 3 页）：不触发 re-render，零抖动
 * - 接近窗口边缘（距中心 ≥ 3 页）：立即更新窗口中心，防止空白
 * - 用户停止翻页：300ms 后防抖把窗口居中
 */
const LAZY_WINDOW_MOBILE = 4;

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

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- EPUB 内容解析 ----
  const { chapters, styles: epubStyles, isLoading, error } = useEpubContent(bookId);

  // ---- 响应式：判断是否为移动端（单页模式） ----
  const isMobile = containerSize.w > 0 && containerSize.w < 768;

  // ---- 计算单页尺寸 ----
  const pageDimensions = useMemo(() => {
    if (containerSize.w === 0 || containerSize.h === 0) {
      return { pageW: 400, pageH: 560 };
    }

    const availH = containerSize.h - 32; // 上下留白

    if (isMobile) {
      // 移动端：全屏显示，宽高占满可用空间
      return { pageW: containerSize.w, pageH: containerSize.h };
    }

    const maxBookWidth = containerSize.w - 48;
    const singlePageW = Math.min(Math.floor(maxBookWidth / 2), 520);
    const singlePageH = Math.min(availH, singlePageW * 1.4);

    return {
      pageW: singlePageW,
      pageH: singlePageH,
    };
  }, [containerSize, isMobile]);

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

  // ---- 当前页 ----
  const initialPage = useMemo(() => {
    if (!initialLocation || !initialLocation.startsWith('page:')) return 0;
    const parsed = parseInt(initialLocation.replace('page:', ''), 10);
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  }, [initialLocation]);

  const startPage = useMemo(() => {
    if (!pagination.isReady) return 0;
    return Math.min(initialPage, Math.max(0, pagination.totalPages - 1));
  }, [pagination.isReady, pagination.totalPages, initialPage]);

  // currentPage 状态仅用于控制懒渲染窗口（决定哪些页面渲染真实 HTML）。
  // 翻页时不直接更新它，而是通过防抖延迟更新，避免每次翻页都触发
  // 大量 DOM 重建（dangerouslySetInnerHTML 是同步操作，无法被 startTransition 拆分）。
  const [currentPage, setCurrentPage] = useState(0);
  const [showBook, setShowBook] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flipBookRef = useRef<any>(null);
  const initializedRef = useRef(false);
  const prevTotalRef = useRef(0);
  const flipTargetRef = useRef(0);
  const currentPageRef = useRef(0);
  /** 防抖定时器：控制懒渲染窗口的更新频率 */
  const lazyUpdateTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** 翻页队列：动画期间的翻页请求暂存，动画结束后立即执行 */
  const flipQueueRef = useRef<'next' | 'prev' | null>(null);
  /** 是否正在翻页动画中 */
  const isFlippingRef = useRef(false);

  // 首次分页完成后设置正确的起始页
  useEffect(() => {
    if (!pagination.isReady) return;

    if (!initializedRef.current) {
      initializedRef.current = true;
      prevTotalRef.current = pagination.totalPages;
      flipTargetRef.current = startPage;
      currentPageRef.current = startPage;

      setTimeout(() => {
        if (startPage > 0) {
          flipBookRef.current?.pageFlip()?.turnToPage(startPage);
        }
        setCurrentPage(startPage);
        setShowBook(true);
      }, 150);
    } else if (prevTotalRef.current > 0 && pagination.totalPages !== prevTotalRef.current) {
      const ratio = currentPageRef.current / Math.max(1, prevTotalRef.current - 1);
      const newPage = Math.min(
        Math.round(ratio * (pagination.totalPages - 1)),
        pagination.totalPages - 1,
      );
      prevTotalRef.current = pagination.totalPages;

      setTimeout(() => {
        flipBookRef.current?.pageFlip()?.turnToPage(Math.max(0, newPage));
      }, 100);
    }
  }, [pagination.isReady, pagination.totalPages, startPage]);

  // ---- 翻页事件 ----
  //
  // 混合策略：防抖 + 边缘保护 + 进度防抖
  //
  // 问题链：
  // 1. dangerouslySetInnerHTML 是同步 DOM 操作，大章节 HTML 注入阻塞主线程
  // 2. onProgressUpdate 触发父组件 re-render → EpubReaderView 跟着 re-render
  //    → pages.map 遍历 800 个页面做 memo 比较（手机端 ~15ms，桌面端 ~2ms）
  //    这是手机端每次翻页都抖、桌面端不抖的直接原因。
  //
  // 解决：
  // - handleFlip：只更新 ref + 边缘紧急保护，不触发任何 state/callback
  // - handleChangeState：只做边缘检查（零开销条件），进度上报延迟到防抖
  // - 300ms 防抖统一处理：窗口居中 + 进度上报（一次性 re-render）
  //
  // 效果：连续翻页期间零 re-render（包括父组件），零 DOM 重建，零抖动。

  const handleFlip = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      const targetPage = e.data as number;
      flipTargetRef.current = targetPage;
      currentPageRef.current = targetPage;
      isFlippingRef.current = true;

      // 紧急保护：目标页触及懒渲染窗口边缘时，立即更新防止空白
      setCurrentPage(prev => {
        const lazyWindow = isMobile ? LAZY_WINDOW_MOBILE : LAZY_WINDOW_DESKTOP;
        if (Math.abs(targetPage - prev) >= lazyWindow) {
          if (lazyUpdateTimer.current) clearTimeout(lazyUpdateTimer.current);
          return targetPage;
        }
        return prev;
      });
    },
    [isMobile],
  );

  const handleChangeState = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      if (e.data === 'read') {
        isFlippingRef.current = false;

        // ---- 翻页队列：立即执行排队中的翻页，不做任何 state 更新 ----
        // 用户在动画期间点击/滑动时，请求暂存在 flipQueueRef。
        // 动画结束立即执行，实现"连续翻"的流畅体验。
        if (flipQueueRef.current) {
          const queued = flipQueueRef.current;
          flipQueueRef.current = null;
          const pf = flipBookRef.current?.pageFlip();
          if (pf) {
            if (queued === 'next') pf.flipNext();
            else pf.flipPrev();
          }
          return; // 这次不做 window/progress 更新，等新动画结束再处理
        }

        const page = flipTargetRef.current;
        currentPageRef.current = page;

        if (lazyUpdateTimer.current) clearTimeout(lazyUpdateTimer.current);

        // 边缘预更新：接近窗口边缘时立即更新，防止下一翻空白
        setCurrentPage(prev => {
          const lazyWindow = isMobile ? LAZY_WINDOW_MOBILE : LAZY_WINDOW_DESKTOP;
          if (Math.abs(page - prev) >= lazyWindow - 1) {
            return page;
          }
          return prev;
        });

        // 防抖 300ms：用户停止翻页后，一次性完成窗口居中 + 进度上报
        lazyUpdateTimer.current = setTimeout(() => {
          setCurrentPage(prev => prev === page ? prev : page);
          if (pagination.totalPages > 0) {
            const pct = Math.round((page / Math.max(1, pagination.totalPages - 1)) * 100);
            onProgressUpdate?.(pct, `page:${page}`);
          }
        }, 300);
      }
    },
    [pagination.totalPages, onProgressUpdate, isMobile],
  );

  // 清理防抖定时器
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

  // ---- 移动端：滑动 + 点击翻页手势 ----
  // 移动端完全禁用库的内置手势（swipeDistance=9999, disableFlipByClick, useMouseEvents=false），
  // 所有触摸交互由此自定义 handler 全权处理，避免双重触发。
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  /** 执行翻页，自动处理动画期间的排队 */
  const doFlip = useCallback((direction: 'next' | 'prev') => {
    const pf = flipBookRef.current?.pageFlip();
    if (!pf) return;
    if (isFlippingRef.current) {
      // 动画进行中 → 排队，动画结束后 handleChangeState 会立即执行
      flipQueueRef.current = direction;
    } else {
      if (direction === 'next') pf.flipNext();
      else pf.flipPrev();
    }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
  }, [isMobile]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isMobile || !touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.t;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    touchStartRef.current = null;

    // 滑动翻页：水平 ≥ 15px，主要水平方向，800ms 内
    // 阈值从 20px 降到 15px，消除与点击之间的死区
    if (absDx >= 15 && absDx > absDy * 0.8 && dt < 800) {
      e.preventDefault();
      doFlip(dx < 0 ? 'next' : 'prev');
      return;
    }

    // 点击翻页：移动 < 15px（从 10px 放宽，适应手指自然抖动），时间 < 400ms
    if (absDx < 15 && absDy < 15 && dt < 400) {
      const tapX = touch.clientX;
      // 点击区域：左 25% → prev，右 25% → next，中间 50% → toolbar
      // 从 35%/65% 改为 25%/75%，翻页区域更大更容易点到
      if (tapX < containerSize.w * 0.25) {
        e.preventDefault();
        doFlip('prev');
      } else if (tapX > containerSize.w * 0.75) {
        e.preventDefault();
        doFlip('next');
      }
      // 中间 50%：不 preventDefault，click 自然冒泡到父组件切换 toolbar
    }
  }, [isMobile, containerSize.w, doFlip]);

  // ---- 主题 ----
  const theme = settings?.theme || 'light';
  const themeClass =
    theme === 'dark' ? 'book-theme-dark' :
    theme === 'sepia' ? 'book-theme-sepia' : '';

  // ---- 排版设置 ----
  const fontSize = settings?.fontSize ?? 16;
  const lineHeightVal = settings?.lineHeight ?? 1.8;
  const fontFamily = settings?.fontFamily ?? 'system';

  // ---- 是否就绪 ----
  const contentParsed = !isLoading && !error;
  const ready = contentParsed && pagination.isReady && pagination.totalPages > 0 && containerSize.w > 0;
  const emptyContent = contentParsed && pagination.isReady && pagination.totalPages === 0 && chapters.length === 0;

  // ---- 构建页面数据 ----
  // 预计算每个章节的页数，供 BookPage 精确设置容器宽度
  const chapterPageCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const range of pagination.chapterPageRanges) {
      counts[range.chapterIndex] = range.pageCount;
    }
    return counts;
  }, [pagination.chapterPageRanges]);

  const pages = useMemo(() => {
    if (!ready) return [];
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
  }, [ready, pagination.totalPages, pagination.chapterPageRanges, chapterPageCounts]);

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

      {!error && !emptyContent && (!ready || !showBook) && (
        <div className="book-loading">
          <div className="book-loading-spinner" />
          <span className="text-xs opacity-50">
            {isLoading
              ? '正在解析 EPUB...'
              : !ready
              ? '正在排版...'
              : '正在恢复阅读进度...'}
          </span>
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

      {ready && pagination.totalPages > 0 && (
        <div
          className="book-frame"
          style={{
            position: 'relative',
            opacity: showBook ? 1 : 0,
            transition: 'opacity 0.3s ease-in',
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {!isMobile && <div className="book-shadow" />}
          {!isMobile && <div className="page-stack-left" />}
          {!isMobile && <div className="page-stack-right" />}

          <HTMLFlipBook
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
            mobileScrollSupport={false}
            useMouseEvents={!isMobile}
            usePortrait={isMobile}
            singlePage={isMobile}
            flippingTime={isMobile ? 200 : 600}
            drawShadow={!isMobile}
            maxShadowOpacity={isMobile ? 0.15 : 0.25}
            showPageCorners={!isMobile}
            disableFlipByClick={isMobile}
            clickEventForward={!isMobile}
            swipeDistance={isMobile ? 9999 : 30}
            startPage={startPage}
            startZIndex={2}
            autoSize={false}
            onFlip={handleFlip}
            onChangeState={handleChangeState}
            style={{}}
          >
            {pages.map((p) => {
              const lazyWindow = isMobile ? LAZY_WINDOW_MOBILE : LAZY_WINDOW_DESKTOP;
              const isNear = Math.abs(p.pageIndex - currentPage) <= lazyWindow
                || Math.abs(p.pageIndex - startPage) <= lazyWindow;
              return (
                <BookPage
                  key={p.pageIndex}
                  pageIndex={p.pageIndex}
                  chapterHtml={isNear ? (chapters[p.chapterIndex]?.html || '') : ''}
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
              );
            })}
          </HTMLFlipBook>

          {!isMobile && (
            <div className="book-spine" />
          )}
        </div>
      )}
    </div>
  );
}

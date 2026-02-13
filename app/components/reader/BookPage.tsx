import React, { useContext, useMemo, useCallback, useSyncExternalStore } from 'react';
import { PageStoreContext } from './EpubReaderView';
import { injectHighlightsIntoHtml, type HighlightData } from '@/lib/highlight-anchor';

interface BookPageProps {
  pageIndex: number;
  chapterHtml: string;        // 始终为完整章节 HTML（引用稳定），由内部 isNear 决定是否渲染
  pageInChapter: number;
  chapterPages: number;       // 该章节总页数，用于精确计算容器宽度
  pageWidth: number;
  pageHeight: number;
  pageNumber: number;
  totalPages: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  theme: string;
  padding: number;            // 页面内边距（移动端更小）
  highlights?: HighlightData[]; // 该章节的高亮列表
}

const THEME_MAP: Record<string, { pageNumColor: string }> = {
  dark:  { pageNumColor: 'rgba(200,192,184,0.3)' },
  sepia: { pageNumColor: 'rgba(91,70,54,0.28)' },
  light: { pageNumColor: 'rgba(80,60,30,0.25)' },
};

const FONT_MAP: Record<string, string> = {
  serif: 'Georgia, "Times New Roman", serif',
  'sans-serif': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: '"SF Mono", "Fira Code", monospace',
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
};

// 空订阅（context 不存在时的 fallback）
const noopSubscribe = () => () => {};

/**
 * 翻页书的单页组件
 *
 * 性能优化（新架构 — useSyncExternalStore）：
 *
 * 旧架构：
 *   父组件通过 chapterHtml 为空/非空控制懒渲染。
 *   翻页 → setCurrentPage → 父 re-render → 800 个 children 重新创建
 *   → HTMLFlipBook 收到新 children → 库内部 cloneElement × 800 + PageCollection 重建
 *   → React.memo 比较 × 800（手机端 ~15ms）
 *
 * 新架构：
 *   父组件始终传入完整 chapterHtml（引用稳定，不因翻页而变化）。
 *   BookPage 内部通过 useSyncExternalStore 订阅 pageStore，自行计算 isNear。
 *   翻页时父组件零 re-render，children 引用不变，库零重建。
 *   只有跨越窗口边界的 ~4 个 BookPage 通过 useSyncExternalStore 触发 re-render。
 *
 *   useSyncExternalStore 的特性：
 *   - 每次 store 通知时，调用 getSnapshot 获取新值
 *   - 只有 getSnapshot 返回值变化（Object.is 比较）才触发组件 re-render
 *   - 对于远离窗口的 ~787 个页面，isNear 不变 → 零 re-render
 *   - 即使 800 个 getSnapshot 都执行，总耗时 ~0.5ms（每个只是减法 + 比较）
 */
const BookPage = React.forwardRef<HTMLDivElement, BookPageProps>(
  (
    {
      pageIndex,
      chapterHtml,
      pageInChapter,
      chapterPages,
      pageWidth,
      pageHeight,
      pageNumber,
      totalPages,
      fontSize,
      lineHeight,
      fontFamily,
      theme,
      padding,
      highlights,
    },
    ref,
  ) => {
    const pageStore = useContext(PageStoreContext);

    // 创建稳定的 getSnapshot 函数（只依赖 pageIndex，不会变）
    // 双中心检测：检查 currentPage 和 initialPage，任一命中即渲染内容。
    // initialPage 是安全网：无论 effect 时序如何，startPage 附近的页面始终渲染。
    const getIsNear = useCallback(() => {
      if (!pageStore) return true; // 无 store 时默认显示
      const w = pageStore.getLazyWindow();
      return Math.abs(pageIndex - pageStore.getPage()) <= w
          || Math.abs(pageIndex - pageStore.getInitialPage()) <= w;
    }, [pageStore, pageIndex]);

    // 订阅 pageStore，仅在 isNear 变化时触发 re-render
    const isNear = useSyncExternalStore(
      pageStore?.subscribe ?? noopSubscribe,
      getIsNear,
      getIsNear, // SSR snapshot（'use client' 组件不会实际用到）
    );

    // 只有 isNear 为 true 时才渲染真实内容
    // 如果有高亮数据，注入 <mark> 标签
    const activeHtml = useMemo(() => {
      if (!isNear || !chapterHtml) return '';
      if (highlights && highlights.length > 0) {
        return injectHighlightsIntoHtml(chapterHtml, highlights);
      }
      return chapterHtml;
    }, [isNear, chapterHtml, highlights]);

    const themeColors = THEME_MAP[theme] || THEME_MAP.light;
    const fontFamilyCss = FONT_MAP[fontFamily] || FONT_MAP.system;

    const translateX = pageInChapter * pageWidth;

    // 容器列数：基于章节实际页数 + 2 缓冲，而非硬编码 200
    const containerColumns = Math.max(chapterPages, pageInChapter + 1) + 2;

    // 内容样式：精确宽度容器 + CSS 多列 + translateX 定位
    const contentStyle = useMemo(() => ({
      width: `${pageWidth * containerColumns}px`,
      columnWidth: `${pageWidth}px`,
      columnGap: '0px',
      columnFill: 'auto' as const,
      height: `${pageHeight}px`,
      fontSize: `${fontSize}px`,
      lineHeight,
      fontFamily: fontFamilyCss,
      wordWrap: 'break-word' as const,
      overflowWrap: 'break-word' as const,
      // 始终设置 transform，避免 CSS class 中残留的 transform 属性干扰列布局
      transform: `translateX(-${translateX}px)`,
    }), [pageWidth, containerColumns, pageHeight, fontSize, lineHeight, fontFamilyCss, translateX]);

    return (
      <div
        ref={ref}
        className="book-page"
        style={{
          width: pageWidth + padding * 2,
          height: pageHeight + padding * 2 + 30,
        }}
      >
        {activeHtml ? (
          <div
            style={{
              position: 'absolute',
              top: padding,
              left: padding,
              width: pageWidth,
              height: pageHeight,
              overflow: 'hidden',
            }}
          >
            <div
              className="epub-page-content"
              style={contentStyle}
              dangerouslySetInnerHTML={{ __html: activeHtml }}
            />
          </div>
        ) : (
          <div
            style={{
              position: 'absolute',
              top: padding,
              left: padding,
              width: pageWidth,
              height: pageHeight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* 章节未加载或不在懒渲染窗口内时显示加载提示 */}
            {chapterHtml === '' && (
              <div style={{ textAlign: 'center', opacity: 0.25 }}>
                <div
                  style={{
                    width: 20, height: 20,
                    border: `2px solid ${themeColors.pageNumColor}`,
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                    margin: '0 auto 8px',
                  }}
                />
                <span style={{
                  fontSize: '11px',
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  color: themeColors.pageNumColor,
                  letterSpacing: '0.5px',
                }}>
                  加载中…
                </span>
              </div>
            )}
          </div>
        )}

        {/* 页码 — 优雅的衬线体排版 */}
        <div
          style={{
            position: 'absolute',
            bottom: padding > 24 ? 14 : 6,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: padding > 24 ? '10.5px' : '9.5px',
            fontFamily: 'Georgia, "Times New Roman", "Songti SC", serif',
            color: themeColors.pageNumColor,
            letterSpacing: '1.5px',
            userSelect: 'none',
            fontFeatureSettings: '"tnum"',
          }}
        >
          {pageNumber} <span style={{ opacity: 0.5, margin: '0 2px', letterSpacing: 0 }}>·</span> {totalPages}
        </div>
      </div>
    );
  },
);

BookPage.displayName = 'BookPage';

/**
 * React.memo 自定义比较：
 *
 * 新架构下，翻页时父组件不 re-render，所以 memo 比较极少触发。
 * 只在设置变化（字体/字号/主题等）或分页变化时才触发。
 * 因此比较次数从 "每次翻页 × 800" 降到 "设置变化时 × N"（罕见）。
 *
 * chapterHtml 现在始终是完整章节 HTML（引用稳定），不再因翻页而变化。
 * isNear 由 useSyncExternalStore 内部管理，不参与 memo 比较。
 */
export default React.memo(BookPage, (prev, next) => {
  // 快速路径：如果 chapterHtml 引用相同（同一章节，未重新解析），
  // 且排版参数不变，直接跳过。
  if (prev.chapterHtml !== next.chapterHtml) return false;
  if (prev.pageIndex !== next.pageIndex) return false;
  if (prev.chapterPages !== next.chapterPages) return false;
  if (prev.pageWidth !== next.pageWidth) return false;
  if (prev.pageHeight !== next.pageHeight) return false;
  if (prev.fontSize !== next.fontSize) return false;
  if (prev.lineHeight !== next.lineHeight) return false;
  if (prev.fontFamily !== next.fontFamily) return false;
  if (prev.theme !== next.theme) return false;
  if (prev.totalPages !== next.totalPages) return false;
  if (prev.pageInChapter !== next.pageInChapter) return false;
  if (prev.padding !== next.padding) return false;
  if (prev.highlights !== next.highlights) return false;
  return true;
});

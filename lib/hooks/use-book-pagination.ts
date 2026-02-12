'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChapterData, ChapterMeta } from './use-server-chapters';
import type { ReadingSettingsData } from './use-library';

export interface ChapterPageRange {
  chapterIndex: number;
  startPage: number;
  pageCount: number;
  /** 是否通过 CSS columns 精确测量（false = 估算值） */
  measured: boolean;
}

export interface PaginationResult {
  totalPages: number;
  chapterPageRanges: ChapterPageRange[];
  pageWidth: number;
  pageHeight: number;
  isReady: boolean;
}

/**
 * 混合分页 Hook
 *
 * 原理：
 * - 已加载的章节（html 非空）：用 CSS 多列布局精确测量页数
 * - 未加载的章节（html 为空）：根据 charLength 估算页数
 * - avgCharsPerPage 基于已测量章节动态校准，随着更多章节加载变得更准
 *
 * @param chapters       所有章节数据（未加载的 html 为空字符串）
 * @param chaptersMeta   所有章节元数据（用于估算未加载章节的页数）
 * @param styles         合并后的 EPUB CSS 样式
 * @param settings       阅读设置（字号/行距/字体等）
 * @param containerWidth 内容区域宽度（已减去 padding）
 * @param containerHeight 内容区域高度（已减去 padding）
 */
export function useBookPagination(
  chapters: ChapterData[],
  chaptersMeta: ChapterMeta[],
  styles: string,
  settings: ReadingSettingsData | null | undefined,
  containerWidth: number,
  containerHeight: number,
): PaginationResult {
  const [result, setResult] = useState<PaginationResult>({
    totalPages: 0,
    chapterPageRanges: [],
    pageWidth: 0,
    pageHeight: 0,
    isReady: false,
  });

  const measureRef = useRef<HTMLDivElement | null>(null);

  // 从设置中获取排版参数
  const fontSize = settings?.fontSize ?? 16;
  const lineHeight = settings?.lineHeight ?? 1.8;
  const fontFamily = settings?.fontFamily ?? 'system';

  const fontFamilyCss =
    fontFamily === 'serif' ? 'Georgia, "Times New Roman", serif' :
    fontFamily === 'sans-serif' ? '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' :
    fontFamily === 'mono' ? '"SF Mono", "Fira Code", monospace' :
    '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

  // containerWidth / containerHeight 已经是内容区域尺寸（调用方已减去 padding）
  const pageContentWidth = Math.max(200, containerWidth);
  const pageContentHeight = Math.max(200, containerHeight);

  const paginate = useCallback(() => {
    // 没有内容时也要标记为就绪（避免无限加载）
    if (chapters.length === 0) {
      setResult({
        totalPages: 0,
        chapterPageRanges: [],
        pageWidth: pageContentWidth,
        pageHeight: pageContentHeight,
        isReady: true,
      });
      return;
    }

    if (pageContentWidth <= 0 || pageContentHeight <= 0) {
      return;
    }

    try {
      // 创建隐藏的测量容器
      let measureEl = measureRef.current;
      if (!measureEl) {
        measureEl = document.createElement('div');
        measureEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(measureEl);
        measureRef.current = measureEl;
      }

      // 基本样式：隐藏、不可见
      measureEl.style.cssText = `
        position: absolute;
        left: -99999px;
        top: 0;
        visibility: hidden;
        pointer-events: none;
        z-index: -1;
      `;

      // ---- 第一轮：精确测量已加载的章节 ----
      const measuredRanges: { chapterIndex: number; pageCount: number; charLength: number }[] = [];
      let totalMeasuredChars = 0;
      let totalMeasuredPages = 0;

      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        if (!chapter.html) continue; // 跳过未加载的章节

        // 为每个章节设置测量容器
        measureEl.innerHTML = `
          <style>
            .epub-measure-container * {
              max-width: 100% !important;
              box-sizing: border-box !important;
            }
            .epub-measure-container img {
              max-width: 100% !important;
              height: auto !important;
              object-fit: contain !important;
            }
            .epub-measure-container {
              text-align: justify !important;
            }
            .epub-measure-container p {
              margin: 0.5em 0;
              text-align: justify !important;
              text-indent: 2em !important;
            }
            .epub-measure-container h1, .epub-measure-container h2, .epub-measure-container h3,
            .epub-measure-container h4, .epub-measure-container h5, .epub-measure-container h6 {
              text-indent: 0 !important;
              text-align: left !important;
            }
            ${styles}
          </style>
          <div class="epub-measure-container" style="
            width: ${pageContentWidth}px;
            height: ${pageContentHeight}px;
            column-width: ${pageContentWidth}px;
            column-gap: 0px;
            column-fill: auto;
            overflow: hidden;
            font-size: ${fontSize}px;
            line-height: ${lineHeight};
            font-family: ${fontFamilyCss};
            word-wrap: break-word;
            overflow-wrap: break-word;
          ">${chapter.html}</div>
        `;

        const contentEl = measureEl.querySelector('.epub-measure-container') as HTMLElement;
        if (!contentEl) continue;

        // 测量页数：scrollWidth 除以 columnWidth
        const scrollW = contentEl.scrollWidth;
        const pageCount = Math.max(1, Math.ceil((scrollW - 2) / pageContentWidth));

        const charLength = chaptersMeta[i]?.charLength ?? chapter.html.replace(/<[^>]*>/g, '').length;
        measuredRanges.push({ chapterIndex: i, pageCount, charLength });
        totalMeasuredChars += charLength;
        totalMeasuredPages += pageCount;
      }

      // 清理测量容器内容
      measureEl.innerHTML = '';

      // ---- 计算 avgCharsPerPage（用于估算未加载章节） ----
      // 基于已测量的章节动态校准；如果没有已测量的章节，使用估计值
      const avgCharsPerPage = totalMeasuredPages > 0
        ? totalMeasuredChars / totalMeasuredPages
        : estimateCharsPerPage(fontSize, lineHeight, pageContentWidth, pageContentHeight);

      // ---- 第二轮：构建完整的 chapterPageRanges ----
      const ranges: ChapterPageRange[] = [];
      let cumulativePages = 0;

      // 构建已测量章节的查找表
      const measuredMap = new Map(measuredRanges.map(r => [r.chapterIndex, r.pageCount]));

      for (let i = 0; i < chapters.length; i++) {
        const measuredPageCount = measuredMap.get(i);
        let pageCount: number;
        let measured: boolean;

        if (measuredPageCount !== undefined) {
          // 精确测量值
          pageCount = measuredPageCount;
          measured = true;
        } else {
          // 估算值：基于 charLength 和 avgCharsPerPage
          const charLength = chaptersMeta[i]?.charLength ?? 0;
          pageCount = charLength > 0
            ? Math.max(1, Math.round(charLength / avgCharsPerPage))
            : 1;
          measured = false;
        }

        ranges.push({
          chapterIndex: i,
          startPage: cumulativePages,
          pageCount,
          measured,
        });

        cumulativePages += pageCount;
      }

      const measuredCount = measuredRanges.length;
      const estimatedCount = chapters.length - measuredCount;
      console.log(
        `[Pagination] 分页完成: ${cumulativePages} 页 (${measuredCount} 精确 + ${estimatedCount} 估算), ` +
        `${chapters.length} 章节, 内容区: ${pageContentWidth}x${pageContentHeight}, ` +
        `avgCharsPerPage: ${Math.round(avgCharsPerPage)}`
      );

      setResult({
        totalPages: cumulativePages,
        chapterPageRanges: ranges,
        pageWidth: pageContentWidth,
        pageHeight: pageContentHeight,
        isReady: true,
      });
    } catch (err) {
      console.error('[Pagination] 分页失败:', err);
      setResult({
        totalPages: 0,
        chapterPageRanges: [],
        pageWidth: pageContentWidth,
        pageHeight: pageContentHeight,
        isReady: true,
      });
    }
  }, [chapters, chaptersMeta, styles, fontSize, lineHeight, fontFamilyCss, pageContentWidth, pageContentHeight]);

  // 当内容或设置变化时重新分页
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef(0);
  const hasInitialized = useRef(false);

  // 设置指纹：仅当排版参数变化时才显示"排版中"遮罩。
  // 新章节加载（chapters 变化）只做静默重新分页，不闪烁。
  const settingsKey = `${styles}_${fontSize}_${lineHeight}_${fontFamilyCss}_${pageContentWidth}_${pageContentHeight}`;
  const prevSettingsKeyRef = useRef('');

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const isSettingsChange = prevSettingsKeyRef.current !== '' && prevSettingsKeyRef.current !== settingsKey;
    prevSettingsKeyRef.current = settingsKey;

    // 仅设置变化时显示遮罩（字号/行距/字体/页面尺寸改变）
    // 新章节加载导致的重新分页静默进行，不打断阅读体验
    if (hasInitialized.current && isSettingsChange) {
      setResult(prev => prev.isReady ? { ...prev, isReady: false } : prev); // eslint-disable-line
    }

    debounceRef.current = setTimeout(() => {
      rafRef.current = requestAnimationFrame(() => {
        hasInitialized.current = true;
        paginate();
      });
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [paginate, settingsKey]);

  // 清理测量容器
  useEffect(() => {
    return () => {
      if (measureRef.current) {
        document.body.removeChild(measureRef.current);
        measureRef.current = null;
      }
    };
  }, []);

  return result;
}

/**
 * 根据排版参数估算每页字符数（无已测量数据时的 fallback）
 */
function estimateCharsPerPage(
  fontSize: number,
  lineHeight: number,
  pageWidth: number,
  pageHeight: number,
): number {
  // 粗略估算：
  // 每行字符数 ≈ 页宽 / (字号 * 0.55)（中文字符约 1em 宽，英文约 0.55em）
  // 行数 ≈ 页高 / (字号 * 行高)
  // 取中英文混合的平均值
  const charsPerLine = Math.floor(pageWidth / (fontSize * 0.7));
  const linesPerPage = Math.floor(pageHeight / (fontSize * lineHeight));
  return Math.max(100, charsPerLine * linesPerPage);
}

/**
 * 根据全局页码获取所在章节及章内页码（二分查找，O(log n)）
 */
export function getChapterForPage(
  page: number,
  ranges: ChapterPageRange[],
): { chapterIndex: number; pageInChapter: number } | null {
  if (ranges.length === 0) return null;

  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const range = ranges[mid];
    if (page < range.startPage) {
      hi = mid - 1;
    } else if (page >= range.startPage + range.pageCount) {
      lo = mid + 1;
    } else {
      return {
        chapterIndex: range.chapterIndex,
        pageInChapter: page - range.startPage,
      };
    }
  }
  return null;
}

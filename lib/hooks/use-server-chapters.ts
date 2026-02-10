'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ---- 类型 ----

/** 章节元数据（不含 HTML，轻量级） */
export interface ChapterMeta {
  chapterIndex: number;
  href: string;
  charOffset: number;
  charLength: number;
}

/** 章节完整数据（含 HTML） */
export interface ChapterContent {
  chapterIndex: number;
  href: string;
  html: string;
  charOffset: number;
  charLength: number;
}

/** 传给 EpubReaderView 的章节数据（兼容旧 ChapterData 接口） */
export interface ChapterData {
  html: string;
  id: string;
}

/** Hook 返回值 */
export interface ServerChaptersResult {
  /** 所有章节的元数据（用于估算总页数） */
  chaptersMeta: ChapterMeta[];
  /** 当前已加载的章节内容（Map: chapterIndex -> ChapterContent） */
  loadedChapters: Map<number, ChapterContent>;
  /** 转为 ChapterData[] 格式，用于传递给分页/渲染（未加载的章节 html 为空字符串） */
  chaptersForPagination: ChapterData[];
  /** 合并后的 CSS 样式 */
  styles: string;
  /** 全书总字符数 */
  totalCharacters: number;
  /** 是否正在加载元数据 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 通知 hook 当前阅读位置（章节索引），触发预取 */
  updateCurrentChapter: (chapterIndex: number) => void;
  /** 某个章节是否已加载 */
  isChapterLoaded: (chapterIndex: number) => boolean;
}

// ---- 配置常量 ----

/** 初始加载窗口：当前章节前后各加载多少章 */
const CHAPTER_WINDOW = 5;
/** 预取阈值：距离已加载边界还剩几章时开始预取 */
const PREFETCH_THRESHOLD = 2;
/** 每次预取多少章 */
const PREFETCH_BATCH = 5;
/** 最大缓存章节数（超出时从远端移除） */
const MAX_CACHE = 20;

/**
 * 服务端章节加载 Hook
 *
 * 替代 useEpubContent：不再在浏览器端下载和解析 EPUB，
 * 而是从后端 API 按需加载已解析的章节内容。
 *
 * 核心功能：
 * 1. 挂载时加载章节元数据（轻量级，一次性）
 * 2. 根据初始 charOffset 计算起始章节，加载窗口内的章节
 * 3. 滑动窗口：用户翻页时，预取下一批章节
 * 4. 内存回收：距离当前位置过远的章节从缓存中移除
 *
 * @param bookId          书籍 ID
 * @param initialCharOffset 初始字符偏移量（从阅读进度恢复）
 */
export function useServerChapters(
  bookId: string,
  initialCharOffset: number = 0,
): ServerChaptersResult {
  const [chaptersMeta, setChaptersMeta] = useState<ChapterMeta[]>([]);
  const [styles, setStyles] = useState('');
  const [totalCharacters, setTotalCharacters] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 已加载的章节内容缓存
  const [loadedChapters, setLoadedChapters] = useState<Map<number, ChapterContent>>(new Map());
  // 用 ref 维护一份同步可读的缓存副本（避免在 setState 回调中 peek state）
  const loadedChaptersRef = useRef<Map<number, ChapterContent>>(new Map());
  // 正在加载的章节范围（防止重复请求）
  const loadingRangesRef = useRef<Set<string>>(new Set());
  // 当前章节索引（用于预取和内存回收）
  const currentChapterRef = useRef(0);
  // 章节元数据 ref（避免闭包过期）
  const chaptersMetaRef = useRef<ChapterMeta[]>([]);

  // ---- 根据 charOffset 查找所在章节 ----
  const findChapterByCharOffset = useCallback((offset: number, meta: ChapterMeta[]): number => {
    if (meta.length === 0) return 0;
    if (offset <= 0) return 0;
    for (let i = meta.length - 1; i >= 0; i--) {
      if (offset >= meta[i].charOffset) return i;
    }
    return 0;
  }, []);

  // ---- 加载章节内容 ----
  const fetchChapters = useCallback(async (from: number, to: number) => {
    const meta = chaptersMetaRef.current;
    if (meta.length === 0) return;

    // 钳位范围
    const clampedFrom = Math.max(0, from);
    const clampedTo = Math.min(meta.length - 1, to);
    if (clampedFrom > clampedTo) return;

    // 过滤掉已加载的章节，只请求缺失的（通过 ref 同步读取，不触发 setState）
    const missing: number[] = [];
    const cache = loadedChaptersRef.current;
    for (let i = clampedFrom; i <= clampedTo; i++) {
      if (!cache.has(i)) missing.push(i);
    }
    if (missing.length === 0) return;

    const actualFrom = Math.min(...missing);
    const actualTo = Math.max(...missing);
    const actualKey = `${actualFrom}-${actualTo}`;

    // 防止重复请求
    if (loadingRangesRef.current.has(actualKey)) return;
    loadingRangesRef.current.add(actualKey);

    try {
      const res = await fetch(`/api/library/chapters?bookId=${bookId}&from=${actualFrom}&to=${actualTo}`);
      if (!res.ok) throw new Error(`加载章节失败: ${res.status}`);
      const json = await res.json();
      const chapters: ChapterContent[] = json.data?.chapters ?? [];

      setLoadedChapters(prev => {
        const next = new Map(prev);
        for (const ch of chapters) {
          next.set(ch.chapterIndex, ch);
        }
        // 同步更新 ref
        loadedChaptersRef.current = next;
        return next;
      });
    } catch (err) {
      console.error(`[ServerChapters] 加载章节 ${actualFrom}-${actualTo} 失败:`, err);
    } finally {
      loadingRangesRef.current.delete(actualKey);
    }
  }, [bookId]);

  // ---- 内存回收：移除距离当前位置过远的章节 ----
  const evictDistantChapters = useCallback((currentIdx: number) => {
    setLoadedChapters(prev => {
      if (prev.size <= MAX_CACHE) return prev;

      // 按距离排序，移除最远的
      const entries = Array.from(prev.entries());
      entries.sort((a, b) => Math.abs(a[0] - currentIdx) - Math.abs(b[0] - currentIdx));

      const next = new Map<number, ChapterContent>();
      for (let i = 0; i < Math.min(entries.length, MAX_CACHE); i++) {
        next.set(entries[i][0], entries[i][1]);
      }
      loadedChaptersRef.current = next;
      return next;
    });
  }, []);

  // ---- 更新当前章节（由 EpubReaderView 调用） ----
  const updateCurrentChapter = useCallback((chapterIndex: number) => {
    const prevChapter = currentChapterRef.current;
    currentChapterRef.current = chapterIndex;
    const meta = chaptersMetaRef.current;
    if (meta.length === 0) return;

    // 不变时不做任何操作
    if (chapterIndex === prevChapter) return;

    // 检查是否需要预取（通过 ref 同步读取，不依赖 state）
    const loadedIndices = Array.from(loadedChaptersRef.current.keys());
    const loadedMax = loadedIndices.length > 0 ? Math.max(...loadedIndices) : chapterIndex;
    const loadedMin = loadedIndices.length > 0 ? Math.min(...loadedIndices) : chapterIndex;

    if (chapterIndex >= loadedMax - PREFETCH_THRESHOLD && loadedMax < meta.length - 1) {
      // 向后预取
      fetchChapters(loadedMax + 1, loadedMax + PREFETCH_BATCH);
    }
    if (chapterIndex <= loadedMin + PREFETCH_THRESHOLD && loadedMin > 0) {
      // 向前预取
      fetchChapters(loadedMin - PREFETCH_BATCH, loadedMin - 1);
    }

    // 内存回收
    evictDistantChapters(chapterIndex);
  }, [fetchChapters, evictDistantChapters]);

  // ---- 章节是否已加载 ----
  const isChapterLoaded = useCallback((chapterIndex: number): boolean => {
    return loadedChaptersRef.current.has(chapterIndex);
  }, []);

  // ---- 初始化：加载元数据 + 初始章节 ----
  useEffect(() => {
    let cancelled = false;

    async function init() {
      setIsLoading(true);
      setError(null);

      try {
        // 1. 加载章节元数据
        let metaRes = await fetch(`/api/library/chapters/meta?bookId=${bookId}`);
        let metaJson = await metaRes.json().catch(() => ({}));

        // 如果书籍尚未解析，自动触发解析
        if (!metaRes.ok && metaJson.message?.includes('尚未解析')) {
          console.log('[ServerChapters] 书籍尚未解析，触发服务端解析...');
          const parseRes = await fetch('/api/library/chapters/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookId }),
          });
          if (!parseRes.ok) {
            const parseJson = await parseRes.json().catch(() => ({}));
            throw new Error(parseJson.message || '服务端解析失败');
          }
          if (cancelled) return;

          // 解析完成后重新加载元数据
          metaRes = await fetch(`/api/library/chapters/meta?bookId=${bookId}`);
          metaJson = await metaRes.json().catch(() => ({}));
          if (!metaRes.ok) {
            throw new Error(metaJson.message || `加载元数据失败: ${metaRes.status}`);
          }
        } else if (!metaRes.ok) {
          throw new Error(metaJson.message || `加载元数据失败: ${metaRes.status}`);
        }

        const metaData = metaJson.data;

        if (cancelled) return;

        const meta: ChapterMeta[] = metaData.chapters ?? [];
        chaptersMetaRef.current = meta;

        // 保存元数据值，延迟到和章节内容一起批量设置 state，
        // 避免中间渲染导致 chaptersForPagination 全部为空 html → 估算分页 → 页码闪烁。
        const metaStyles = metaData.styles ?? '';
        const metaTotalChars = metaData.totalCharacters ?? 0;

        if (meta.length === 0) {
          // 无章节时直接一次性设置所有 state
          setChaptersMeta(meta);
          setStyles(metaStyles);
          setTotalCharacters(metaTotalChars);
          setIsLoading(false);
          return;
        }

        // 2. 计算初始章节位置
        const startChapter = findChapterByCharOffset(initialCharOffset, meta);
        currentChapterRef.current = startChapter;

        // 3. 加载初始窗口的章节内容
        const from = Math.max(0, startChapter - CHAPTER_WINDOW);
        const to = Math.min(meta.length - 1, startChapter + CHAPTER_WINDOW);

        const chapRes = await fetch(`/api/library/chapters?bookId=${bookId}&from=${from}&to=${to}`);
        if (!chapRes.ok) throw new Error(`加载章节内容失败: ${chapRes.status}`);
        const chapJson = await chapRes.json();
        const chapters: ChapterContent[] = chapJson.data?.chapters ?? [];

        if (cancelled) return;

        const map = new Map<number, ChapterContent>();
        for (const ch of chapters) {
          map.set(ch.chapterIndex, ch);
        }
        loadedChaptersRef.current = map;

        // 一次性批量设置所有 state（React 18 自动批处理），
        // 确保 chaptersForPagination 在首次渲染时就包含已加载章节的 html，
        // 避免先估算分页再精确分页导致的页码闪烁。
        setChaptersMeta(meta);
        setStyles(metaStyles);
        setTotalCharacters(metaTotalChars);
        setLoadedChapters(map);
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('[ServerChapters] 初始化失败:', err);
          setError(err instanceof Error ? err.message : '加载失败');
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [bookId, initialCharOffset, findChapterByCharOffset]);

  // ---- 构建 chaptersForPagination ----
  // 将 Map 转为与旧接口兼容的 ChapterData[] 数组
  // 未加载的章节 html 为空字符串（分页时会被估算）
  //
  // 必须 useMemo：否则每次渲染都生成新数组引用 →
  //   useBookPagination 的 paginate 回调 deps 变化 → 触发重新分页 → 无限循环
  const chaptersForPagination = useMemo<ChapterData[]>(() => {
    return chaptersMeta.map(meta => {
      const loaded = loadedChapters.get(meta.chapterIndex);
      return {
        html: loaded?.html ?? '',
        id: meta.href,
      };
    });
  }, [chaptersMeta, loadedChapters]);

  return {
    chaptersMeta,
    loadedChapters,
    chaptersForPagination,
    styles,
    totalCharacters,
    isLoading,
    error,
    updateCurrentChapter,
    isChapterLoaded,
  };
}

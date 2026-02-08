'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ePub, { type Book } from 'epubjs';

export interface ChapterData {
  html: string;
  id: string;
}

/**
 * 将 EPUB 章节中的相对路径解析为 EPUB 根路径
 * 例：src="../images/cover.jpg" 在 "text/part0001.html" 中 → "images/cover.jpg"
 */
function resolveEpubUrl(src: string, sectionHref: string): string {
  if (!src || src.startsWith('blob:') || src.startsWith('data:') || src.startsWith('http')) {
    return src;
  }
  try {
    const base = new URL(sectionHref, 'https://epub.local/');
    const resolved = new URL(src, base);
    return resolved.pathname.slice(1); // 去掉开头的 /
  } catch {
    return src;
  }
}

/**
 * 构建资源查找表，支持多种路径格式
 * epubjs 的 book.resources.get() 只做精确匹配，容易查不到
 */
function buildResourceMap(book: Book): Map<string, string> {
  const map = new Map<string, string>();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = book.resources as any;
    const urls: string[] = res.urls || [];
    const replacements: string[] = res.replacementUrls || [];

    for (let i = 0; i < urls.length; i++) {
      const blobUrl = replacements[i];
      if (!blobUrl) continue;

      const url = urls[i];
      // 原始路径
      map.set(url, blobUrl);
      // 去掉开头 ./
      if (url.startsWith('./')) {
        map.set(url.slice(2), blobUrl);
      }
      // URL decode
      try {
        const decoded = decodeURIComponent(url);
        if (decoded !== url) map.set(decoded, blobUrl);
      } catch { /* ignore */ }
      // 文件名（最后的 fallback）
      const basename = url.split('/').pop();
      if (basename && !map.has(basename)) {
        map.set(basename, blobUrl);
      }
    }

    // CSS 资源也加入（有些版本分开存放）
    const cssUrls: string[] = res.cssUrls || [];
    const cssReplacements: string[] = res.cssReplacementUrls || [];
    for (let i = 0; i < cssUrls.length; i++) {
      const blobUrl = cssReplacements[i];
      if (!blobUrl) continue;
      map.set(cssUrls[i], blobUrl);
      if (cssUrls[i].startsWith('./')) {
        map.set(cssUrls[i].slice(2), blobUrl);
      }
    }
  } catch (err) {
    console.warn('[EPUB] Failed to build resource map:', err);
  }

  return map;
}

/**
 * 从资源表中查找 blob URL，尝试多种路径格式
 */
function lookupBlobUrl(
  src: string,
  sectionHref: string,
  resourceMap: Map<string, string>,
): string | undefined {
  if (!src || src.startsWith('blob:') || src.startsWith('data:') || src.startsWith('http')) {
    return undefined;
  }

  // 1. 解析后的路径（相对路径 → 根路径）
  const resolved = resolveEpubUrl(src, sectionHref);
  if (resourceMap.has(resolved)) return resourceMap.get(resolved);

  // 2. 原始路径
  if (resourceMap.has(src)) return resourceMap.get(src);

  // 3. 去掉开头 ./
  const cleaned = src.replace(/^\.\//, '');
  if (resourceMap.has(cleaned)) return resourceMap.get(cleaned);

  // 4. URL decode
  try {
    const decoded = decodeURIComponent(resolved);
    if (decoded !== resolved && resourceMap.has(decoded)) return resourceMap.get(decoded);
  } catch { /* ignore */ }

  // 5. 只用文件名
  const basename = src.split('/').pop() || '';
  if (basename && resourceMap.has(basename)) return resourceMap.get(basename);

  return undefined;
}

export interface EpubContentResult {
  chapters: ChapterData[];
  styles: string;
  metadata: { title: string; author: string };
  isLoading: boolean;
  error: string | null;
}

/**
 * 解析 EPUB 文件，提取各章节 HTML 及样式
 * 仅用于解析，不做渲染
 *
 * @param bookId  书籍 ID（用于服务器代理回退）
 * @param url     OSS 直链（优先直接下载，避免服务器中转）
 */
export function useEpubContent(bookId: string, url?: string): EpubContentResult {
  const [chapters, setChapters] = useState<ChapterData[]>([]);
  const [styles, setStyles] = useState('');
  const [metadata, setMetadata] = useState({ title: '', author: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bookRef = useRef<Book | null>(null);
  const blobUrlsRef = useRef<string[]>([]);

  const cleanup = useCallback(() => {
    // 释放 blob URLs
    blobUrlsRef.current.forEach((url) => {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    });
    blobUrlsRef.current = [];
    bookRef.current?.destroy();
    bookRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function parse() {
      setIsLoading(true);
      setError(null);

      try {
        // 1. 获取 EPUB 二进制数据
        // 优先直接从 OSS 下载（跳过服务器中转），CORS 失败时回退到服务器代理
        let data: ArrayBuffer;
        if (url) {
          try {
            const directRes = await fetch(url);
            if (!directRes.ok) throw new Error(`直链下载失败: ${directRes.status}`);
            data = await directRes.arrayBuffer();
          } catch {
            // CORS 或网络错误 → 回退到服务器代理
            console.warn('[EPUB] 直链下载失败，回退到服务器代理');
            const proxyRes = await fetch(`/api/library/file?id=${bookId}`);
            if (!proxyRes.ok) throw new Error(`加载失败: ${proxyRes.status}`);
            data = await proxyRes.arrayBuffer();
          }
        } else {
          const res = await fetch(`/api/library/file?id=${bookId}`);
          if (!res.ok) throw new Error(`加载失败: ${res.status}`);
          data = await res.arrayBuffer();
        }
        if (cancelled) return;

        // 2. 用 epubjs 解析
        const book = ePub(data as unknown as string);
        bookRef.current = book;
        await book.ready;
        if (cancelled) return;

        // 3. 提取 metadata
        const meta = book.packaging?.metadata;
        const bookMeta = {
          title: meta?.title || '',
          author: meta?.creator || '',
        };

        // 4. 替换资源 URL 为 blob URLs（图片、字体等）
        await book.resources.replacements();
        if (cancelled) return;

        // 5. 构建资源查找表（比 book.resources.get() 更健壮）
        const resourceMap = buildResourceMap(book);
        console.log(`[EPUB] 资源表: ${resourceMap.size} 条记录`);

        // 6. 提取各章节 HTML
        const spineItems: { index: number; href: string }[] = [];
        book.spine.each((section: { index: number; href: string }) => {
          spineItems.push({ index: section.index, href: section.href });
        });

        const extractedChapters: ChapterData[] = [];
        const cssSet = new Set<string>();
        let imagesMissed = 0;
        let imagesReplaced = 0;

        for (const item of spineItems) {
          if (cancelled) return;
          const section = book.spine.get(item.href);
          if (!section) continue;

          try {
            // section.load 返回 <html> Element（不是 Document）
            const doc = await section.load(book.load.bind(book));
            if (cancelled) return;

            if (doc) {
              // 提取 CSS（内联 <style> 标签）
              const styleEls = doc.querySelectorAll('style');
              styleEls.forEach((el: Element) => {
                if (el.textContent) cssSet.add(el.textContent);
              });

              // 提取 <link rel="stylesheet"> 的 CSS
              const linkEls = doc.querySelectorAll('link[rel="stylesheet"]');
              for (const link of Array.from(linkEls)) {
                const href = link.getAttribute('href');
                if (href) {
                  try {
                    const cssUrl = lookupBlobUrl(href, item.href, resourceMap);
                    if (cssUrl) {
                      const cssRes = await fetch(cssUrl);
                      if (cssRes.ok) {
                        const cssText = await cssRes.text();
                        cssSet.add(cssText);
                      }
                    }
                  } catch { /* 忽略 CSS 加载失败 */ }
                }
              }

              // 处理 body 内容
              const body = doc.querySelector('body') || doc;
              if (body) {
                // 替换 img src 为 blob URL
                const images = body.querySelectorAll('img');
                for (const img of Array.from(images)) {
                  const src = img.getAttribute('src');
                  if (src && !src.startsWith('blob:') && !src.startsWith('data:')) {
                    const blobUrl = lookupBlobUrl(src, item.href, resourceMap);
                    if (blobUrl) {
                      img.setAttribute('src', blobUrl);
                      blobUrlsRef.current.push(blobUrl);
                      imagesReplaced++;
                    } else {
                      // 尝试从 archive 直接创建 blob URL
                      try {
                        const resolvedPath = resolveEpubUrl(src, item.href);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const archive = (book as any).archive;
                        if (archive?.createUrl) {
                          const archiveUrl = await archive.createUrl(resolvedPath);
                          if (archiveUrl) {
                            img.setAttribute('src', archiveUrl);
                            blobUrlsRef.current.push(archiveUrl);
                            // 缓存到 map 方便后续查找
                            resourceMap.set(resolvedPath, archiveUrl);
                            imagesReplaced++;
                            continue;
                          }
                        }
                      } catch { /* ignore */ }
                      imagesMissed++;
                      // 移除无法加载的图片，避免显示破损图标
                      img.removeAttribute('src');
                      img.setAttribute('alt', '');
                      img.setAttribute('style', 'display:none');
                    }
                  }
                }

                // 替换 image xlink:href (SVG)
                const svgImages = body.querySelectorAll('image');
                for (const img of Array.from(svgImages)) {
                  const href = img.getAttribute('xlink:href') || img.getAttribute('href');
                  if (href && !href.startsWith('blob:') && !href.startsWith('data:')) {
                    const blobUrl = lookupBlobUrl(href, item.href, resourceMap);
                    if (blobUrl) {
                      img.setAttribute('xlink:href', blobUrl);
                      img.setAttribute('href', blobUrl);
                      blobUrlsRef.current.push(blobUrl);
                    }
                  }
                }

                const html = 'innerHTML' in body ? body.innerHTML : body.documentElement?.innerHTML ?? '';
                if (html && html.trim().length > 0) {
                  extractedChapters.push({
                    html,
                    id: item.href,
                  });
                }
              }
            }
          } catch (err) {
            console.warn(`Failed to load section ${item.href}:`, err);
          }
        }

        if (cancelled) return;

        // 7. 合并所有 CSS
        const combinedCss = Array.from(cssSet).join('\n');

        console.log(
          `[EPUB] 解析完成: ${extractedChapters.length} 章节, ${cssSet.size} 个样式表, ` +
          `图片 ${imagesReplaced} 成功 / ${imagesMissed} 未找到`
        );

        setChapters(extractedChapters);
        setStyles(combinedCss);
        setMetadata(bookMeta);
        setIsLoading(false);
      } catch (err) {
        console.error('EPUB parsing failed:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '解析 EPUB 失败');
          setIsLoading(false);
        }
      }
    }

    parse();

    return () => {
      cancelled = true;
      cleanup();
    };
  // url 不加入依赖：它是 OSS 直链，整个生命周期不会变；
  // 如果加入，引用变化会导致 EPUB 重新下载和解析
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, cleanup]);

  return { chapters, styles, metadata, isLoading, error };
}

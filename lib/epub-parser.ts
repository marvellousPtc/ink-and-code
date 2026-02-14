/**
 * 服务端 EPUB 解析器
 *
 * 将 EPUB（ZIP 格式）解析为章节 HTML，提取图片上传到 OSS 并替换 URL。
 * 解析结果存储到数据库，前端按需加载（滑动窗口），不再一次性加载全部章节到前端内存。
 *
 * 原理：
 * 1. EPUB 本质是 ZIP，包含 OPF 元数据和 XHTML/CSS/图片资源
 * 2. OPF 中的 spine 定义了阅读顺序（哪些 HTML 文件按什么顺序阅读）
 * 3. 解析每个章节 HTML，提取图片和 CSS，图片上传到 OSS 后替换 URL
 * 4. 返回结构化的章节数据，存入 BookChapter 表
 */

import { inflateRawSync } from 'zlib';
import type OSS from 'ali-oss';

// ---- 公共类型 ----

export interface ParsedChapter {
  index: number;
  href: string;
  html: string;
  charLength: number;
  charOffset: number;
}

export interface EpubParseResult {
  chapters: ParsedChapter[];
  styles: string;
  totalCharacters: number;
}

export interface OssConfig {
  dir: string;
  domain?: string;
  bucket: string;
  region: string;
}

export interface LocalStorageOptions {
  uploadToLocal: (buffer: Buffer, relativePath: string) => Promise<string>;
  userId: string;
}

// ---- ZIP 解析（复用 epub-cover.ts 的逻辑） ----

function readZipEntries(zipBuffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();

  let eocdOffset = -1;
  for (let i = zipBuffer.length - 22; i >= 0; i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return entries;

  const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  const cdEntries = zipBuffer.readUInt16LE(eocdOffset + 10);

  let offset = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (offset + 46 > zipBuffer.length) break;
    if (zipBuffer.readUInt32LE(offset) !== 0x02014b50) break;

    const compressionMethod = zipBuffer.readUInt16LE(offset + 10);
    const compressedSize = zipBuffer.readUInt32LE(offset + 20);
    const fileNameLen = zipBuffer.readUInt16LE(offset + 28);
    const extraLen = zipBuffer.readUInt16LE(offset + 30);
    const commentLen = zipBuffer.readUInt16LE(offset + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(offset + 42);

    const fileName = zipBuffer.subarray(offset + 46, offset + 46 + fileNameLen).toString('utf-8');

    if (!fileName.endsWith('/')) {
      const localOffset = localHeaderOffset;
      if (localOffset + 30 <= zipBuffer.length && zipBuffer.readUInt32LE(localOffset) === 0x04034b50) {
        const localFileNameLen = zipBuffer.readUInt16LE(localOffset + 26);
        const localExtraLen = zipBuffer.readUInt16LE(localOffset + 28);
        const dataOffset = localOffset + 30 + localFileNameLen + localExtraLen;

        if (dataOffset + compressedSize <= zipBuffer.length) {
          const compressedData = zipBuffer.subarray(dataOffset, dataOffset + compressedSize);

          if (compressionMethod === 0) {
            entries.set(fileName, Buffer.from(compressedData));
          } else if (compressionMethod === 8) {
            try {
              const decompressed = inflateRawSync(compressedData);
              entries.set(fileName, decompressed);
            } catch { /* 解压失败，跳过 */ }
          }
        }
      }
    }

    offset += 46 + fileNameLen + extraLen + commentLen;
  }

  return entries;
}

// ---- 路径工具 ----

/** 将相对路径解析为 EPUB 根路径 */
function resolveEpubPath(src: string, baseHref: string): string {
  if (!src || src.startsWith('data:') || src.startsWith('http:') || src.startsWith('https:')) {
    return src;
  }
  try {
    const base = new URL(baseHref, 'https://epub.local/');
    const resolved = new URL(src, base);
    return resolved.pathname.slice(1); // 去掉开头 /
  } catch {
    return src;
  }
}

/** 获取 MIME 类型 */
function getMimeType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.css')) return 'text/css';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.ttf')) return 'font/ttf';
  if (lower.endsWith('.otf')) return 'font/otf';
  return 'application/octet-stream';
}

/** 构建 OSS 的公开 URL */
function buildOssUrl(objectName: string, config: OssConfig): string {
  if (config.domain) {
    const domain = config.domain.replace(/\/$/, '');
    return `${domain}/${objectName}`;
  }
  const region = config.region.replace(/^oss-/, '');
  return `https://${config.bucket}.oss-${region}.aliyuncs.com/${objectName}`;
}

// ---- OPF 解析 ----

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
}

interface SpineItem {
  idref: string;
  linear: boolean;
}

function parseOpf(opfContent: string) {
  // 解析 manifest
  const manifestItems: ManifestItem[] = [];
  const manifestRegex = /<item\s+([^>]+)\/?\s*>/gi;
  let match;
  while ((match = manifestRegex.exec(opfContent)) !== null) {
    const attrs = match[1];
    const id = attrs.match(/id\s*=\s*"([^"]+)"/i)?.[1] || '';
    const href = attrs.match(/href\s*=\s*"([^"]+)"/i)?.[1] || '';
    const mediaType = attrs.match(/media-type\s*=\s*"([^"]+)"/i)?.[1] || '';
    if (id && href) {
      manifestItems.push({ id, href: decodeURIComponent(href), mediaType });
    }
  }

  // 解析 spine
  const spineItems: SpineItem[] = [];
  const spineRegex = /<itemref\s+([^>]+)\/?\s*>/gi;
  while ((match = spineRegex.exec(opfContent)) !== null) {
    const attrs = match[1];
    const idref = attrs.match(/idref\s*=\s*"([^"]+)"/i)?.[1] || '';
    const linear = attrs.match(/linear\s*=\s*"no"/i) ? false : true;
    if (idref) {
      spineItems.push({ idref, linear });
    }
  }

  return { manifestItems, spineItems };
}

// ---- 核心解析函数 ----

/**
 * 解析 EPUB 文件，提取章节 HTML 和样式
 *
 * @param epubBuffer EPUB 文件的 Buffer
 * @param bookId     书籍 ID（用于 OSS 路径命名空间）
 * @param ossClient  ali-oss 客户端实例（用于上传图片）
 * @param ossConfig  OSS 配置（用于构建公开 URL）
 */
export async function parseEpubContent(
  epubBuffer: Buffer,
  bookId: string,
  ossClient: OSS | null,
  ossConfig: OssConfig,
  localOptions?: LocalStorageOptions,
): Promise<EpubParseResult> {
  const entries = readZipEntries(epubBuffer);

  // 判断存储类型
  const isLocalStorage = !ossClient || localOptions !== undefined;

  // 1. 找 OPF 文件
  const containerXml = entries.get('META-INF/container.xml');
  if (!containerXml) throw new Error('无效的 EPUB：找不到 META-INF/container.xml');

  const containerStr = containerXml.toString('utf-8');
  const opfPathMatch = containerStr.match(/full-path="([^"]+\.opf)"/i);
  if (!opfPathMatch) throw new Error('无效的 EPUB：找不到 OPF 文件路径');

  const opfPath = opfPathMatch[1];
  const opfBuffer = entries.get(opfPath);
  if (!opfBuffer) throw new Error(`无效的 EPUB：OPF 文件不存在: ${opfPath}`);

  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
  const opfStr = opfBuffer.toString('utf-8');

  // 2. 解析 OPF
  const { manifestItems, spineItems } = parseOpf(opfStr);
  const manifestMap = new Map(manifestItems.map(item => [item.id, item]));

  // 3. 图片上传缓存（同一张图片只上传一次）
  const imageUrlCache = new Map<string, string>();

  /** 查找 ZIP 中的资源，尝试多种路径 */
  const findEntry = (resolvedPath: string, originalSrc: string): Buffer | undefined => {
    return entries.get(resolvedPath)
      || entries.get(originalSrc)
      || entries.get(originalSrc.replace(/^\.\//, ''))
      || entries.get(decodeURIComponent(resolvedPath));
  };

  /** 上传图片，返回公开 URL（支持 OSS 或本地存储） */
  const uploadImage = async (imagePath: string, imageData: Buffer): Promise<string> => {
    if (imageUrlCache.has(imagePath)) return imageUrlCache.get(imagePath)!;

    const ext = imagePath.split('.').pop()?.toLowerCase() || 'bin';
    const safeFileName = imagePath.replace(/[^a-zA-Z0-9._-]/g, '_');
    const relativePath = `uploads/${localOptions?.userId || bookId}/epub-assets/${safeFileName}`;
    const contentType = getMimeType(imagePath);

    try {
      if (isLocalStorage && localOptions) {
        // 本地存储
        const url = await localOptions.uploadToLocal(imageData, relativePath);
        imageUrlCache.set(imagePath, url);
        return url;
      } else if (ossClient && !isLocalStorage) {
        // OSS 存储
        const objectName = `${ossConfig.dir}/epub-assets/${bookId}/${safeFileName}`;
        await ossClient.put(objectName, imageData, {
          headers: { 'Content-Type': contentType },
        });
        const url = buildOssUrl(objectName, ossConfig);
        imageUrlCache.set(imagePath, url);
        return url;
      } else {
        // 没有配置任何存储，返回空字符串
        console.warn(`[EPUB Parser] 未配置存储后端，图片将被隐藏: ${imagePath}`);
        return '';
      }
    } catch (err) {
      console.warn(`[EPUB Parser] 图片上传失败 ${imagePath}:`, err);
      return ''; // 上传失败返回空，后续会移除该图片
    }
  };

  /**
   * 处理 HTML 中的图片引用：
   * 1. 找到所有 <img src="..."> 和 <image href="...">
   * 2. 从 ZIP 中读取图片数据
   * 3. 上传到 OSS
   * 4. 替换 HTML 中的路径
   */
  const processImages = async (html: string, chapterHref: string): Promise<string> => {
    let result = html;

    // 处理 <img src="...">
    const imgRegex = /<img\s+([^>]*?)src\s*=\s*"([^"]+)"([^>]*?)>/gi;
    const imgMatches = Array.from(html.matchAll(imgRegex));

    for (const m of imgMatches) {
      const src = m[2];
      if (src.startsWith('data:') || src.startsWith('http:') || src.startsWith('https:')) continue;

      const resolvedPath = resolveEpubPath(src, chapterHref);
      const imageData = findEntry(resolvedPath, src);

      if (imageData && imageData.length > 0) {
        const ossUrl = await uploadImage(resolvedPath, imageData);
        if (ossUrl) {
          result = result.replace(m[0], m[0].replace(src, ossUrl));
        } else {
          // 上传失败，隐藏图片
          result = result.replace(m[0], '<img alt="" style="display:none">');
        }
      } else {
        // 找不到图片，隐藏
        result = result.replace(m[0], '<img alt="" style="display:none">');
      }
    }

    // 处理 SVG <image xlink:href="..."> 和 <image href="...">
    const svgImgRegex = /<image\s+([^>]*?)(?:xlink:href|href)\s*=\s*"([^"]+)"([^>]*?)>/gi;
    const svgMatches = Array.from(result.matchAll(svgImgRegex));

    for (const m of svgMatches) {
      const href = m[2];
      if (href.startsWith('data:') || href.startsWith('http:') || href.startsWith('https:')) continue;

      const resolvedPath = resolveEpubPath(href, chapterHref);
      const imageData = findEntry(resolvedPath, href);

      if (imageData && imageData.length > 0) {
        const ossUrl = await uploadImage(resolvedPath, imageData);
        if (ossUrl) {
          result = result.replace(m[0], m[0].replace(href, ossUrl));
        }
      }
    }

    return result;
  };

  // 4. 提取 CSS
  const cssSet = new Set<string>();

  /** 从 HTML 中提取内联 <style> 和 <link> 引用的 CSS */
  const extractCss = (html: string, chapterHref: string) => {
    // 内联 <style>
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let m;
    while ((m = styleRegex.exec(html)) !== null) {
      if (m[1].trim()) cssSet.add(m[1]);
    }

    // <link rel="stylesheet" href="...">
    const linkRegex = /<link[^>]+rel\s*=\s*"stylesheet"[^>]+href\s*=\s*"([^"]+)"[^>]*>/gi;
    while ((m = linkRegex.exec(html)) !== null) {
      const href = m[1];
      const resolvedPath = resolveEpubPath(href, chapterHref);
      const cssData = findEntry(resolvedPath, href);
      if (cssData) {
        cssSet.add(cssData.toString('utf-8'));
      }
    }
    // 也匹配 href 在 rel 前面的情况
    const linkRegex2 = /<link[^>]+href\s*=\s*"([^"]+)"[^>]+rel\s*=\s*"stylesheet"[^>]*>/gi;
    while ((m = linkRegex2.exec(html)) !== null) {
      const href = m[1];
      const resolvedPath = resolveEpubPath(href, chapterHref);
      const cssData = findEntry(resolvedPath, href);
      if (cssData) {
        cssSet.add(cssData.toString('utf-8'));
      }
    }
  };

  /** 从 HTML 中提取 body 内容 */
  const extractBody = (html: string): string => {
    // 尝试匹配 <body> 标签
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) return bodyMatch[1].trim();

    // 没有 body 标签，去除 html/head
    let result = html;
    result = result.replace(/<\?xml[^>]*\?>/gi, '');
    result = result.replace(/<!DOCTYPE[^>]*>/gi, '');
    result = result.replace(/<html[^>]*>/gi, '');
    result = result.replace(/<\/html>/gi, '');
    result = result.replace(/<head>[\s\S]*?<\/head>/gi, '');

    return result.trim();
  };

  /** 去除 HTML 标签，只保留纯文本 */
  const stripHtml = (html: string): string => {
    return html.replace(/<[^>]*>/g, '');
  };

  // 5. 遍历 spine，提取各章节
  const chapters: ParsedChapter[] = [];
  let cumulativeCharOffset = 0;

  for (let i = 0; i < spineItems.length; i++) {
    const spineItem = spineItems[i];
    const manifestItem = manifestMap.get(spineItem.idref);
    if (!manifestItem) continue;

    // 构建完整路径（相对于 EPUB 根目录）
    const chapterHref = manifestItem.href.startsWith('/')
      ? manifestItem.href.slice(1)
      : `${opfDir}${manifestItem.href}`;

    const htmlBuffer = entries.get(chapterHref) || entries.get(manifestItem.href);
    if (!htmlBuffer) {
      console.warn(`[EPUB Parser] 章节不存在: ${chapterHref}`);
      continue;
    }

    let htmlStr = htmlBuffer.toString('utf-8');

    // 提取 CSS（在提取 body 之前，因为 CSS 可能在 head 中）
    extractCss(htmlStr, chapterHref);

    // 提取 body 内容
    let bodyHtml = extractBody(htmlStr);

    // 跳过空章节
    const textContent = stripHtml(bodyHtml).trim();
    if (!textContent) continue;

    // 处理图片（上传到 OSS 并替换 URL）
    bodyHtml = await processImages(bodyHtml, chapterHref);

    const charLength = textContent.length;

    chapters.push({
      index: chapters.length,
      href: manifestItem.href,
      html: bodyHtml,
      charLength,
      charOffset: cumulativeCharOffset,
    });

    cumulativeCharOffset += charLength;
  }

  // 6. 合并 CSS
  const combinedStyles = Array.from(cssSet).join('\n');

  console.log(
    `[EPUB Parser] 解析完成: ${chapters.length} 章节, ${cumulativeCharOffset} 字符, ` +
    `${imageUrlCache.size} 张图片, ${cssSet.size} 个样式表`
  );

  return {
    chapters,
    styles: combinedStyles,
    totalCharacters: cumulativeCharOffset,
  };
}

/**
 * 不带 OSS 的轻量解析（用于没有 OSS 配置的场景）
 * 图片转为 base64 内联
 */
export async function parseEpubContentWithoutOss(
  epubBuffer: Buffer,
): Promise<EpubParseResult> {
  const entries = readZipEntries(epubBuffer);

  // 1. 找 OPF 文件
  const containerXml = entries.get('META-INF/container.xml');
  if (!containerXml) throw new Error('无效的 EPUB：找不到 META-INF/container.xml');

  const containerStr = containerXml.toString('utf-8');
  const opfPathMatch = containerStr.match(/full-path="([^"]+\.opf)"/i);
  if (!opfPathMatch) throw new Error('无效的 EPUB：找不到 OPF 文件路径');

  const opfPath = opfPathMatch[1];
  const opfBuffer = entries.get(opfPath);
  if (!opfBuffer) throw new Error(`无效的 EPUB：OPF 文件不存在: ${opfPath}`);

  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
  const opfStr = opfBuffer.toString('utf-8');

  const { manifestItems, spineItems } = parseOpf(opfStr);
  const manifestMap = new Map(manifestItems.map(item => [item.id, item]));

  const findEntry = (resolvedPath: string, originalSrc: string): Buffer | undefined => {
    return entries.get(resolvedPath)
      || entries.get(originalSrc)
      || entries.get(originalSrc.replace(/^\.\//, ''))
      || entries.get(decodeURIComponent(resolvedPath));
  };

  // 图片转 base64
  const processImagesBase64 = (html: string, chapterHref: string): string => {
    let result = html;

    const imgRegex = /<img\s+([^>]*?)src\s*=\s*"([^"]+)"([^>]*?)>/gi;
    const imgMatches = Array.from(html.matchAll(imgRegex));

    for (const m of imgMatches) {
      const src = m[2];
      if (src.startsWith('data:') || src.startsWith('http:') || src.startsWith('https:')) continue;

      const resolvedPath = resolveEpubPath(src, chapterHref);
      const imageData = findEntry(resolvedPath, src);

      if (imageData && imageData.length > 0) {
        const mime = getMimeType(resolvedPath);
        const base64 = imageData.toString('base64');
        const dataUrl = `data:${mime};base64,${base64}`;
        result = result.replace(m[0], m[0].replace(src, dataUrl));
      } else {
        result = result.replace(m[0], '<img alt="" style="display:none">');
      }
    }

    return result;
  };

  const cssSet = new Set<string>();

  const extractCss = (html: string, chapterHref: string) => {
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let m;
    while ((m = styleRegex.exec(html)) !== null) {
      if (m[1].trim()) cssSet.add(m[1]);
    }

    const linkRegex = /<link[^>]+rel\s*=\s*"stylesheet"[^>]+href\s*=\s*"([^"]+)"[^>]*>/gi;
    while ((m = linkRegex.exec(html)) !== null) {
      const href = m[1];
      const resolvedPath = resolveEpubPath(href, chapterHref);
      const cssData = findEntry(resolvedPath, href);
      if (cssData) cssSet.add(cssData.toString('utf-8'));
    }
    const linkRegex2 = /<link[^>]+href\s*=\s*"([^"]+)"[^>]+rel\s*=\s*"stylesheet"[^>]*>/gi;
    while ((m = linkRegex2.exec(html)) !== null) {
      const href = m[1];
      const resolvedPath = resolveEpubPath(href, chapterHref);
      const cssData = findEntry(resolvedPath, href);
      if (cssData) cssSet.add(cssData.toString('utf-8'));
    }
  };

  const extractBody = (html: string): string => {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) return bodyMatch[1].trim();
    let result = html;
    result = result.replace(/<\?xml[^>]*\?>/gi, '');
    result = result.replace(/<!DOCTYPE[^>]*>/gi, '');
    result = result.replace(/<html[^>]*>/gi, '');
    result = result.replace(/<\/html>/gi, '');
    result = result.replace(/<head>[\s\S]*?<\/head>/gi, '');
    return result.trim();
  };

  const stripHtml = (html: string): string => html.replace(/<[^>]*>/g, '');

  const chapters: ParsedChapter[] = [];
  let cumulativeCharOffset = 0;

  for (let i = 0; i < spineItems.length; i++) {
    const spineItem = spineItems[i];
    const manifestItem = manifestMap.get(spineItem.idref);
    if (!manifestItem) continue;

    const chapterHref = manifestItem.href.startsWith('/')
      ? manifestItem.href.slice(1)
      : `${opfDir}${manifestItem.href}`;

    const htmlBuffer = entries.get(chapterHref) || entries.get(manifestItem.href);
    if (!htmlBuffer) continue;

    let htmlStr = htmlBuffer.toString('utf-8');
    extractCss(htmlStr, chapterHref);
    let bodyHtml = extractBody(htmlStr);

    const textContent = stripHtml(bodyHtml).trim();
    if (!textContent) continue;

    bodyHtml = processImagesBase64(bodyHtml, chapterHref);
    const charLength = textContent.length;

    chapters.push({
      index: chapters.length,
      href: manifestItem.href,
      html: bodyHtml,
      charLength,
      charOffset: cumulativeCharOffset,
    });

    cumulativeCharOffset += charLength;
  }

  const combinedStyles = Array.from(cssSet).join('\n');

  return {
    chapters,
    styles: combinedStyles,
    totalCharacters: cumulativeCharOffset,
  };
}

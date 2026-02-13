/**
 * 阅读锚点系统
 *
 * 进度 = 内容位置（锚点），不是页码。
 * 锚点由 chapterIndex + blockIndex + charOffset + textSnippet 组成，
 * 在任何设备、任何字体、任何排版设置下都能精确定位。
 *
 * 页面 = 当前设备 + 字体 + 容器的渲染结果（纯前端行为）。
 */

// ---- 类型 ----

/** 阅读锚点：设备无关的内容位置 */
export interface ReadingAnchor {
  /** 章节索引 */
  chapterIndex: number;
  /** 块级元素在章节内的序号（0-indexed） */
  blockIndex: number;
  /** 块内字符偏移 */
  charOffset: number;
  /** 文本片段（用于内容变更时的模糊匹配 fallback） */
  textSnippet: string;
}

/** 章节内单个块级元素在分页中的位置 */
export interface BlockPosition {
  /** 块在章节内的序号 */
  blockIndex: number;
  /** 所在章内页码 */
  pageInChapter: number;
  /** 块在章节纯文本中的累积字符偏移 */
  textOffset: number;
  /** 块的纯文本长度 */
  textLength: number;
  /** 前 20 个字符（用于 snippet 匹配） */
  snippet: string;
}

/** 一个章节的块位置映射 */
export interface ChapterBlockMap {
  chapterIndex: number;
  blocks: BlockPosition[];
}

// ---- 序列化 / 反序列化 ----

/**
 * 锚点 → 存储字符串
 * 格式：anchor:chapterIndex:blockIndex:charOffset|snippet:text
 * 向后兼容：同时输出旧的 char: 字段供降级使用
 */
export function serializeAnchor(
  anchor: ReadingAnchor,
  /** 旧格式的全局字符偏移（用于向后兼容） */
  globalCharOffset?: number,
): string {
  const parts: string[] = [];
  parts.push(`anchor:${anchor.chapterIndex}:${anchor.blockIndex}:${anchor.charOffset}`);
  if (anchor.textSnippet) {
    // snippet 中的 | 替换为空格，避免分隔符冲突
    parts.push(`snippet:${anchor.textSnippet.replace(/\|/g, ' ')}`);
  }
  // 向后兼容：附带旧格式的字符偏移，旧客户端仍可使用
  if (globalCharOffset !== undefined && globalCharOffset > 0) {
    parts.push(`char:${globalCharOffset}`);
  }
  return parts.join('|');
}

/**
 * 存储字符串 → 锚点（支持新旧两种格式）
 *
 * 新格式：anchor:3:12:45|snippet:这是一段文字|char:25000
 * 旧格式：char:25000|page:50|fp:16_1.8_system_376_527
 */
export function deserializeAnchor(loc?: string): {
  anchor: ReadingAnchor | null;
  /** 旧格式的字符偏移（fallback） */
  charOffset: number;
  /** 旧格式的页码（fallback） */
  pageNumber: number;
  /** 旧格式的设置指纹（fallback） */
  settingsFingerprint: string;
} {
  const fallback = { anchor: null, charOffset: 0, pageNumber: -1, settingsFingerprint: '' };
  if (!loc) return fallback;

  let anchor: ReadingAnchor | null = null;
  let charOffset = 0;
  let pageNumber = -1;
  let settingsFingerprint = '';

  for (const part of loc.split('|')) {
    if (part.startsWith('anchor:')) {
      // anchor:chapterIndex:blockIndex:charOffset
      const segs = part.slice(7).split(':');
      if (segs.length >= 3) {
        const ci = parseInt(segs[0], 10);
        const bi = parseInt(segs[1], 10);
        const co = parseInt(segs[2], 10);
        if (!isNaN(ci) && !isNaN(bi) && !isNaN(co)) {
          anchor = { chapterIndex: ci, blockIndex: bi, charOffset: co, textSnippet: '' };
        }
      }
    } else if (part.startsWith('snippet:')) {
      if (anchor) anchor.textSnippet = part.slice(8);
    } else if (part.startsWith('char:')) {
      const n = parseInt(part.slice(5), 10);
      if (!isNaN(n) && n >= 0) charOffset = n;
    } else if (part.startsWith('page:')) {
      const n = parseInt(part.slice(5), 10);
      if (!isNaN(n) && n >= 0) pageNumber = n;
    } else if (part.startsWith('fp:')) {
      settingsFingerprint = part.slice(3);
    }
  }

  return { anchor, charOffset, pageNumber, settingsFingerprint };
}

// ---- 块级元素标记 ----

/** 需要标记的块级元素选择器 */
const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, div, blockquote, li, pre, figcaption, dt, dd, section, article';

/**
 * 在分页测量容器中扫描块级元素，构建 blockMap。
 *
 * @param containerEl  已渲染好 CSS columns 的测量容器
 * @param columnWidth  单列宽度（= pageContentWidth）
 * @param chapterIndex 章节索引
 */
export function buildBlockMap(
  containerEl: HTMLElement,
  columnWidth: number,
  chapterIndex: number,
): ChapterBlockMap {
  const blocks: BlockPosition[] = [];
  const elements = containerEl.querySelectorAll(BLOCK_SELECTOR);

  // 为避免嵌套元素重复计数（如 div > p），只取叶子块级元素
  // 如果一个元素内部还有匹配选择器的子元素，跳过它
  const leafElements: Element[] = [];
  elements.forEach(el => {
    if (el.querySelector(BLOCK_SELECTOR) === null) {
      leafElements.push(el);
    }
  });

  // 如果没有任何块级元素，把整个容器当作一个块
  if (leafElements.length === 0) {
    const text = containerEl.textContent || '';
    blocks.push({
      blockIndex: 0,
      pageInChapter: 0,
      textOffset: 0,
      textLength: text.length,
      snippet: text.slice(0, 20),
    });
    return { chapterIndex, blocks };
  }

  // 用 getBoundingClientRect 计算元素所在列（比 offsetLeft 更可靠）
  // offsetLeft 在多列布局中的行为因浏览器而异，getBoundingClientRect 返回实际渲染位置
  const containerRect = containerEl.getBoundingClientRect();
  let cumulativeTextOffset = 0;

  for (let i = 0; i < leafElements.length; i++) {
    const el = leafElements[i] as HTMLElement;
    const text = el.textContent || '';

    // 元素相对于多列容器的水平偏移 → 所在列号（页码）
    const elRect = el.getBoundingClientRect();
    const relativeLeft = elRect.left - containerRect.left;
    const pageInChapter = Math.max(0, Math.floor(relativeLeft / columnWidth));

    blocks.push({
      blockIndex: i,
      pageInChapter,
      textOffset: cumulativeTextOffset,
      textLength: text.length,
      snippet: text.slice(0, 20),
    });

    cumulativeTextOffset += text.length;
  }

  // debug: 输出前几个块的位置信息
  if (blocks.length > 0) {
    const maxPage = blocks.reduce((m, b) => Math.max(m, b.pageInChapter), 0);
    console.log(`[buildBlockMap] ch:${chapterIndex} blocks:${blocks.length} pages:${maxPage + 1} colW:${columnWidth} containerLeft:${Math.round(containerRect.left)}`);
  }

  return { chapterIndex, blocks };
}

// ---- 页码 ↔ 锚点转换 ----

/**
 * 全局页码 → 锚点
 *
 * 返回当前页第一个可见块的锚点位置。
 */
export function pageToAnchor(
  globalPage: number,
  chapterPageRanges: { chapterIndex: number; startPage: number; pageCount: number }[],
  blockMaps: ChapterBlockMap[],
): ReadingAnchor | null {
  // 1. 找到全局页码所在的章节
  const chapterInfo = findChapterForPage(globalPage, chapterPageRanges);
  if (!chapterInfo) return null;

  const { chapterIndex, pageInChapter } = chapterInfo;

  // 2. 找到该章节的 blockMap
  const map = blockMaps.find(m => m.chapterIndex === chapterIndex);
  if (!map || map.blocks.length === 0) {
    // 没有 blockMap（章节未测量），返回章节级粗锚点
    return { chapterIndex, blockIndex: 0, charOffset: 0, textSnippet: '' };
  }

  // 3. 找到该页上第一个块
  let targetBlock: BlockPosition | null = null;
  for (const block of map.blocks) {
    if (block.pageInChapter === pageInChapter) {
      targetBlock = block;
      break;
    }
  }

  // 如果没找到精确匹配，取最近的前一个块
  if (!targetBlock) {
    for (let i = map.blocks.length - 1; i >= 0; i--) {
      if (map.blocks[i].pageInChapter <= pageInChapter) {
        targetBlock = map.blocks[i];
        break;
      }
    }
  }

  if (!targetBlock) targetBlock = map.blocks[0];

  return {
    chapterIndex,
    blockIndex: targetBlock.blockIndex,
    charOffset: 0,
    textSnippet: targetBlock.snippet,
  };
}

/**
 * 锚点 → 全局页码
 *
 * 查找包含指定锚点的页码。支持精确匹配和模糊匹配（snippet fallback）。
 */
export function anchorToPage(
  anchor: ReadingAnchor,
  chapterPageRanges: { chapterIndex: number; startPage: number; pageCount: number }[],
  blockMaps: ChapterBlockMap[],
): number {
  // 1. 找到章节
  const range = chapterPageRanges.find(r => r.chapterIndex === anchor.chapterIndex);
  if (!range) return 0;

  // 2. 找到 blockMap
  const map = blockMaps.find(m => m.chapterIndex === anchor.chapterIndex);
  if (!map || map.blocks.length === 0) return range.startPage;

  // 3. 精确匹配：按 blockIndex
  let block = map.blocks.find(b => b.blockIndex === anchor.blockIndex);

  // 4. 模糊匹配：如果精确匹配失败（内容变更导致块序号偏移），用 snippet
  if (!block && anchor.textSnippet) {
    block = map.blocks.find(b => b.snippet === anchor.textSnippet);
    // 更宽松：snippet 包含匹配
    if (!block) {
      block = map.blocks.find(b =>
        b.snippet.includes(anchor.textSnippet.slice(0, 10)) ||
        anchor.textSnippet.includes(b.snippet.slice(0, 10)),
      );
    }
  }

  // 5. 终极 fallback：按字符偏移比例定位
  if (!block) {
    const totalChars = map.blocks.reduce((sum, b) => sum + b.textLength, 0);
    if (totalChars > 0 && anchor.charOffset > 0) {
      // 找到累积偏移最接近的块
      for (let i = map.blocks.length - 1; i >= 0; i--) {
        if (map.blocks[i].textOffset <= anchor.charOffset) {
          block = map.blocks[i];
          break;
        }
      }
    }
  }

  if (!block) {
    console.log('[anchorToPage] no block found → fallback to range.startPage:', range.startPage, 'anchor:', anchor);
    return range.startPage;
  }

  const result = range.startPage + block.pageInChapter;
  console.log('[anchorToPage] ch:', anchor.chapterIndex, 'blk:', anchor.blockIndex,
    '→ range.startPage:', range.startPage, 'pageInChapter:', block.pageInChapter,
    '= globalPage:', result, 'snippet:', block.snippet);
  return result;
}

// ---- 内部辅助 ----

function findChapterForPage(
  page: number,
  ranges: { chapterIndex: number; startPage: number; pageCount: number }[],
): { chapterIndex: number; pageInChapter: number } | null {
  let lo = 0, hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const r = ranges[mid];
    if (page < r.startPage) hi = mid - 1;
    else if (page >= r.startPage + r.pageCount) lo = mid + 1;
    else return { chapterIndex: r.chapterIndex, pageInChapter: page - r.startPage };
  }
  return null;
}

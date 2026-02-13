/**
 * 高亮锚点系统
 *
 * 负责：
 * 1. DOM Selection → 高亮锚点（selectionToHighlightAnchor）
 * 2. 锚点序列化/反序列化
 * 3. 将高亮注入 chapter HTML（injectHighlightsIntoHtml）
 */

// 复用阅读锚点中的块级元素选择器
const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, div, blockquote, li, pre, figcaption, dt, dd, section, article';

// ---- 类型 ----

export interface HighlightAnchor {
  chapterIndex: number;
  startBlockIndex: number;
  startCharOffset: number;
  endBlockIndex: number;
  endCharOffset: number;
  text: string;
}

export interface HighlightData {
  id: string;
  chapterIndex: number;
  startBlockIndex: number;
  startCharOffset: number;
  endBlockIndex: number;
  endCharOffset: number;
  text: string;
  color: string;
  note: string | null;
}

// ---- 序列化 ----

export function serializeHighlightLoc(anchor: HighlightAnchor): string {
  const parts: string[] = [];
  parts.push(`hl:${anchor.chapterIndex}:${anchor.startBlockIndex}:${anchor.startCharOffset}:${anchor.endBlockIndex}:${anchor.endCharOffset}`);
  if (anchor.text) {
    parts.push(`text:${anchor.text.replace(/\|/g, ' ').slice(0, 200)}`);
  }
  return parts.join('|');
}

export function deserializeHighlightLoc(loc: string): HighlightAnchor | null {
  if (!loc) return null;

  let anchor: HighlightAnchor | null = null;

  for (const part of loc.split('|')) {
    if (part.startsWith('hl:')) {
      const segs = part.slice(3).split(':');
      if (segs.length >= 5) {
        const [ci, sb, so, eb, eo] = segs.map(s => parseInt(s, 10));
        if ([ci, sb, so, eb, eo].every(n => !isNaN(n))) {
          anchor = {
            chapterIndex: ci,
            startBlockIndex: sb,
            startCharOffset: so,
            endBlockIndex: eb,
            endCharOffset: eo,
            text: '',
          };
        }
      }
    } else if (part.startsWith('text:') && anchor) {
      anchor.text = part.slice(5);
    }
  }

  return anchor;
}

// ---- DOM Selection → 高亮锚点 ----

/** 获取容器内的叶子块级元素列表（与 buildBlockMap 一致） */
function getLeafBlocks(containerEl: HTMLElement): Element[] {
  const elements = containerEl.querySelectorAll(BLOCK_SELECTOR);
  const leaves: Element[] = [];
  elements.forEach(el => {
    if (el.querySelector(BLOCK_SELECTOR) === null) {
      leaves.push(el);
    }
  });
  return leaves;
}

/** 计算一个 DOM 节点在其所属叶子块内的纯文本字符偏移 */
function getCharOffsetInBlock(blockEl: Element, targetNode: Node, nodeOffset: number): number {
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node === targetNode) {
      return offset + nodeOffset;
    }
    offset += (node.textContent?.length ?? 0);
  }
  // fallback: targetNode 可能是 element node（offset 表示第 N 个子节点）
  // 此时定位到该元素的文本起始处
  return offset;
}

/** 找到包含 node 的叶子块元素及其索引 */
function findBlockForNode(
  leaves: Element[],
  node: Node,
): { blockIndex: number; blockEl: Element } | null {
  // 如果 node 是 text node，取其父元素
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  if (!el) return null;

  for (let i = 0; i < leaves.length; i++) {
    if (leaves[i].contains(el)) {
      return { blockIndex: i, blockEl: leaves[i] };
    }
  }
  return null;
}

/**
 * 将当前浏览器文字选区映射为高亮锚点。
 *
 * @param contentEl  .epub-page-content 元素
 * @param chapterIndex  当前章节索引
 * @returns 高亮锚点，如果选区无效则返回 null
 */
export function selectionToHighlightAnchor(
  contentEl: HTMLElement,
  chapterIndex: number,
): HighlightAnchor | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.anchorNode || !sel.focusNode) return null;

  const text = sel.toString().trim();
  if (!text || text.length === 0) return null;

  // 确保选区在 contentEl 内
  if (!contentEl.contains(sel.anchorNode) || !contentEl.contains(sel.focusNode)) return null;

  const leaves = getLeafBlocks(contentEl);
  if (leaves.length === 0) return null;

  // 确定选区方向（anchor 可能在 focus 之后）
  const range = sel.getRangeAt(0);
  const startNode = range.startContainer;
  const startOffset = range.startOffset;
  const endNode = range.endContainer;
  const endOffset = range.endOffset;

  const startInfo = findBlockForNode(leaves, startNode);
  const endInfo = findBlockForNode(leaves, endNode);
  if (!startInfo || !endInfo) return null;

  const startCharOffset = getCharOffsetInBlock(startInfo.blockEl, startNode, startOffset);
  const endCharOffset = getCharOffsetInBlock(endInfo.blockEl, endNode, endOffset);

  return {
    chapterIndex,
    startBlockIndex: startInfo.blockIndex,
    startCharOffset,
    endBlockIndex: endInfo.blockIndex,
    endCharOffset,
    text,
  };
}

// ---- HTML 注入高亮 ----

/**
 * 将高亮数据注入到章节 HTML 中，返回包含 <mark> 标签的新 HTML。
 *
 * 原理：
 * 1. 用 DOMParser 解析 HTML
 * 2. 找到叶子块级元素
 * 3. 对每个需要高亮的块，遍历其 text nodes，在正确的字符偏移处拆分并包裹 <mark>
 * 4. 用 innerHTML 输出
 */
export function injectHighlightsIntoHtml(
  html: string,
  highlights: HighlightData[],
): string {
  if (!html || highlights.length === 0) return html;

  try {
    const doc = new DOMParser().parseFromString(
      `<div class="_hl_root">${html}</div>`,
      'text/html',
    );
    const root = doc.querySelector('._hl_root');
    if (!root) return html;

    const leaves = getLeafBlocks(root as HTMLElement);
    if (leaves.length === 0) return html;

    // 按块索引分组高亮
    const blockHighlights = new Map<number, { hl: HighlightData; startOff: number; endOff: number }[]>();

    for (const hl of highlights) {
      for (let bi = hl.startBlockIndex; bi <= hl.endBlockIndex && bi < leaves.length; bi++) {
        const startOff = bi === hl.startBlockIndex ? hl.startCharOffset : 0;
        const endOff = bi === hl.endBlockIndex ? hl.endCharOffset : Infinity;
        if (!blockHighlights.has(bi)) blockHighlights.set(bi, []);
        blockHighlights.get(bi)!.push({ hl, startOff, endOff });
      }
    }

    // 对每个块注入 <mark>
    blockHighlights.forEach((hlList, blockIndex) => {
      if (blockIndex >= leaves.length) return;
      const blockEl = leaves[blockIndex];

      // 收集 text nodes
      const textNodes: Text[] = [];
      const walker = doc.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) textNodes.push(n as Text);

      // 对每个高亮，按字符偏移标记
      for (const { hl, startOff, endOff } of hlList) {
        applyHighlightToTextNodes(doc, textNodes, startOff, endOff, hl.id, hl.color);
      }
    });

    return root.innerHTML;
  } catch (e) {
    console.error('[highlight-anchor] injectHighlightsIntoHtml failed:', e);
    return html;
  }
}

/**
 * 在一组 text nodes 中标记 [startOff, endOff) 范围的文字。
 * 通过拆分 text nodes 并包裹 <mark> 实现。
 */
function applyHighlightToTextNodes(
  doc: Document,
  textNodes: Text[],
  startOff: number,
  endOff: number,
  highlightId: string,
  color: string,
): void {
  let currentOffset = 0;

  for (let i = 0; i < textNodes.length; i++) {
    const tn = textNodes[i];
    const len = tn.textContent?.length ?? 0;
    const nodeStart = currentOffset;
    const nodeEnd = currentOffset + len;

    // 该 text node 与高亮范围有交集
    if (nodeEnd > startOff && nodeStart < endOff) {
      const hlStart = Math.max(0, startOff - nodeStart);
      const hlEnd = Math.min(len, endOff - nodeStart);

      // 不需要高亮整个 node 以外的部分
      if (hlStart === 0 && hlEnd === len) {
        // 整个 text node 都在高亮范围内，直接包裹
        wrapTextNode(doc, tn, highlightId, color);
      } else {
        // 需要拆分
        let targetNode = tn;

        // 如果高亮不从头开始，先拆分前面的部分
        if (hlStart > 0) {
          targetNode = tn.splitText(hlStart);
          // 插入的新 node 需要更新 textNodes 数组以避免后续索引错误
          textNodes.splice(i + 1, 0, targetNode);
          i++; // 跳过前面拆出来的那段
        }

        // 如果高亮不到末尾，拆分后面的部分
        if (hlEnd - Math.max(startOff, nodeStart) < (targetNode.textContent?.length ?? 0)) {
          const afterLen = hlEnd - Math.max(startOff, nodeStart);
          const after = targetNode.splitText(afterLen);
          textNodes.splice(i + 1, 0, after);
        }

        wrapTextNode(doc, targetNode, highlightId, color);
      }
    }

    currentOffset = nodeEnd;
    if (currentOffset >= endOff) break;
  }
}

function wrapTextNode(doc: Document, textNode: Text, highlightId: string, color: string): void {
  const mark = doc.createElement('mark');
  mark.className = `hl-mark hl-${color}`;
  mark.setAttribute('data-hl-id', highlightId);
  textNode.parentNode?.insertBefore(mark, textNode);
  mark.appendChild(textNode);
}

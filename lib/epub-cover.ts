/**
 * 从 EPUB 文件的 Buffer 中提取封面图片
 *
 * EPUB 本质上是 ZIP，封面路径记录在 OPF 元数据中（<meta name="cover" content="cover-image"/>）
 * 或通过 <item properties="cover-image"> 标记。
 */

import { Readable } from 'stream';
import { createUnzip, type Unzip } from 'zlib';
import { Buffer } from 'buffer';

interface EpubCoverResult {
  /** 封面图片数据 */
  data: Buffer;
  /** MIME 类型 */
  contentType: string;
  /** 文件扩展名 */
  ext: string;
}

/**
 * 从 EPUB buffer 提取封面图片
 * 使用简易 ZIP 解析，不依赖外部库
 */
export async function extractEpubCover(epubBuffer: Buffer): Promise<EpubCoverResult | null> {
  try {
    const entries = await readZipEntries(epubBuffer);

    // 1. 找到 OPF 文件（EPUB 的元数据入口）
    // 先从 META-INF/container.xml 中找 rootfile
    const containerXml = entries.get('META-INF/container.xml');
    if (!containerXml) return null;

    const containerStr = containerXml.toString('utf-8');
    const opfPathMatch = containerStr.match(/full-path="([^"]+\.opf)"/i);
    if (!opfPathMatch) return null;

    const opfPath = opfPathMatch[1];
    const opfBuffer = entries.get(opfPath);
    if (!opfBuffer) return null;

    const opfStr = opfBuffer.toString('utf-8');
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

    // 2. 从 OPF 中找封面图片 ID
    let coverHref: string | null = null;

    // 方法 A: <item properties="cover-image" href="..."/>
    const coverItemMatch = opfStr.match(/<item[^>]+properties\s*=\s*"[^"]*cover-image[^"]*"[^>]*href\s*=\s*"([^"]+)"/i)
      || opfStr.match(/<item[^>]+href\s*=\s*"([^"]+)"[^>]*properties\s*=\s*"[^"]*cover-image[^"]*"/i);
    if (coverItemMatch) {
      coverHref = coverItemMatch[1];
    }

    // 方法 B: <meta name="cover" content="cover-id"/> → 通过 id 找到对应 <item>
    if (!coverHref) {
      const metaCoverMatch = opfStr.match(/<meta[^>]+name\s*=\s*"cover"[^>]+content\s*=\s*"([^"]+)"/i);
      if (metaCoverMatch) {
        const coverId = metaCoverMatch[1];
        // 找到 id 匹配的 <item>
        const itemRegex = new RegExp(`<item[^>]+id\\s*=\\s*"${coverId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]+href\\s*=\\s*"([^"]+)"`, 'i');
        const itemMatch = opfStr.match(itemRegex)
          || opfStr.match(new RegExp(`<item[^>]+href\\s*=\\s*"([^"]+)"[^>]+id\\s*=\\s*"${coverId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i'));
        if (itemMatch) {
          coverHref = itemMatch[1];
        }
      }
    }

    // 方法 C: 常见封面文件名猜测
    if (!coverHref) {
      const commonNames = ['cover.jpg', 'cover.jpeg', 'cover.png', 'cover.gif', 'Cover.jpg', 'Cover.jpeg', 'Cover.png'];
      for (const name of commonNames) {
        if (entries.has(name) || entries.has(`${opfDir}${name}`) || entries.has(`images/${name}`) || entries.has(`Images/${name}`)) {
          coverHref = name;
          break;
        }
      }
    }

    if (!coverHref) return null;

    // 3. 解析封面图片路径（相对于 OPF 目录）
    // 先解码 URL 编码
    const decodedHref = decodeURIComponent(coverHref);
    const coverPath = decodedHref.startsWith('/') ? decodedHref.slice(1) : `${opfDir}${decodedHref}`;

    // 4. 从 ZIP 中读取封面图片
    const coverData = entries.get(coverPath) || entries.get(decodedHref);
    if (!coverData || coverData.length === 0) return null;

    // 5. 确定 MIME 类型
    const lowerHref = decodedHref.toLowerCase();
    let contentType = 'image/jpeg';
    let ext = 'jpg';
    if (lowerHref.endsWith('.png')) { contentType = 'image/png'; ext = 'png'; }
    else if (lowerHref.endsWith('.gif')) { contentType = 'image/gif'; ext = 'gif'; }
    else if (lowerHref.endsWith('.webp')) { contentType = 'image/webp'; ext = 'webp'; }
    else if (lowerHref.endsWith('.svg')) { contentType = 'image/svg+xml'; ext = 'svg'; }

    return { data: coverData, contentType, ext };
  } catch (err) {
    console.warn('封面提取失败:', err);
    return null;
  }
}

/**
 * 从 EPUB OPF 元数据中提取作者和标题
 */
export function extractEpubMetadata(epubBuffer: Buffer): { title?: string; author?: string } {
  try {
    const entries = readZipEntriesSync(epubBuffer);
    const containerXml = entries.get('META-INF/container.xml');
    if (!containerXml) return {};

    const containerStr = containerXml.toString('utf-8');
    const opfPathMatch = containerStr.match(/full-path="([^"]+\.opf)"/i);
    if (!opfPathMatch) return {};

    const opfBuffer = entries.get(opfPathMatch[1]);
    if (!opfBuffer) return {};

    const opf = opfBuffer.toString('utf-8');
    const titleMatch = opf.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
    const authorMatch = opf.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);

    return {
      title: titleMatch?.[1]?.trim(),
      author: authorMatch?.[1]?.trim(),
    };
  } catch {
    return {};
  }
}

// ---- 简易 ZIP 解析（不依赖外部库） ----

/**
 * 解析 ZIP Buffer，返回 Map<文件路径, 文件内容Buffer>
 * 只处理 Store 和 Deflate 两种压缩方式
 */
async function readZipEntries(zipBuffer: Buffer): Promise<Map<string, Buffer>> {
  return readZipEntriesSync(zipBuffer);
}

function readZipEntriesSync(zipBuffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();

  // 找到 End of Central Directory (EOCD) 记录
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
    const uncompressedSize = zipBuffer.readUInt32LE(offset + 24);
    const fileNameLen = zipBuffer.readUInt16LE(offset + 28);
    const extraLen = zipBuffer.readUInt16LE(offset + 30);
    const commentLen = zipBuffer.readUInt16LE(offset + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(offset + 42);

    const fileName = zipBuffer.subarray(offset + 46, offset + 46 + fileNameLen).toString('utf-8');

    // 跳过目录
    if (!fileName.endsWith('/')) {
      // 读取 Local File Header 以获取实际数据
      const localOffset = localHeaderOffset;
      if (localOffset + 30 <= zipBuffer.length && zipBuffer.readUInt32LE(localOffset) === 0x04034b50) {
        const localFileNameLen = zipBuffer.readUInt16LE(localOffset + 26);
        const localExtraLen = zipBuffer.readUInt16LE(localOffset + 28);
        const dataOffset = localOffset + 30 + localFileNameLen + localExtraLen;

        if (dataOffset + compressedSize <= zipBuffer.length) {
          const compressedData = zipBuffer.subarray(dataOffset, dataOffset + compressedSize);

          if (compressionMethod === 0) {
            // Store（无压缩）
            entries.set(fileName, Buffer.from(compressedData));
          } else if (compressionMethod === 8) {
            // Deflate
            try {
              const { inflateRawSync } = require('zlib');
              const decompressed = inflateRawSync(compressedData);
              entries.set(fileName, decompressed);
            } catch {
              // 解压失败，跳过
            }
          }
        }
      }
    }

    offset += 46 + fileNameLen + extraLen + commentLen;
  }

  return entries;
}

/**
 * AI 写作辅助 API
 *
 * 接收选中文本 + 操作类型，流式返回 AI 生成的内容。
 * 走 ptc-cortex v1 API，使用写作专用 system prompt。
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

const CORTEX_API_URL = process.env.CORTEX_API_URL || "http://localhost:3000";
const CORTEX_API_KEY = process.env.CORTEX_API_KEY || "";
const AI_DAILY_LIMIT = parseInt(process.env.AI_DAILY_LIMIT || "20", 10);

type WritingAction =
  | "continue"
  | "rewrite"
  | "translate_en"
  | "translate_zh"
  | "summarize"
  | "expand"
  | "formal"
  | "casual"
  | "fix_grammar"
  | "generate_excerpt"
  | "generate_tags";

const STRICT_SUFFIX =
  "\n\n【重要规则】你是一个文本处理工具，不是聊天助手。无论输入内容是什么，都直接执行指定操作并输出处理后的纯文本。严禁输出任何解释、提问、分析、思考过程或对话内容。如果输入文本不通顺或有错别字，也照样按要求处理并直接输出结果。";

const ACTION_PROMPTS: Record<WritingAction, string> = {
  continue:
    "根据以下文本自然续写。保持原文风格和语气，直接输出续写内容，不要重复原文。" + STRICT_SUFFIX,
  rewrite:
    "将以下文本改写得更加流畅、清晰。保持原意不变，直接输出改写后的文本。" + STRICT_SUFFIX,
  translate_en:
    "将以下文本翻译为地道的英文。直接输出翻译结果。" + STRICT_SUFFIX,
  translate_zh:
    "将以下文本翻译为流畅的中文。直接输出翻译结果。" + STRICT_SUFFIX,
  summarize:
    "用简洁的语言总结以下文本的核心要点。直接输出摘要。" + STRICT_SUFFIX,
  expand:
    "将以下文本进行扩展，增加细节、例子或论述。直接输出扩展后的文本。" + STRICT_SUFFIX,
  formal:
    "将以下文本改写为正式、专业的语气。直接输出改写后的文本。" + STRICT_SUFFIX,
  casual:
    "将以下文本改写为轻松、口语化的语气。直接输出改写后的文本。" + STRICT_SUFFIX,
  fix_grammar:
    "修正以下文本中的语法错误、错别字和标点问题。直接输出修正后的文本。" + STRICT_SUFFIX,
  generate_excerpt:
    "根据以下文章内容，生成一段 100 字以内的摘要。直接输出摘要。" + STRICT_SUFFIX,
  generate_tags:
    "根据以下文章内容，生成 3-5 个合适的标签（用逗号分隔）。直接输出标签。" + STRICT_SUFFIX,
};

export async function POST(req: Request) {
  if (!CORTEX_API_KEY) {
    return Response.json({ error: "AI service not configured." }, { status: 500 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const userId = session.user.id;
  const today = new Date().toISOString().slice(0, 10);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    const usageCount = await prisma.aiUsage.count({
      where: { userId, date: today },
    });
    if (usageCount >= AI_DAILY_LIMIT) {
      return Response.json(
        { error: `今日 AI 次数已用完（${AI_DAILY_LIMIT} 次/天）`, code: "RATE_LIMITED" },
        { status: 429 }
      );
    }
  }

  try {
    const { text, action, context } = (await req.json()) as {
      text: string;
      action: WritingAction;
      context?: string;
    };

    if (!text || !action || !ACTION_PROMPTS[action]) {
      return Response.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const systemPrompt = ACTION_PROMPTS[action];
    const userContent = context
      ? `文章上下文:\n${context}\n\n需要处理的文本:\n${text}`
      : text;

    const response = await fetch(`${CORTEX_API_URL}/api/v1/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CORTEX_API_KEY}`,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: action === "fix_grammar" ? 0.1 : 0.7,
      }),
    });

    if (!response.ok) {
      console.error("cortex writing API error:", response.status);
      return Response.json({ error: "AI 服务调用失败" }, { status: 502 });
    }

    if (!user?.isAdmin) {
      await prisma.aiUsage.create({
        data: { userId, date: today, endpoint: "writing" },
      });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const raw = decoder.decode(chunk, { stream: true });
        const events = raw.split("\n\n").filter(Boolean);

        for (const eventBlock of events) {
          const lines = eventBlock.split("\n");
          let eventType = "";
          let eventData = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) eventData = line.slice(6);
          }
          if (!eventType || !eventData) continue;
          try {
            const parsed = JSON.parse(eventData);
            if (eventType === "token" && parsed.content) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content: parsed.content })}\n\n`)
              );
            } else if (eventType === "done") {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
            }
          } catch {
            // skip
          }
        }
      },
    });

    const outputStream = response.body!.pipeThrough(transformStream);

    return new Response(outputStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Writing API error:", error);
    return Response.json({ error: "处理失败" }, { status: 500 });
  }
}

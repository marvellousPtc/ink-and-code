/**
 * AI 阅读辅助 API
 *
 * 接收选中文本 + 操作类型（可选用户问题），流式返回 AI 生成的内容。
 * 走 ptc-cortex v1 API，使用阅读专用 system prompt。
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

const CORTEX_API_URL = process.env.CORTEX_API_URL || "http://localhost:3000";
const CORTEX_API_KEY = process.env.CORTEX_API_KEY || "";
const AI_DAILY_LIMIT = parseInt(process.env.AI_DAILY_LIMIT || "20", 10);

type ReadingAction =
  | "explain"
  | "translate_zh"
  | "translate_en"
  | "summarize"
  | "ask";

const STRICT_SUFFIX =
  "\n\n【重要规则】你是一个阅读辅助工具，不是闲聊助手。请紧扣用户提供的原文直接给出结果，不要输出「好的」「我来帮你」之类的客套，不要复述原文，不要提出反问。回答使用与用户相同的语言（默认中文），语气自然、表达清晰。";

const ACTION_PROMPTS: Record<ReadingAction, string> = {
  explain:
    "用通俗易懂的语言解释下面这段文字的含义。如果出现专业术语、人名、典故或难懂的比喻，请逐一说明。直接输出解释。" +
    STRICT_SUFFIX,
  translate_zh:
    "将以下文字翻译为流畅自然的中文，保留原意与语气。直接输出译文。" + STRICT_SUFFIX,
  translate_en:
    "将以下文字翻译为地道的英文，保留原意与语气。直接输出译文。" + STRICT_SUFFIX,
  summarize:
    "用简洁的语言概括下面这段文字的核心要点。直接输出摘要，不要铺陈。" +
    STRICT_SUFFIX,
  ask:
    "基于用户提供的原文回答用户的问题。如果原文不足以回答，可以结合常识补充，但要说明是外部知识。直接输出答案。" +
    STRICT_SUFFIX,
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
    const { text, action, question, context } = (await req.json()) as {
      text: string;
      action: ReadingAction;
      question?: string;
      context?: string;
    };

    if (!text || !action || !ACTION_PROMPTS[action]) {
      return Response.json({ error: "缺少必要参数" }, { status: 400 });
    }

    if (action === "ask" && !question?.trim()) {
      return Response.json({ error: "请输入你的问题" }, { status: 400 });
    }

    const systemPrompt = ACTION_PROMPTS[action];
    const parts: string[] = [];
    if (context) parts.push(`上下文:\n${context}`);
    parts.push(`原文:\n${text}`);
    if (action === "ask" && question) parts.push(`问题:\n${question.trim()}`);
    const userContent = parts.join("\n\n");

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
        temperature: action === "translate_zh" || action === "translate_en" ? 0.3 : 0.7,
      }),
    });

    if (!response.ok) {
      console.error("cortex reading API error:", response.status);
      return Response.json({ error: "AI 服务调用失败" }, { status: 502 });
    }

    if (!user?.isAdmin) {
      await prisma.aiUsage.create({
        data: { userId, date: today, endpoint: "reading" },
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
    console.error("Reading API error:", error);
    return Response.json({ error: "处理失败" }, { status: 500 });
  }
}

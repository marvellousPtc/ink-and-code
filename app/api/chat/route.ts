/**
 * AI 聊天 API — 转发到 ptc-cortex 服务
 *
 * 消费 ptc-cortex 的结构化 SSE 事件 (token/tool_start/tool_end/done)，
 * 转换为 Vercel AI SDK 的 data stream 协议，供前端 useChat 直接消费。
 *
 * 安全: 要求登录 + 每日调用次数限制（管理员豁免）
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

const CORTEX_API_URL = process.env.CORTEX_API_URL || "http://localhost:3000";
const CORTEX_API_KEY = process.env.CORTEX_API_KEY || "";
const AI_DAILY_LIMIT = parseInt(process.env.AI_DAILY_LIMIT || "20", 10);

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  if (!CORTEX_API_KEY) {
    console.error("CORTEX_API_KEY is not configured");
    return Response.json(
      { error: "AI service not configured." },
      { status: 500 }
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "请先登录后使用 AI 助手" }, { status: 401 });
  }

  const userId = session.user.id;
  const today = todayDateString();

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
        {
          error: `今日对话次数已用完（${AI_DAILY_LIMIT} 次/天），明天再来吧`,
          code: "RATE_LIMITED",
        },
        { status: 429 }
      );
    }
  }

  try {
    const { messages } = await req.json();

    const simpleMessages = messages.map(
      (msg: {
        role: string;
        parts?: Array<{ type: string; text?: string }>;
      }) => {
        const textParts =
          msg.parts?.filter((p: { type: string }) => p.type === "text") || [];
        const content = textParts
          .map((p: { text?: string }) => p.text || "")
          .join("");
        return {
          role: msg.role as "user" | "assistant",
          content,
        };
      }
    );

    const response = await fetch(`${CORTEX_API_URL}/api/v1/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CORTEX_API_KEY}`,
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              "你是 Ink & Code 博客的 AI 助手，友好、专业。" +
              "帮助用户解答问题、提供信息和协助完成各种任务。" +
              "请用简洁、清晰的语言回答问题。如果用户使用中文提问，请用中文回答。",
          },
          ...simpleMessages,
        ],
        webSearchEnabled: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("ptc-cortex API error:", response.status, errText);
      return Response.json({ error: "AI 服务调用失败" }, { status: 502 });
    }

    // Record usage after successful upstream call (non-admin only)
    if (!user?.isAdmin) {
      await prisma.aiUsage.create({
        data: { userId, date: today, endpoint: "chat" },
      });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = decoder.decode(chunk, { stream: true });
        const events = text.split("\n\n").filter(Boolean);

        for (const eventBlock of events) {
          const lines = eventBlock.split("\n");
          let eventType = "";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              eventData = line.slice(6);
            }
          }

          if (!eventType || !eventData) continue;

          try {
            const parsed = JSON.parse(eventData);

            if (eventType === "token" && parsed.content) {
              const encoded = JSON.stringify(parsed.content);
              controller.enqueue(encoder.encode(`0:${encoded}\n`));
            } else if (eventType === "done") {
              controller.enqueue(
                encoder.encode(
                  `e:${JSON.stringify({
                    finishReason: "stop",
                    usage: { promptTokens: 0, completionTokens: 0 },
                    isContinued: false,
                  })}\n`
                )
              );
              controller.enqueue(
                encoder.encode(
                  `d:${JSON.stringify({
                    finishReason: "stop",
                    usage: { promptTokens: 0, completionTokens: 0 },
                  })}\n`
                )
              );
            }
          } catch {
            // JSON parse failure, skip
          }
        }
      },
    });

    const outputStream = response.body!.pipeThrough(transformStream);

    return new Response(outputStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Vercel-AI-Data-Stream": "v1",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return Response.json(
      { error: "Failed to process chat request" },
      { status: 500 }
    );
  }
}

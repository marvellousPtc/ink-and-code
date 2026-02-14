/*
 * :file description: 
 * :name: /ink-and-code/app/api/chat/route.ts
 * :author: PTC
 * :copyright: (c) 2026, Tungee
 * :date created: 2026-01-30 17:35:26
 * :last editor: PTC
 * :date last edited: 2026-02-14 11:20:34
 */
/**
 * AI 聊天 API — 转发到 ptc-cortex 服务
 *
 * 消费 ptc-cortex 的结构化 SSE 事件 (token/tool_start/tool_end/done)，
 * 转换为 Vercel AI SDK 的 data stream 协议，供前端 useChat 直接消费。
 */

// 允许流式响应最长 60 秒
export const maxDuration = 60;

const CORTEX_API_URL = process.env.CORTEX_API_URL || "http://localhost:3000";
const CORTEX_API_KEY = process.env.CORTEX_API_KEY || "";

export async function POST(req: Request) {
  if (!CORTEX_API_KEY) {
    console.error("CORTEX_API_KEY is not configured");
    return new Response(
      JSON.stringify({ error: "AI service not configured. Please set CORTEX_API_KEY in .env.local." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { messages } = await req.json();

    // 从 Vercel AI SDK 的 UIMessage 格式提取纯文本消息
    const simpleMessages = messages.map(
      (msg: { role: string; parts?: Array<{ type: string; text?: string }> }) => {
        const textParts = msg.parts?.filter((p: { type: string }) => p.type === "text") || [];
        const content = textParts.map((p: { text?: string }) => p.text || "").join("");
        return {
          role: msg.role as "user" | "assistant",
          content,
        };
      }
    );

    // 调用 ptc-cortex 的 v1 API
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
      return new Response(
        JSON.stringify({ error: "AI 服务调用失败" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    // 将 ptc-cortex SSE 事件转换为 Vercel AI SDK data stream 协议
    // 协议格式：
    //   0:"text"\n          → 文本增量
    //   e:{"finishReason":"stop"}\n → 步骤结束
    //   d:{"finishReason":"stop"}\n → 消息结束
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = decoder.decode(chunk, { stream: true });
        // SSE 格式：每个事件由 "event: xxx\ndata: yyy\n\n" 组成
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
              // 文本增量 → Vercel AI SDK text part
              const encoded = JSON.stringify(parsed.content);
              controller.enqueue(encoder.encode(`0:${encoded}\n`));
            } else if (eventType === "done") {
              // 流结束 → step finish + message finish
              controller.enqueue(
                encoder.encode(
                  `e:${JSON.stringify({ finishReason: "stop", usage: { promptTokens: 0, completionTokens: 0 }, isContinued: false })}\n`
                )
              );
              controller.enqueue(
                encoder.encode(
                  `d:${JSON.stringify({ finishReason: "stop", usage: { promptTokens: 0, completionTokens: 0 } })}\n`
                )
              );
            }
            // tool_start / tool_end 事件暂不转发到前端（可按需扩展）
          } catch {
            // JSON 解析失败，跳过
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
    return new Response(
      JSON.stringify({ error: "Failed to process chat request" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

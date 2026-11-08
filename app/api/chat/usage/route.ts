import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AI_CHAT_ENABLED } from "@/lib/features";

const AI_DAILY_LIMIT = parseInt(process.env.AI_DAILY_LIMIT || "20", 10);

export async function GET() {
  if (!AI_CHAT_ENABLED) {
    return Response.json(
      { error: "AI 对话功能暂时关闭", code: "AI_CHAT_DISABLED" },
      { status: 503 }
    );
  }

  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { authenticated: false, used: 0, limit: AI_DAILY_LIMIT, remaining: 0 },
      { status: 200 }
    );
  }

  const userId = session.user.id;
  const today = new Date().toISOString().slice(0, 10);

  const [user, usageCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    }),
    prisma.aiUsage.count({
      where: { userId, date: today },
    }),
  ]);

  const isAdmin = user?.isAdmin ?? false;

  return Response.json({
    authenticated: true,
    isAdmin,
    used: usageCount,
    limit: isAdmin ? Infinity : AI_DAILY_LIMIT,
    remaining: isAdmin ? Infinity : Math.max(0, AI_DAILY_LIMIT - usageCount),
  });
}

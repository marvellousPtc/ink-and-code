import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const AI_DAILY_LIMIT = parseInt(process.env.AI_DAILY_LIMIT || "20", 10);

export async function GET() {
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

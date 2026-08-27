import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getRecommendations } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "10", 10) || 10));

  try {
    const result = await getRecommendations({
      userId: session.user.id,
      page,
      pageSize,
    });

    if (!result) {
      return NextResponse.json({ error: "Freelancer profile not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[recommendations]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
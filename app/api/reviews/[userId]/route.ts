import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: userIdStr } = await params;
    const userId = parseInt(userIdStr, 10);
    
    if (isNaN(userId) || userId <= 0) {
      return NextResponse.json(
        { error: "Invalid userId" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10", 10));
    const offset = (page - 1) * limit;

    // Use a single query with COUNT(*) OVER() to fetch both data and total count efficiently
    const reviews = (await sql`
      SELECT 
        id, contract_id, reviewer_id, freelancer_id, rating, comment, verified, created_at,
        COUNT(*) OVER() AS total_count
      FROM reviews
      WHERE freelancer_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as any[];

    const totalCount = reviews.length > 0 ? parseInt(reviews[0].total_count, 10) : 0;
    
    // Map over reviews to remove the total_count property from each row
    const data = reviews.map(({ total_count, ...review }) => review);

    return NextResponse.json({
      data,
      meta: {
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error("Error fetching reviews:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

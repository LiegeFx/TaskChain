import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { withRbac, RbacContext } from "@/lib/auth/rbacMiddleware";

const reviewSchema = z.object({
  contractId: z.number().int().positive(),
  reviewerId: z.number().int().positive(),
  freelancerId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export const POST = withRbac('reviews:create', async (req: Request, auth: RbacContext) => {
  try {
    const body = await req.json();
    
    // Validate request body
    const result = reviewSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input data", details: result.error.errors },
        { status: 400 }
      );
    }
    
    const { contractId, freelancerId, rating, comment } = result.data;

    // Check if contract exists and get its status
    const contractResult = (await sql`
      SELECT status, client_id FROM contracts WHERE id = ${contractId}
    `) as any[];

    if (contractResult.length === 0) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 }
      );
    }

    const contract = contractResult[0];
    
    // Determine if the review is verified (e.g. linked to a completed contract)
    const verified = contract.status === "completed";

    // Insert the review
    const insertResult = (await sql`
      INSERT INTO reviews (contract_id, reviewer_id, freelancer_id, rating, comment, verified)
      VALUES (${contractId}, ${auth.userId}, ${freelancerId}, ${rating}, ${comment || null}, ${verified})
      RETURNING *
    `) as any[];

    return NextResponse.json(insertResult[0], { status: 201 });

  } catch (error: any) {
    // Check for Postgres unique constraint violation
    if (error.code === '23505') {
      return NextResponse.json(
        { error: "One review allowed per contract." },
        { status: 409 }
      );
    }

    console.error("Error creating review:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

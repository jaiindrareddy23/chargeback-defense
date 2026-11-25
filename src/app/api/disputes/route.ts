import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const disputes = await prisma.dispute.findMany({
    include: { merchant: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(disputes);
}

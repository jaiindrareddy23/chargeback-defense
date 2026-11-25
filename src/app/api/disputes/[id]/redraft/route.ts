import { NextRequest, NextResponse } from "next/server";
import { draftEvidenceNarrative } from "@/lib/narrative";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const dispute = await draftEvidenceNarrative(id);
  return NextResponse.json(dispute);
}

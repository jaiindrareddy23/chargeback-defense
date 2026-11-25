import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error_description");

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const tokenResponse = await stripe.oauth.token({
    grant_type: "authorization_code",
    code,
  });

  const stripeAccountId = tokenResponse.stripe_user_id;
  if (!stripeAccountId) {
    return NextResponse.json(
      { error: "Stripe did not return an account id" },
      { status: 502 }
    );
  }

  const account = await stripe.accounts.retrieve(stripeAccountId);
  const email = account.email ?? `${stripeAccountId}@unknown.stripe`;

  await prisma.merchant.upsert({
    where: { stripeAccountId },
    create: {
      email,
      name: account.business_profile?.name ?? undefined,
      stripeAccountId,
      stripeAccessToken: tokenResponse.access_token,
    },
    update: {
      email,
      name: account.business_profile?.name ?? undefined,
      stripeAccessToken: tokenResponse.access_token,
    },
  });

  return NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin));
}

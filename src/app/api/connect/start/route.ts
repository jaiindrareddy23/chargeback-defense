import { NextRequest, NextResponse } from "next/server";

// Kicks off Stripe Connect Standard OAuth so a merchant can link their
// Stripe account. We never see their API keys this way — Stripe hands us
// an access token scoped to their account instead.
export async function GET(request: NextRequest) {
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "STRIPE_CONNECT_CLIENT_ID is not set" },
      { status: 500 }
    );
  }

  const redirectUri = new URL("/api/connect/callback", request.nextUrl.origin);

  const authorizeUrl = new URL("https://connect.stripe.com/oauth/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("scope", "read_write");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri.toString());

  return NextResponse.redirect(authorizeUrl.toString());
}

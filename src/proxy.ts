import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Gate the internal ops views — real merchant and dispute data lives behind them,
// and nothing else in this app enforces auth. HTTP Basic is a minimum bar for a
// pilot-stage tool, not a real auth system; replace it before this has more than a
// couple of trusted operators.
export function proxy(request: NextRequest) {
  const expectedUser = process.env.DASHBOARD_USER;
  const expectedPassword = process.env.DASHBOARD_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return new NextResponse("Dashboard auth is not configured (DASHBOARD_USER/DASHBOARD_PASSWORD).", {
      status: 500,
    });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    const user = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    if (user === expectedUser && password === expectedPassword) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Chargeback Defense ops"' },
  });
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/disputes/:path*"],
};

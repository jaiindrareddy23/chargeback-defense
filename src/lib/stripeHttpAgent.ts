import { HttpsProxyAgent } from "https-proxy-agent";

// Stripe's Node SDK talks to the API with Node's `https` module directly, which
// (unlike some HTTP clients) never honors HTTPS_PROXY on its own. Any environment
// that routes outbound HTTPS through a proxy — a corporate network, or this app's
// own sandboxed dev container — needs this passed explicitly as Stripe's `httpAgent`
// option, or every request fails DNS resolution before it gets anywhere near Stripe.
// Vercel and most production hosts set no HTTPS_PROXY, so this is a no-op there.
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;

export const stripeHttpAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

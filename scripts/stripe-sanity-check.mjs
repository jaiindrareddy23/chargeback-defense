import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "proxy-injected");
const account = await stripe.accounts.retrieve();
console.log("Connected as platform test account:", account.id, account.email);

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { generateCouponCode, rulesFor } from "../lib/coupon";

function isAuthorized(req: VercelRequest) {
  const secret = process.env.COUPON_ADMIN_SECRET;
  if (!secret) throw new Error("Missing COUPON_ADMIN_SECRET");
  return req.headers["x-admin-secret"] === secret;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    if (!isAuthorized(req)) return res.status(401).json({ error: "UNAUTHORIZED" });

    const { discountInr, name, phone } = (req.body ?? {}) as {
      discountInr: 100 | 500 | 1000;
      name?: string;
      phone?: string;
    };

    if (![100, 500, 1000].includes(discountInr)) {
      return res.status(400).json({ error: "INVALID_DISCOUNT", allowed: [100, 500, 1000] });
    }

    const { scope, minAmountInr } = rulesFor(discountInr);

    // 180 days validity (as requested)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);

    const sb = supabaseAdmin();

    // Ensure uniqueness with a few retries (in case of rare collision).
    for (let attempt = 0; attempt < 8; attempt++) {
      const generated = generateCouponCode({ name, phone });
      const { data, error } = await sb
        .from("coupons")
        .insert({
          code: generated.code,
          scope,
          discount_inr: discountInr,
          min_amount_inr: minAmountInr,
          issued_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          issued_to_name: generated.issuedToName ?? null,
          issued_to_phone_last6: generated.issuedToPhoneLast6 ?? null,
        })
        .select("code,scope,discount_inr,min_amount_inr,issued_at,expires_at")
        .single();

      if (!error) return res.status(201).json(data);

      // Unique violation => retry, otherwise fail fast.
      if (!String(error.code ?? "").includes("23505")) {
        return res.status(500).json({ error: "DB_ERROR", details: error.message });
      }
    }

    return res.status(500).json({ error: "COULD_NOT_GENERATE_UNIQUE_CODE" });
  } catch (e: any) {
    return res.status(500).json({ error: "SERVER_ERROR", details: e?.message ?? String(e) });
  }
}


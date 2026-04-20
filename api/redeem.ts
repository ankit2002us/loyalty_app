import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import type { CouponScope } from "../lib/coupon";

function last6Digits(phone: string | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return null;
  return digits.slice(-6);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });

    const { code, bookingId, userId, bookingAmountInr, bookingScope, phone } = (req.body ?? {}) as {
      code: string;
      bookingId: string;
      userId: string; // uuid
      bookingAmountInr: number;
      bookingScope: CouponScope;
      phone?: string;
    };

    if (!code || typeof code !== "string" || code.length !== 12) {
      return res.status(400).json({ error: "INVALID_CODE" });
    }
    if (!bookingId || typeof bookingId !== "string") {
      return res.status(400).json({ error: "INVALID_BOOKING_ID" });
    }
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "INVALID_USER_ID" });
    }
    if (!Number.isFinite(bookingAmountInr) || bookingAmountInr <= 0) {
      return res.status(400).json({ error: "INVALID_BOOKING_AMOUNT" });
    }
    if (!["flight", "domestic", "international"].includes(bookingScope)) {
      return res.status(400).json({ error: "INVALID_BOOKING_SCOPE" });
    }

    const sb = supabaseAdmin();
    const { data, error } = await sb.rpc("redeem_coupon", {
      p_code: code,
      p_booking_id: bookingId,
      p_user_id: userId,
      p_booking_amount_inr: Math.trunc(bookingAmountInr),
      p_booking_scope: bookingScope,
      p_phone_last6: last6Digits(phone),
    });

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("INVALID_OR_EXPIRED_OR_ALREADY_REDEEMED_OR_NOT_ELIGIBLE")) {
        return res.status(400).json({ error: "NOT_ELIGIBLE" });
      }
      return res.status(500).json({ error: "DB_ERROR", details: error.message });
    }

    // rpc returns array in supabase-js
    const row = Array.isArray(data) ? data[0] : data;
    return res.status(200).json(row);
  } catch (e: any) {
    return res.status(500).json({ error: "SERVER_ERROR", details: e?.message ?? String(e) });
  }
}


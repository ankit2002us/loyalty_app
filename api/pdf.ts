import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "fs";
import path from "path";
import { supabaseAdmin } from "../lib/supabaseAdmin";

function fmtDate(iso: string) {
  const d = new Date(iso);
  // Simple, readable format; customize as needed
  return d.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") return res.status(405).send("METHOD_NOT_ALLOWED");

    const code = String(req.query.code ?? "");
    if (!code || code.length !== 12) return res.status(400).send("INVALID_CODE");

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("coupons")
      .select("code,scope,discount_inr,min_amount_inr,issued_at,expires_at,redeemed_at,issued_to_name")
      .eq("code", code)
      .single();

    if (error || !data) return res.status(404).send("NOT_FOUND");

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Try to embed logo if present at /public/logo.png
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    let cursorY = 800;
    if (fs.existsSync(logoPath)) {
      const pngBytes = fs.readFileSync(logoPath);
      const logo = await pdfDoc.embedPng(pngBytes);
      const logoDims = logo.scale(0.25);
      page.drawImage(logo, { x: 40, y: cursorY - logoDims.height, width: logoDims.width, height: logoDims.height });
    }

    page.drawText("Loyalty Coupon", { x: 40, y: 760, size: 22, font: fontBold, color: rgb(0.1, 0.1, 0.1) });

    const lines: Array<[string, string]> = [
      ["Coupon Code", data.code],
      ["Discount", `₹${data.discount_inr} off next booking`],
      ["Scope", String(data.scope)],
      ["Minimum Booking", `₹${data.min_amount_inr}`],
      ["Issued On", fmtDate(data.issued_at)],
      ["Valid Till", fmtDate(data.expires_at)],
      ["Issued To", data.issued_to_name ?? "—"],
      ["Redeemed At", data.redeemed_at ? fmtDate(data.redeemed_at) : "Not redeemed"],
    ];

    cursorY = 720;
    for (const [k, v] of lines) {
      page.drawText(`${k}:`, { x: 40, y: cursorY, size: 12, font: fontBold, color: rgb(0, 0, 0) });
      page.drawText(v, { x: 180, y: cursorY, size: 12, font, color: rgb(0, 0, 0) });
      cursorY -= 22;
    }

    cursorY -= 10;
    page.drawLine({ start: { x: 40, y: cursorY }, end: { x: 555, y: cursorY }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
    cursorY -= 30;

    const terms = [
      "Terms:",
      "• One-time use only. Non-stackable with other offers.",
      "• Valid only before expiry date/time.",
      "• Scope must match booking type (flight/domestic/international).",
      "• Minimum booking amount applies for this coupon.",
    ];
    for (const t of terms) {
      page.drawText(t, { x: 40, y: cursorY, size: 10.5, font, color: rgb(0.15, 0.15, 0.15) });
      cursorY -= 16;
    }

    const bytes = await pdfDoc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="coupon-${data.code}.pdf"`);
    return res.status(200).send(Buffer.from(bytes));
  } catch (e: any) {
    return res.status(500).send(e?.message ?? String(e));
  }
}


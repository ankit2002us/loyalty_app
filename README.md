# Loyalty Coupon Program (Vercel + Supabase)

Lightweight coupon issuing + redemption + PDF printing.

## What you asked (implemented)
- Manual coupon issuing (admin-only endpoint).
- Validity: **180 days** from issue date.
- Discounts: **₹100 / ₹500 / ₹1000** (one-time use).
- Minimum booking rules:
  - `flight` + ₹100: min **₹3500**
  - `domestic` + ₹500: min **₹25000**
  - `international` + ₹1000: min **₹50000**
- Coupon code: **12 characters**
  - If `name + phone` provided: first 6 letters of name + last 6 digits of phone, **shuffled**.
  - Else: **12-digit numeric** with Luhn check digit.
- Redemption time captured in DB (`redeemed_at`).
- PDF generation with optional logo at `public/logo.png`.

## 1) Supabase setup
1. Create a Supabase project.
2. In Supabase SQL editor, run: `supabase/schema.sql`
3. Grab keys:
   - Project URL
   - Service role key (server-only; keep secret)

## 2) Vercel setup
1. Create a Vercel project from this folder.
2. Set env vars in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `COUPON_ADMIN_SECRET` (random long secret)

## 3) Local dev (optional)
```bash
npm i
npm run dev
```

## 4) Issue a coupon (manual/admin)
Endpoint: `POST /api/issue`

Headers:
- `x-admin-secret: <COUPON_ADMIN_SECRET>`

Body:
```json
{
  "discountInr": 500,
  "name": "Ankit Jain",
  "phone": "+91 9876543210"
}
```

Response includes:
- `code`, `issued_at`, `expires_at`, `discount_inr`, `min_amount_inr`, `scope`

## 5) Redeem a coupon (booking flow)
Endpoint: `POST /api/redeem`

Body:
```json
{
  "code": "AJNITK432109",
  "bookingId": "BK_123",
  "userId": "00000000-0000-0000-0000-000000000000",
  "bookingAmountInr": 28000,
  "bookingScope": "domestic",
  "phone": "+91 9876543210"
}
```

Notes:
- If the coupon was issued with phone, redemption requires the same last-6 digits.
- Fails with `NOT_ELIGIBLE` if expired / already used / scope mismatch / min amount not met / phone mismatch.

## 6) Get a PDF to print/share
Endpoint: `GET /api/pdf?code=<12-char-code>`

Add your logo:
- Put a PNG at `public/logo.png`

## One question to confirm
Do you want to **enforce phone match always**, or only when phone was provided at issue time (current behavior)?


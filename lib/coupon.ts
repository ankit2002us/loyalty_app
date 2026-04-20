import crypto from "crypto";

export type CouponScope = "flight" | "domestic" | "international";

export function rulesFor(discountInr: 100 | 500 | 1000): {
  scope: CouponScope;
  minAmountInr: number;
} {
  if (discountInr === 100) return { scope: "flight", minAmountInr: 3500 };
  if (discountInr === 500) return { scope: "domestic", minAmountInr: 25000 };
  return { scope: "international", minAmountInr: 50000 };
}

function normalizeNameLetters(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 6)
    .padEnd(6, "X");
}

function last6Digits(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return null;
  return digits.slice(-6);
}

function shuffleString(input: string): string {
  const arr = input.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}

function luhnCheckDigit(num: string): string {
  let sum = 0;
  let doubleIt = true;
  for (let i = num.length - 1; i >= 0; i--) {
    let digit = Number(num[i]);
    if (doubleIt) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleIt = !doubleIt;
  }
  return String((10 - (sum % 10)) % 10);
}

export function generateCouponCode(params: {
  name?: string;
  phone?: string;
}): { code: string; issuedToName?: string; issuedToPhoneLast6?: string } {
  const name = params.name?.trim();
  const phone = params.phone?.trim();
  const phoneLast6 = phone ? last6Digits(phone) : null;

  if (name && phoneLast6) {
    const base = normalizeNameLetters(name) + phoneLast6; // 12 chars
    const code = shuffleString(base);
    return { code, issuedToName: name, issuedToPhoneLast6: phoneLast6 };
  }

  // Fallback: 12-digit numeric (11 random + Luhn check digit)
  let first11 = "";
  for (let i = 0; i < 11; i++) first11 += String(crypto.randomInt(0, 10));
  const code = first11 + luhnCheckDigit(first11);
  return { code };
}


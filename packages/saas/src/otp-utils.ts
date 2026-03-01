/**
 * Extract OTP code from email text using common patterns.
 */
export function extractOtp(text: string): string | null {
  // Try common OTP label patterns first (more specific)
  const labelPatterns = [
    /(?:verification\s*code|one[- ]time\s*(?:password|code|passcode)|otp|security\s*code|confirm(?:ation)?\s*code|access\s*code)[:\s]+(\d{4,8})/i,
    /(\d{4,8})\s*(?:is\s+your|is\s+the)\s*(?:verification|one[- ]time|otp|security|confirm|access)\s*(?:code|password|passcode)/i,
  ];

  for (const pattern of labelPatterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }

  // Fallback: find standalone 4-8 digit codes
  // Exclude things that look like years (19xx, 20xx), phone numbers, zip codes
  const digitMatches = text.match(/\b(\d{4,8})\b/g);
  if (digitMatches) {
    for (const code of digitMatches) {
      // Skip likely years
      if (code.length === 4 && (code.startsWith("19") || code.startsWith("20"))) continue;
      return code;
    }
  }

  return null;
}

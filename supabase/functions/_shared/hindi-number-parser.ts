// Hindi Number Parser — converts Hindi number words to numeric values
// Supports basic numbers, compounds (paanch lakh), and specials (dedh, dhai, saade)

const HINDI_NUMBERS: Record<string, number> = {
  // Basic 1-10
  ek: 1, do: 2, teen: 3, char: 4, paanch: 5, panch: 5,
  chhe: 6, cheh: 6, saat: 7, aath: 8, nau: 9, das: 10,
  // 11-19
  gyarah: 11, barah: 12, terah: 13, chaudah: 14, pandrah: 15,
  solah: 16, satrah: 17, atharah: 18, unees: 19,
  // Tens
  bees: 20, tees: 30, chaalees: 40, pachaas: 50, pachees: 25,
  saath: 60, sattar: 70, assi: 80, nabbe: 90,
  // Hundred
  sau: 100, ek_sau: 100, do_sau: 200,
};

const HINDI_MULTIPLIERS: Record<string, number> = {
  hazaar: 1000, hazar: 1000, hajaar: 1000,
  lakh: 100000, lac: 100000,
  crore: 10000000, karod: 10000000,
};

// Special compounds: dedh = 1.5x, dhai = 2.5x, saade = +0.5x
const SPECIAL_PREFIXES: Record<string, number> = {
  dedh: 1.5,   // dedh lakh = 1,50,000
  dhai: 2.5,   // dhai lakh = 2,50,000
  adhai: 2.5,  // alternate spelling
};

export interface ParseResult {
  parsed: string;
  replacements: { original: string; value: number }[];
}

/**
 * Parse Hindi number words in a query and replace with digits.
 * e.g., "paanch lakh ka invoice" → "500000 ka invoice"
 */
export function parseHindiNumbers(query: string): ParseResult {
  const replacements: { original: string; value: number }[] = [];
  let result = query;

  // 1. Handle "saade X multiplier" → (X + 0.5) * multiplier
  // e.g., "saade teen lakh" → 350000
  const saadePattern = /\b(saade?|saadhe?)\s+(\w+)\s+(hazaar|hazar|hajaar|lakh|lac|crore|karod)\b/gi;
  result = result.replace(saadePattern, (_match, _prefix, numWord, multWord) => {
    const base = HINDI_NUMBERS[numWord.toLowerCase()];
    const mult = HINDI_MULTIPLIERS[multWord.toLowerCase()];
    if (base !== undefined && mult !== undefined) {
      const value = (base + 0.5) * mult;
      replacements.push({ original: _match.trim(), value });
      return String(value);
    }
    return _match;
  });

  // 2. Handle "dedh/dhai multiplier"
  const specialPattern = /\b(dedh|dhai|adhai)\s+(hazaar|hazar|hajaar|lakh|lac|crore|karod)\b/gi;
  result = result.replace(specialPattern, (_match, prefix, multWord) => {
    const factor = SPECIAL_PREFIXES[prefix.toLowerCase()];
    const mult = HINDI_MULTIPLIERS[multWord.toLowerCase()];
    if (factor !== undefined && mult !== undefined) {
      const value = factor * mult;
      replacements.push({ original: _match.trim(), value });
      return String(value);
    }
    return _match;
  });

  // 3. Handle "X multiplier" compounds (e.g., "paanch lakh", "do crore")
  const compoundPattern = /\b(\w+)\s+(hazaar|hazar|hajaar|lakh|lac|crore|karod)\b/gi;
  result = result.replace(compoundPattern, (_match, numWord, multWord) => {
    // Skip if already replaced (starts with digit)
    if (/^\d/.test(numWord)) return _match;
    const base = HINDI_NUMBERS[numWord.toLowerCase()];
    const mult = HINDI_MULTIPLIERS[multWord.toLowerCase()];
    if (base !== undefined && mult !== undefined) {
      const value = base * mult;
      replacements.push({ original: _match.trim(), value });
      return String(value);
    }
    return _match;
  });

  // 4. Handle standalone Hindi number words (only if surrounded by non-Hindi context)
  // Be careful not to replace common words like "do" when they're verbs
  const safeStandalones = [
    "gyarah", "barah", "terah", "chaudah", "pandrah", "solah", "satrah", "atharah",
    "unees", "bees", "tees", "chaalees", "pachaas", "sattar", "assi", "nabbe", "sau",
    "pachees",
  ];
  for (const word of safeStandalones) {
    const re = new RegExp(`\\b${word}\\b`, "gi");
    result = result.replace(re, (match) => {
      const value = HINDI_NUMBERS[match.toLowerCase()];
      if (value !== undefined) {
        replacements.push({ original: match, value });
        return String(value);
      }
      return match;
    });
  }

  return { parsed: result, replacements };
}

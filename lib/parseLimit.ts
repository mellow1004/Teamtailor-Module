const NUMBERS: Record<string, number> = {
  en: 1, ett: 1,
  tva: 2, tre: 3, fyra: 4, fem: 5, sex: 6, sju: 7,
  atta: 8, nio: 9, tio: 10,
  elva: 11, tolv: 12, tretton: 13, fjorton: 14, femton: 15,
  sexton: 16, sjutton: 17, arton: 18, nitton: 19, tjugo: 20,
};

const NUM_TOKEN = `(?:${Object.keys(NUMBERS).join("|")}|\\d+)`;
const TRAILING_NOUN = "(?:forsta|kandidater|personer|ansokningar|stycken|st)";
const LEADING_CUE = "(?:forsta|topp|top|max|bara|endast|hogst)";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o");
}

function toNumber(token: string): number | null {
  const digit = parseInt(token, 10);
  if (!isNaN(digit)) return digit;
  return NUMBERS[token] ?? null;
}

export function parseLimit(instruction: string): number | null {
  if (!instruction) return null;
  const text = normalize(instruction);

  const before = text.match(
    new RegExp(`\\b(${NUM_TOKEN})\\s+${TRAILING_NOUN}\\b`)
  );
  if (before) {
    const n = toNumber(before[1]);
    if (n && n > 0) return n;
  }

  const after = text.match(
    new RegExp(`\\b${LEADING_CUE}\\s+(${NUM_TOKEN})\\b`)
  );
  if (after) {
    const n = toNumber(after[1]);
    if (n && n > 0) return n;
  }

  return null;
}

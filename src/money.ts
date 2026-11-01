/** Money is always `{ micros, currency }`: integer micros (1 unit = 1_000_000), ISO-4217 currency. */
export interface Money {
  micros: number;
  currency: string;
}

const MICROS = 6;

/** Parse a decimal major-unit amount ("12.34") into micros using string math only. Throws on more than 6 decimals. */
export function fromMajor(amount: string | number, currency: string): Money {
  const text = typeof amount === "number" ? String(amount) : amount.trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) throw new RangeError(`Invalid amount "${text}": use a plain decimal string such as "12.34"`);
  const [, sign, whole, frac = ""] = m;
  if (frac.length > MICROS) throw new RangeError(`Amount "${text}" has more than ${MICROS} decimal places`);
  const micros = Number(sign + whole + frac.padEnd(MICROS, "0"));
  if (!Number.isSafeInteger(micros)) throw new RangeError(`Amount "${text}" is out of range`);
  return { micros: micros === 0 ? 0 : micros, currency };
}

/** Format micros as a major-unit decimal string. Keeps at least `minDecimals` (default 2), up to 6. */
export function toMajor(money: Money, minDecimals = 2): string {
  if (!Number.isSafeInteger(money.micros)) throw new RangeError("micros must be a safe integer");
  const neg = money.micros < 0;
  const digits = String(Math.abs(money.micros)).padStart(MICROS + 1, "0");
  const whole = digits.slice(0, -MICROS);
  let frac = digits.slice(-MICROS);
  while (frac.length > minDecimals && frac.endsWith("0")) frac = frac.slice(0, -1);
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

export const money = { fromMajor, toMajor };

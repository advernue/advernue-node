import { describe, expect, it } from "vitest";
import { money } from "../src/index.js";

describe("money", () => {
  it.each([
    ["12.34", 12_340_000],
    ["0.1", 100_000],
    ["19.99", 19_990_000], // 19.99 * 1e6 is 19989999.999999996 in floats
    ["1.005", 1_005_000],
    ["0.000001", 1],
    ["-5", -5_000_000],
    ["-0.50", -500_000],
    ["0", 0],
    ["-0", 0],
  ])("fromMajor(%s)", (s, micros) => {
    expect(money.fromMajor(s, "USD")).toEqual({ micros, currency: "USD" });
  });
  it("accepts numbers via their decimal string, rejects floats it cannot represent", () => {
    expect(money.fromMajor(0.1, "EUR").micros).toBe(100_000);
    expect(() => money.fromMajor(1e-7, "EUR")).toThrow(RangeError);
    expect(() => money.fromMajor("1.0000001", "EUR")).toThrow(/decimal places/);
    expect(() => money.fromMajor("abc", "EUR")).toThrow(RangeError);
    expect(() => money.fromMajor("99999999999999999", "EUR")).toThrow(/range/);
  });
  it.each([
    [12_340_000, "12.34"],
    [100_000, "0.10"],
    [1, "0.000001"],
    [-500_000, "-0.50"],
    [0, "0.00"],
    [123_456_789, "123.456789"],
  ])("toMajor(%i)", (micros, s) => {
    expect(money.toMajor({ micros, currency: "USD" })).toBe(s);
  });
  it("round-trips", () => {
    for (const s of ["0.01", "123456.789012", "-7.25"]) expect(money.toMajor(money.fromMajor(s, "USD"), 2)).toBe(s);
  });
});

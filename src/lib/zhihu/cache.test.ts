import { describe, expect, it } from "vitest";
import { sha256Input, TtlCache } from "./cache";

describe("sha256Input", () => {
  it("is deterministic regardless of object key order", () => {
    expect(sha256Input("search", { q: "AI", count: 5 })).toBe(
      sha256Input("search", { count: 5, q: "AI" }),
    );
    expect(sha256Input("search", { q: "AI" })).toMatch(/^[a-f0-9]{64}$/);
  });

  it("separates cache scopes", () => {
    expect(sha256Input("zhihu", { q: "AI" })).not.toBe(sha256Input("global", { q: "AI" }));
  });
});

describe("TtlCache", () => {
  it("expires entries", () => {
    let now = 100;
    const cache = new TtlCache(50, () => now);
    cache.set("key", { value: 1 });
    expect(cache.get("key")).toEqual({ value: 1 });
    now = 150;
    expect(cache.get("key")).toBeUndefined();
  });
});

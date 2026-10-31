import { describe, expect, it } from "vitest";
import { isDuplicateExtensionCopy } from "../src/lib/duplicateGuard";

describe("isDuplicateExtensionCopy", () => {
  it("allows an unclaimed marker or the same runtime", () => {
    expect(isDuplicateExtensionCopy(undefined, "runtime-a")).toBe(false);
    expect(isDuplicateExtensionCopy("runtime-a", "runtime-a")).toBe(false);
  });

  it("rejects a Store and unpacked runtime sharing one Slack page", () => {
    expect(isDuplicateExtensionCopy("store-runtime", "unpacked-runtime")).toBe(true);
  });
});

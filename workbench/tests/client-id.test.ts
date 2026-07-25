import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientId } from "@/lib/client-id";

describe("createClientId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("works in older browsers without crypto.randomUUID", () => {
    vi.stubGlobal("crypto", {
      getRandomValues(bytes: Uint8Array) {
        bytes.fill(7);
        return bytes;
      },
    });

    expect(createClientId()).toBe("07070707070707070707070707070707");
  });
});

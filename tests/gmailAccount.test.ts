import { describe, expect, it } from "vitest";
import { normalizeAppPassword } from "@/lib/gmailAccount";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

describe("App Password handling", () => {
  it("accepts Google's spaced format and plain 16 letters", () => {
    expect(normalizeAppPassword("abcd efgh ijkl mnop")).toBe("abcdefghijklmnop");
    expect(normalizeAppPassword("ABCDEFGHIJKLMNOP")).toBe("abcdefghijklmnop");
  });

  it("rejects a normal password", () => {
    expect(normalizeAppPassword("MyGooglePassword1!")).toBeNull();
    expect(normalizeAppPassword("abcd efgh ijkl")).toBeNull();
  });

  it("encrypts so the stored value never contains the password, and decrypts back", () => {
    const stored = encryptSecret("abcdefghijklmnop");
    expect(stored).not.toContain("abcdefghijklmnop");
    expect(decryptSecret(stored)).toBe("abcdefghijklmnop");
  });

  it("returns null for tampered ciphertext instead of throwing", () => {
    const [version, iv, tag, data] = encryptSecret("abcdefghijklmnop").split(":");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;
    expect(decryptSecret([version, iv, tag, flipped.toString("base64")].join(":"))).toBeNull();
  });
});

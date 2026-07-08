import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "./safe-next";

test("safe-next: plain path is allowed", () => {
  assert.equal(safeNextPath("/dashboard"), "/dashboard");
});
test("safe-next: path with query string is allowed", () => {
  assert.equal(
    safeNextPath("/invitations/accept?token=abc"),
    "/invitations/accept?token=abc",
  );
});
test("safe-next: null input is rejected", () => {
  assert.equal(safeNextPath(null), null);
});
test("safe-next: empty string is rejected", () => {
  assert.equal(safeNextPath(""), null);
});
test("safe-next: absolute URL is rejected", () => {
  assert.equal(safeNextPath("https://evil.com"), null);
});
test("safe-next: protocol-relative URL is rejected", () => {
  assert.equal(safeNextPath("//evil.com"), null);
});
test("safe-next: backslash trick is rejected (WHATWG treats \\ as /)", () => {
  assert.equal(safeNextPath("/\\evil.com"), null);
});
test("safe-next: decoded control character (tab) is rejected", () => {
  // useSearchParams().get() returns the already percent-DECODED value, so a
  // "?next=/%09/evil.com" query param arrives here as the literal string
  // "/\t/evil.com". The WHATWG URL parser strips ASCII tab/CR/LF during
  // parsing, so without a control-char check this would resolve to
  // "/evil.com" off-origin. The control-char check rejects it.
  assert.equal(safeNextPath("/\t/evil.com"), null);
});
test("safe-next: still-encoded literal %09 is a same-origin path segment, so it is allowed", () => {
  // This is NOT the decoded form above — it's the literal 9-character string
  // "/%09/evil.com" (percent, 0, 9), with no actual control character in it.
  // safeNextPath never URL-decodes its input, and callers (router.push /
  // <a href>) treat it as a same-origin relative path whose first segment is
  // the literal text "%09" — it never leaves the origin. So this correctly
  // passes the guard; the dangerous case is only the already-decoded tab
  // above, which the control-character check catches.
  assert.equal(safeNextPath("/%09/evil.com"), "/%09/evil.com");
});

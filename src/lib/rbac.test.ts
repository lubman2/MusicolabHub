import { test } from "node:test";
import assert from "node:assert/strict";
import { can } from "./rbac";

test("owner can manage splits", () => {
  assert.equal(can("owner", "manage_split"), true);
});
test("viewer can download files", () => {
  assert.equal(can("viewer", "download_files"), true);
});
test("viewer cannot upload files", () => {
  assert.equal(can("viewer", "upload_files"), false);
});
test("commenter cannot moderate comments", () => {
  assert.equal(can("commenter", "moderate_comments"), false);
});

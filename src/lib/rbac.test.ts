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
test("editor can create version", () => {
  assert.equal(can("editor", "create_version"), true);
});
test("commenter cannot create version", () => {
  assert.equal(can("commenter", "create_version"), false);
});
test("owner can manage project lifecycle", () => {
  assert.equal(can("owner", "manage_project_lifecycle"), true);
});
test("editor cannot manage project lifecycle", () => {
  assert.equal(can("editor", "manage_project_lifecycle"), false);
});

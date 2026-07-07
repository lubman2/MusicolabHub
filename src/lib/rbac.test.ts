import { test } from "node:test";
import assert from "node:assert/strict";
import { can, GRANTABLE_MEMBER_ROLES, decideProjectPermission } from "./rbac";

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
test("no grantable member role list contains owner", () => {
  assert.equal(
    (GRANTABLE_MEMBER_ROLES as readonly string[]).includes("owner"),
    false,
  );
});
test("grantable member roles are exactly editor, commenter, viewer", () => {
  assert.deepEqual(
    [...GRANTABLE_MEMBER_ROLES].sort(),
    ["commenter", "editor", "viewer"],
  );
});

const base = { userId: "u1", globalRole: "user", projectOwnerId: "owner-1", memberRole: null } as const;

test("authz: global admin bypasses even when project is missing", () => {
  assert.equal(
    decideProjectPermission({ ...base, globalRole: "admin", projectOwnerId: null }, "manage_split"),
    true,
  );
});
test("authz: missing project denies non-admin", () => {
  assert.equal(
    decideProjectPermission({ ...base, projectOwnerId: null }, "view_project"),
    false,
  );
});
test("authz: project owner bypasses matrix without membership row", () => {
  assert.equal(
    decideProjectPermission({ ...base, projectOwnerId: "u1" }, "manage_project_lifecycle"),
    true,
  );
});
test("authz: non-member is denied even view_project", () => {
  assert.equal(decideProjectPermission(base, "view_project"), false);
});
test("authz: member role goes through the matrix — viewer downloads", () => {
  assert.equal(
    decideProjectPermission({ ...base, memberRole: "viewer" }, "download_files"),
    true,
  );
});
test("authz: member role goes through the matrix — viewer cannot upload", () => {
  assert.equal(
    decideProjectPermission({ ...base, memberRole: "viewer" }, "upload_files"),
    false,
  );
});
test("authz: member-role owner is owner-equivalent (documented invariant)", () => {
  assert.equal(
    decideProjectPermission({ ...base, memberRole: "owner" }, "manage_split"),
    true,
  );
});

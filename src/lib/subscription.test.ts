import { test } from "node:test";
import assert from "node:assert/strict";
import { decideSubscriptionAccess } from "./subscription";

const now = new Date("2026-07-07T12:00:00Z");
const future = new Date("2026-07-10T12:00:00Z");
const past = new Date("2026-07-01T12:00:00Z");

test("no subscription row denies with NO_SUBSCRIPTION", () => {
  assert.deepEqual(
    decideSubscriptionAccess({ status: null, accessLevel: "write", currentPeriodEnd: null, now }),
    { allowed: false, code: "NO_SUBSCRIPTION" },
  );
});
test("trialing and active allow write", () => {
  assert.equal(decideSubscriptionAccess({ status: "trialing", accessLevel: "write", currentPeriodEnd: null, now }).allowed, true);
  assert.equal(decideSubscriptionAccess({ status: "active", accessLevel: "write", currentPeriodEnd: null, now }).allowed, true);
});
test("past_due always allows read", () => {
  assert.equal(decideSubscriptionAccess({ status: "past_due", accessLevel: "read", currentPeriodEnd: null, now }).allowed, true);
});
test("past_due allows write inside the grace window", () => {
  assert.equal(decideSubscriptionAccess({ status: "past_due", accessLevel: "write", currentPeriodEnd: future, now }).allowed, true);
});
test("past_due denies write after the grace window", () => {
  assert.deepEqual(
    decideSubscriptionAccess({ status: "past_due", accessLevel: "write", currentPeriodEnd: past, now }),
    { allowed: false, code: "SUBSCRIPTION_PAST_DUE" },
  );
});
test("canceled and expired deny even read", () => {
  assert.deepEqual(
    decideSubscriptionAccess({ status: "canceled", accessLevel: "read", currentPeriodEnd: null, now }),
    { allowed: false, code: "SUBSCRIPTION_INACTIVE" },
  );
  assert.deepEqual(
    decideSubscriptionAccess({ status: "expired", accessLevel: "write", currentPeriodEnd: future, now }),
    { allowed: false, code: "SUBSCRIPTION_INACTIVE" },
  );
});

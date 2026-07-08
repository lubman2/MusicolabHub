import { test } from "node:test";
import assert from "node:assert/strict";
import { payoutAmountFor } from "./payments";

test("payout amount is payment minus platform fee", () => {
  assert.equal(payoutAmountFor({ amount: 10000, platformFee: 1000 }), 9000);
});
test("payout amount never goes negative", () => {
  assert.equal(payoutAmountFor({ amount: 500, platformFee: 1000 }), 0);
});
test("zero fee passes the full amount through", () => {
  assert.equal(payoutAmountFor({ amount: 10000, platformFee: 0 }), 10000);
});

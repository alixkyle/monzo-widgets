import assert from "node:assert/strict";
import test from "node:test";

import { applyMoneyBack } from "../worker/src/money-back.ts";

const dayStarts = [
  new Date("2026-07-24T23:00:00.000Z"),
  new Date("2026-07-25T23:00:00.000Z"),
];

function purchase(id, amount = -2000) {
  return {
    id,
    created: "2026-07-25T10:00:00.000Z",
    amount,
    currency: "GBP",
    description: "CAFE",
    scheme: "mastercard",
    merchant: { name: "Cafe" },
  };
}

function repayment(id, originalId) {
  return {
    id,
    created: "2026-07-25T12:00:00.000Z",
    amount: 1000,
    currency: "GBP",
    description: "Friend",
    scheme: "p2p_payment",
    merchant: null,
    metadata: originalId
      ? { original_transaction_id: originalId }
      : undefined,
  };
}

test("a linked bill-split repayment reduces the original purchase day", () => {
  const debit = purchase("purchase-1");
  const buckets = [{ debits: [debit], daily: [-2000, 0] }];

  applyMoneyBack([repayment("repayment-1", debit.id)], buckets, dayStarts);

  assert.deepEqual(buckets[0].daily, [-1000, 0]);
});

test("an unrelated P2P payment does not reduce spending", () => {
  const debit = purchase("purchase-1");
  const buckets = [{ debits: [debit], daily: [-2000, 0] }];

  applyMoneyBack([repayment("repayment-1")], buckets, dayStarts);

  assert.deepEqual(buckets[0].daily, [-2000, 0]);
});

test("a repayment cannot reduce a purchase below zero", () => {
  const debit = purchase("purchase-1", -500);
  const buckets = [{ debits: [debit], daily: [-500, 0] }];

  applyMoneyBack([repayment("repayment-1", debit.id)], buckets, dayStarts);

  assert.deepEqual(buckets[0].daily, [0, 0]);
});

test("linked bill-split repayments can be ignored", () => {
  const debit = purchase("purchase-1");
  const buckets = [{ debits: [debit], daily: [-2000, 0] }];

  applyMoneyBack(
    [repayment("repayment-1", debit.id)],
    buckets,
    dayStarts,
    { splitRepayments: "ignore" }
  );

  assert.deepEqual(buckets[0].daily, [-2000, 0]);
});

test("unlinked incoming payments can reduce the received day", () => {
  const debit = purchase("purchase-1");
  const buckets = [{ debits: [debit], daily: [-2000, 0] }];

  applyMoneyBack(
    [repayment("repayment-1")],
    buckets,
    dayStarts,
    { unlinkedIncoming: "received" }
  );

  assert.deepEqual(buckets[0].daily, [-1000, 0]);
});

test("card refunds can be ignored or applied on the refund day", () => {
  const debit = purchase("purchase-1");
  const refund = {
    ...purchase("refund-1", 1000),
    created: "2026-07-26T10:00:00.000Z",
  };
  const ignored = [{ debits: [debit], daily: [-2000, -500] }];
  const received = [{ debits: [debit], daily: [-2000, -500] }];

  applyMoneyBack([refund], ignored, dayStarts, { cardRefunds: "ignore" });
  applyMoneyBack([refund], received, dayStarts, {
    cardRefunds: "received",
  });

  assert.deepEqual(ignored[0].daily, [-2000, -500]);
  assert.deepEqual(received[0].daily, [-2000, 0]);
});

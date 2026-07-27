import assert from "node:assert/strict";
import test from "node:test";

import {
  amountForCategory,
  bucketByCategory,
  categoryShares,
  totalByCategory,
} from "../worker/src/buckets.ts";
import { applyMoneyBack } from "../worker/src/money-back.ts";
import { recentSpendWeeks, spendWeekLabel } from "../worker/src/monzo.ts";

const DAY = 24 * 60 * 60 * 1000;

// Two UK days: 25 July and 26 July 2026 (BST, so midnight is 23:00 UTC).
const dayStarts = [
  new Date("2026-07-24T23:00:00.000Z"),
  new Date("2026-07-25T23:00:00.000Z"),
];

function purchase(overrides) {
  return {
    id: "tx_1",
    created: "2026-07-25T10:00:00.000Z",
    amount: -2000,
    currency: "GBP",
    description: "CAFE",
    scheme: "mastercard",
    ...overrides,
  };
}

test("a transaction with no category at all is filed under general", () => {
  assert.deepEqual(categoryShares(purchase({})), [["general", -2000]]);
});

test("the merchant category is used when the transaction has none", () => {
  assert.deepEqual(
    categoryShares(purchase({ merchant: { category: "Eating_Out" } })),
    [["eating_out", -2000]]
  );
});

test("split transactions divide across their categories", () => {
  const shares = categoryShares(
    purchase({
      category: "groceries",
      categories: { groceries: -1500, shopping: -500 },
    })
  );

  assert.deepEqual(shares, [
    ["groceries", -1500],
    ["shopping", -500],
  ]);
  // The shares must add back up, or a bar would not match its own total.
  assert.equal(
    shares.reduce((sum, [, amount]) => sum + amount, 0),
    -2000
  );
});

test("categories are bucketed per day, biggest spender first", () => {
  const buckets = bucketByCategory(
    [
      purchase({ id: "tx_1", category: "eating_out", amount: -1000 }),
      purchase({
        id: "tx_2",
        category: "groceries",
        amount: -5000,
        created: "2026-07-26T09:00:00.000Z",
      }),
      purchase({
        id: "tx_3",
        category: "eating_out",
        amount: -1500,
        created: "2026-07-26T19:00:00.000Z",
      }),
    ],
    dayStarts
  );

  assert.deepEqual(
    buckets.map(([name, bucket]) => [name, bucket.daily]),
    [
      ["groceries", [0, -5000]],
      ["eating_out", [-1000, -1500]],
    ]
  );
});

test("the bills chart still reads a split transaction's bills share only", () => {
  const t = purchase({
    category: "bills",
    categories: { bills: -1200, groceries: -800 },
  });

  assert.equal(amountForCategory(t, "bills"), -1200);
  assert.equal(amountForCategory(t, "eating_out"), 0);
});

test("period totals add the buckets back up per category", () => {
  assert.deepEqual(
    totalByCategory([
      { eating_out: -1000, groceries: -500 },
      { eating_out: -250 },
    ]),
    { eating_out: -1250, groceries: -500 }
  );
});

test("transactions before the first bucket are left out", () => {
  const buckets = bucketByCategory(
    [purchase({ created: "2026-07-20T10:00:00.000Z", category: "shopping" })],
    dayStarts
  );

  assert.deepEqual(buckets, []);
});

test("a refund reduces the category of the purchase it reverses", () => {
  const original = purchase({
    id: "tx_original",
    category: "shopping",
    amount: -3000,
    merchant: { name: "Bookshop" },
  });
  const other = purchase({
    id: "tx_other",
    category: "groceries",
    amount: -4000,
    created: "2026-07-26T09:00:00.000Z",
  });
  const buckets = bucketByCategory([original, other], dayStarts);

  applyMoneyBack(
    [
      {
        ...original,
        id: "tx_refund",
        amount: 3000,
        created: "2026-07-26T12:00:00.000Z",
      },
    ],
    buckets.map(([, bucket]) => bucket),
    dayStarts
  );

  const daily = Object.fromEntries(
    buckets.map(([name, bucket]) => [name, bucket.daily])
  );
  // Shopping is cleared on the purchase day, not the day the money arrived,
  // and groceries is untouched.
  assert.deepEqual(daily.shopping, [0, 0]);
  assert.deepEqual(daily.groceries, [0, -4000]);
});

test("four rolling weeks are seven days apart and end today", () => {
  const now = new Date("2026-07-27T15:00:00.000Z");
  const weeks = recentSpendWeeks(4, now);

  assert.equal(weeks.length, 4);
  for (let i = 1; i < weeks.length; i++) {
    assert.equal(weeks[i].getTime() - weeks[i - 1].getTime(), 7 * DAY);
  }

  // The final block starts six days back, so it covers today as its seventh
  // day — the same "last 7 days" the weekly chart shows.
  assert.equal(weeks[3].toISOString(), "2026-07-20T23:00:00.000Z");
  assert.ok(now.getTime() - weeks[3].getTime() < 7 * DAY);
});

test("a rolling week is labelled by the day it ends on", () => {
  assert.equal(spendWeekLabel(new Date("2026-07-20T23:00:00.000Z")), "27 Jul");
});

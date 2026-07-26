# Monzo Widgets

Private, configurable Monzo balances and spending charts for the iPhone Home
Screen.

A small Worker runs in your own Cloudflare account, and Scriptable renders the
data as native widgets. Your Monzo tokens and widget key stay in infrastructure
you control.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/alixkyle/monzo-widgets/tree/main/worker)

**iPhone only: [follow the step-by-step mobile setup](IPHONE_SETUP.md).** It
explains the temporary Monzo callback address and requires no coding.

For terminal-based setup, see [SETUP.md](SETUP.md).

## Why a Worker instead of calling Monzo from the phone

Monzo rotates your refresh token on every use, and iOS kills and restarts
widgets unpredictably. If a rotation is interrupted mid-request the token is
lost for good and you have to re-authenticate by hand. Keeping the token dance
in one always-on place avoids that; the widget just fetches plain JSON.

## Layout

| Path                      | What it is                                    |
| ------------------------- | --------------------------------------------- |
| `worker/src/index.ts`     | HTTP routes: `/auth`, `/auth/callback`, `/summary` |
| `worker/src/monzo.ts`     | Monzo client and token refresh                |
| `widget/money-widget.js`  | The Scriptable widget                         |
| `widget/money-pots.js`    | Small total balance and pots widget           |
| `widget/money-week.js`    | Weekly Card, Transfers, and Flex chart        |
| `widget/money-bills-savings.js` | Weekly Bills and Savings chart         |
| `widget/money-settings.js` | Shared connection and widget preferences     |
| `widget/money-installer.js` | One-run iPhone installer                     |

## What `/summary` returns

All amounts are in minor units (pennies), as Monzo returns them.

```json
{
  "currency": "GBP",
  "spentToday": -2431,
  "balance": 128455,
  "totalBalance": 328455,
  "flex": { "balance": -15000 },
  "transactions": [
    { "id": "tx_...", "created": "...", "amount": -350, "name": "Pret", "category": "eating_out" }
  ],
  "since": "...",
  "updatedAt": "..."
}
```

`spentToday` is calculated from non-declined outgoing transactions since
midnight UK time. Internal savings-pot movements are excluded, and the
transaction list uses the same calendar-day boundary.

## Notes on Monzo's API

- This is a self-hosted personal project, not a hosted public banking service.
  Monzo's developer API is intended for your own account or a small set of
  explicitly allowed users.
- Access tokens last 6 hours; **refresh tokens are only issued to
  "Confidential" OAuth clients**. This trips up most setups.
- Five minutes after authenticating, history is limited to the last 90 days.
  Irrelevant for a "today" widget.
- Flex appears as `uk_monzo_flex` and its balance works, but its transaction
  feed is unreliable and `uk_monzo_flex_backing_loan` is permission-denied.
  Flex is reported as a separate balance only.

## Where Airtable fits

If you already sync Monzo to Airtable, keep it — it's a good long-term archive
and this widget doesn't touch it. A once-a-day sync just can't drive a live
"today" number, which is why the widget reads Monzo directly.

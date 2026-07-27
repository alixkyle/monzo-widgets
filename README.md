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
| `worker/src/index.ts`     | HTTP routes: `/auth`, `/auth/callback`, `/summary`, `/week`, `/weeks`, `/pots`, `/accounts` |
| `worker/src/monzo.ts`     | Monzo client and token refresh                |
| `worker/src/buckets.ts`   | Grouping transactions into chart bars, by day and by category |
| `worker/src/money-back.ts` | Crediting refunds against the purchase they reverse |
| `widget/money-widget.js`  | Monzo Today widget                            |
| `widget/money-pots.js`    | Monzo Balances & Pots widget                  |
| `widget/money-week.js`    | Monzo Spending weekly chart                   |
| `widget/money-week-categories.js` | Monzo Categories weekly chart         |
| `widget/money-month.js`   | Monzo 4 Weeks chart                           |
| `widget/money-bills-savings.js` | Monzo Bills & Savings weekly chart     |
| `widget/money-settings.js` | Monzo Settings                               |
| `widget/money-installer.js` | Monzo Installer                              |

## The two weekly charts

`Monzo Spending` and `Monzo Categories` cover the same seven days and print the
same total. They differ only in how each bar is split:

- **Monzo Spending** splits by how the money left the account — card, transfers
  to people, then Flex.
- **Monzo Categories** splits by Monzo's own categories — eating out,
  groceries, transport — the way the Spending tab in the Monzo app does. The
  five biggest categories of the week are named and the rest become "Other".

`Monzo 4 Weeks` uses the same category colours across four rolling seven-day
blocks, and its last bar covers the same seven days as the weekly charts.

The two normally print the same figure for that week. They can differ when a
refund arrives for a purchase more than seven days old: the four-week chart can
see the original purchase and credits the refund there, while the weekly chart
can only credit something inside its own window. This is the same reason two
`Monzo Spending` widgets on different `weeks` parameters can disagree.

Both category charts read the same settings as `Monzo Spending`, so excluding
bills or Flex changes all of them together.

## How updates reach people

The two halves of this project update by different routes, and they used to
drift apart badly.

The widgets update themselves: `money-installer.js` downloads them from this
repository every time it runs. The Worker did not, because the **Deploy to
Cloudflare** button *copies* this repository into the user's GitHub account
rather than forking it. There is no link back, so GitHub never offers "Sync
fork", and a Worker stayed frozen on whatever was published the day it was set
up — while the widgets kept moving forward and eventually called routes that
Worker had never heard of.

Two things close that gap:

- **`worker/.github/workflows/sync-upstream.yml`** ships inside the template,
  so it lands at the root of each user's copy. Once a day it pulls the current
  `worker/` directory from this repository and commits any change, which makes
  Cloudflare redeploy. Users can also run it on demand from the Actions tab.
- **The Worker's own setup page hands the workflow out**, because we cannot
  rely on the Deploy button being permitted to create `.github/workflows/` in
  a fresh repository. Step 5 of `/` shows the file as copyable text with the
  path to save it at, so a user whose copy did not receive it can add it in a
  couple of taps. The page also reads the newest `WORKER_VERSION` straight
  from this repository and says plainly whether that Worker is behind, which
  works whether or not the workflow ever ran.
- **`GET /version`** reports the Worker's API level, unauthenticated. The
  installer checks it before doing anything and, if the Worker is behind, says
  so and explains how to sync — rather than failing with a 404 from a route
  that did not exist yet. The widgets translate the same 404 into a readable
  message.

Bump `WORKER_VERSION` in `worker/src/index.ts` and `REQUIRED_WORKER_VERSION` in
`widget/money-installer.js` together whenever the widgets start depending on
something older Workers do not serve.

The sync deliberately leaves two things alone: `wrangler.toml`, because it
holds the Worker's name and therefore its `.workers.dev` address, and
`.github/`, because `GITHUB_TOKEN` is not allowed to push workflow files and
including it would make every sync fail the moment the workflow itself changed.

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

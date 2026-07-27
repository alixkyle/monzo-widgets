# Setup

One-time setup, about 20 minutes. Do the steps in order.

## 1. Make your Monzo client "Confidential"

Go to https://developers.monzo.com and open your OAuth client.

**Set the client to Confidential.** This is the step that matters most — Monzo
only issues refresh tokens to confidential clients, and without a refresh token
the widget stops working after 6 hours and can't recover on its own.

Set the redirect URI to (you'll get the real subdomain in step 3, come back and
correct it):

```
https://monzo-widgets.YOUR-SUBDOMAIN.workers.dev/auth/callback
```

Note your **Client ID** and **Client Secret**.

## 2. Install Wrangler and log in

```bash
cd worker
npm install
npx wrangler login
```

That opens a browser to create/connect a free Cloudflare account.

## 3. Deploy

```bash
npm run deploy
```

Cloudflare creates and binds the private `MONZO` KV storage automatically.
Wrangler prints your real Worker URL.

## 4. Set your secrets

Invent a long random string for `WIDGET_KEY` — it's the password that stops
anyone else reading your bank data from the Worker URL.

```bash
npx wrangler secret put MONZO_CLIENT_ID
npx wrangler secret put MONZO_CLIENT_SECRET
npx wrangler secret put WIDGET_KEY
```

Secrets are write-only, so a lost `WIDGET_KEY` cannot be read back. Run
`npx wrangler secret put WIDGET_KEY` again to overwrite it, then re-run the
Scriptable installer with the new value. The Monzo tokens live in KV, so
replacing the key does not disconnect your account.

Go back to step 1 and make sure the redirect URI in the Monzo portal matches
the Worker URL exactly, including `/auth/callback`.

## 5. Connect your Monzo account

Open the Worker URL in a browser and enter your widget key on its connection
page.

Monzo emails you a magic link. After following it, **open the Monzo app on your
phone and approve the access request** — the API returns 403 on everything until
you do.

Then check it works:

```
https://monzo-widgets.YOUR-SUBDOMAIN.workers.dev/summary?key=YOUR_WIDGET_KEY
```

You should see JSON with `spentToday`, `balance`, and today's `transactions`.

## 6. Add the widgets

1. Install **Scriptable** from the App Store (free).
2. Create the following scripts and paste in the matching files:

   | Scriptable name | Source file | Size |
   | --- | --- | --- |
   | `Monzo Settings` | [widget/money-settings.js](widget/money-settings.js) | Run in app |
   | `Monzo Today` | [widget/money-widget.js](widget/money-widget.js) | Any |
   | `Monzo Spending` | [widget/money-week.js](widget/money-week.js) | Medium |
   | `Monzo Categories` | [widget/money-week-categories.js](widget/money-week-categories.js) | Medium |
   | `Monzo 4 Weeks` | [widget/money-month.js](widget/money-month.js) | Medium |
   | `Monzo Bills & Savings` | [widget/money-bills-savings.js](widget/money-bills-savings.js) | Medium |
   | `Monzo Balances & Pots` | [widget/money-pots.js](widget/money-pots.js) | Small |

3. Run `Monzo Settings` and enter the Worker URL and `WIDGET_KEY` once.
4. Choose your category, Flex, day-boundary, total-balance, and pot options.
5. Run each widget once inside Scriptable to check it renders.
6. Long-press your home screen → **+** → **Scriptable** → pick a size →
   add it → long-press the new widget → **Edit Widget** → choose the
   corresponding script.

Medium and large sizes show the transaction list; small shows just the total.

Consider putting it on a **second home screen page** rather than page one — a
widget showing your balance is readable by anyone glancing at your phone.

## Troubleshooting

**"Monzo did not return a refresh token"** — the client isn't Confidential.
Fix it in the portal and redo step 6.

**403 from Monzo** — you haven't approved access in the Monzo app yet.

**Token refresh failed** — the refresh token was lost or revoked. Redo step 6.

**Flex is missing** — expected. Monzo exposes the Flex *balance* but its
transaction feed is unreliable, so only the balance is included, and it's kept
out of `spentToday` to avoid double-counting flexed purchases.

**Widget looks stale** — iOS decides refresh timing, typically every 5–15
minutes. Tapping the widget forces a refresh.

**Settings are not applying** — run `Monzo Settings` once and tap **Done**,
then run the affected widget inside Scriptable. The shared settings file lives
in Scriptable's iCloud folder and is read by every widget.

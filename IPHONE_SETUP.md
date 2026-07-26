# Set up Monzo Widgets using only an iPhone

No Mac, coding, or terminal is required. Allow around 15–20 minutes the first
time and follow the steps in order.

You will need:

- A Monzo account
- The free [Scriptable app](https://apps.apple.com/app/scriptable/id1405459188)
- Free GitHub and Cloudflare accounts
- Safari and access to your email

Each person should deploy their own private Worker. Never share Monzo client
secrets, widget keys, or a configured Scriptable settings file.

> **Why is GitHub needed?** Only because Cloudflare's one-tap deployment makes
> your own copy of the code through your GitHub account. You do not need to
> understand GitHub, upload anything, or give your friend access to this
> repository. Scriptable does not require a GitHub account.

## The whole setup

You will:

1. Make a Monzo client using a temporary callback address.
2. Tap the Cloudflare deploy button and paste in three values.
3. Replace the temporary address with the real address Cloudflare gives you.
4. Connect Monzo.
5. Run one installer in Scriptable.

## 1. Create the Monzo client

1. Open [developers.monzo.com](https://developers.monzo.com/) in Safari and
   sign in with Monzo.
2. Create a new OAuth client.
3. Name it `Monzo Widgets`.
4. Make the client **Confidential**.
5. For **Redirect URL**, paste:

   `https://example.com/auth/callback`

   This is deliberately temporary. Do not open it and do not connect Monzo
   with it. You will replace it with your real Cloudflare address in step 3.

6. Save the Client ID and Client Secret somewhere private. You will enter them
   into Cloudflare in the next step.

## 2. Deploy your private Worker

Tap the button:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/alixkyle/monzo-widgets/tree/main/worker)

1. Sign in to GitHub and Cloudflare when prompted. Creating both accounts is
   free.
2. Allow Cloudflare to make its own copy of `monzo-widgets`.
3. Accept the suggested repository and Worker names.
4. Enter the three requested secret values:

   - `MONZO_CLIENT_ID`: the Client ID from Monzo
   - `MONZO_CLIENT_SECRET`: the Client Secret from Monzo
   - `WIDGET_KEY`: a new private password you choose (use at least 20
     characters)

5. Save the widget key in the Passwords app—you will need the exact same value
   when installing the widgets.
6. Finish the deployment. Cloudflare creates and connects the private token
   storage automatically.

## 3. Connect Monzo

1. Open the new `workers.dev` URL shown by Cloudflare.
2. On the page headed **Monzo Widgets**, copy the full **Monzo Redirect URL**.
   It will look similar to:

   `https://monzo-widgets.example.workers.dev/auth/callback`

3. Return to your client at [developers.monzo.com](https://developers.monzo.com/)
   and replace `https://example.com/auth/callback` with the copied address.
4. Save the Monzo client and check the address ends in `/auth/callback`.
5. Return to the **Monzo Widgets** Worker page.
6. Enter the widget key you saved and tap **Connect Monzo**.
7. Follow the magic link Monzo emails you.
8. Open the Monzo app and approve the access request.

The connection page should now confirm that the account is connected.

> Do not continue if the temporary `example.com` address is still in Monzo.
> Replace it first; otherwise Monzo cannot return you to your private Worker.

## 4. Install every widget

1. Install and open
   [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) once so its
   iCloud Drive folder is created.
2. Open the
   [Money Installer file](https://raw.githubusercontent.com/alixkyle/monzo-widgets/main/widget/money-installer.js)
   in Safari.
3. Use Safari's Share button and choose **Save to Files**.
4. Save it in **iCloud Drive → Scriptable** as `Money Installer.js`.
5. Open Scriptable. Tap **Money Installer**, then tap the triangular Run button.
6. Enter the Worker URL without `/auth/callback` on the end. For example:

   `https://monzo-widgets.example.workers.dev`

7. Enter the same widget key you saved earlier. The installer verifies the connection,
   downloads every widget, and writes their shared settings.
8. Run **Money Settings** to review the defaults.

## 5. Add the Home Screen widgets

Long-press the Home Screen, tap **+**, choose Scriptable, and add:

| Widget | Recommended size |
| --- | --- |
| `Money App` | Small or medium |
| `Money Week` | Medium |
| `Money — bills & savings` | Medium |
| `Money — pots` | Small |

Long-press each new widget, choose **Edit Widget**, then select the matching
script.

## Settings

Run `Money Settings` whenever you want to change:

- Whether Bills and Savings are excluded from Money Week
- Whether Flex appears in weekly charts
- Midnight or Monzo's 04:00 day boundary
- Whether Flex debt is subtracted from Total Balance
- Whether zero-balance pots are hidden
- Whether Current Account and Flex rows are shown
- Whether linked bill-split repayments reduce the original purchase
- Whether unrelated incoming payments are ignored or reduce spending
- Whether card refunds apply to the purchase date, refund date, or are ignored
- Whether outgoing transfers are included, excluded, or limited to spending
  categories

The settings are stored in Scriptable's iCloud folder and apply to every widget.

## Updating later

Run `Money Installer` again. It replaces the widget code with the latest
version while preserving your connection and preferences.

## Troubleshooting

**Cloudflare asks for permission to create KV storage** — allow it. This is the
private storage used for rotating Monzo tokens.

**Monzo says the redirect URL is wrong** — copy it again from the Worker home
page. It must end in `/auth/callback` and match exactly.

**Do I keep the example.com redirect?** — no. It only lets you create the Monzo
client before Cloudflare has generated your real address. Replace it during
step 3, before tapping Connect Monzo.

**The Worker says Unauthorised** — the widget key entered on the Worker page or
in Money Installer does not exactly match the `WIDGET_KEY` Cloudflare secret.

**Monzo returns 403** — open Monzo and approve the developer access request.

**Widgets look stale** — iOS controls widget refresh timing. Run the widget
inside Scriptable to force an immediate check.

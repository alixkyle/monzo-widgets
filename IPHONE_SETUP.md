# Set up Monzo Widgets using only an iPhone

No Mac or terminal is required. Allow around 15–20 minutes the first time.

You will need:

- A Monzo account
- The free [Scriptable app](https://apps.apple.com/app/scriptable/id1405459188)
- Free GitHub and Cloudflare accounts
- Safari and access to your email

Each person should deploy their own private Worker. Never share Monzo client
secrets, widget keys, or a configured Scriptable settings file.

## 1. Create a Monzo developer client

1. Open [developers.monzo.com](https://developers.monzo.com/) in Safari and
   sign in with Monzo.
2. Create a new OAuth client.
3. Name it `Monzo Widgets`.
4. Make the client **Confidential**.
5. Use `https://example.com/auth/callback` as the redirect URL temporarily.
6. Save the Client ID and Client Secret somewhere private. You will enter them
   into Cloudflare in the next step.

## 2. Deploy your private Worker

Tap the button:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/alixkyle/monzo-widgets/tree/main/worker)

1. Sign in to GitHub and Cloudflare when prompted.
2. Accept the default repository and Worker names, or choose your own.
3. Enter the three requested secret values:

   - `MONZO_CLIENT_ID`: the Client ID from Monzo
   - `MONZO_CLIENT_SECRET`: the Client Secret from Monzo
   - `WIDGET_KEY`: a new long private password you choose

4. Save the widget key in the Passwords app—you will need the exact same value
   when installing the widgets.
5. Finish the deployment. Cloudflare creates and connects the private token
   storage automatically.

## 3. Connect Monzo

1. Open the new `workers.dev` URL shown by Cloudflare.
2. Copy the **Monzo Redirect URL** displayed on the page.
3. Return to your client at [developers.monzo.com](https://developers.monzo.com/)
   and replace the temporary redirect URL with the copied one.
4. Return to your Worker page.
5. Enter the widget key you chose and tap **Connect Monzo**.
6. Follow the magic link Monzo emails you.
7. Open the Monzo app and approve the access request.

The connection page should now confirm that the account is connected.

## 4. Install every widget

1. Install and open
   [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) once so its
   iCloud Drive folder is created.
2. Open the
   [Money Installer file](https://raw.githubusercontent.com/alixkyle/monzo-widgets/main/widget/money-installer.js)
   in Safari.
3. Use Safari's Share button and choose **Save to Files**.
4. Save it in **iCloud Drive → Scriptable** as `Money Installer.js`.
5. Open Scriptable and run **Money Installer**.
6. Enter the Worker URL and widget key. The installer verifies the connection,
   downloads every widget, and writes their shared settings.
7. Run **Money Settings** to review the defaults.

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

The settings are stored in Scriptable's iCloud folder and apply to every widget.

## Updating later

Run `Money Installer` again. It replaces the widget code with the latest
version while preserving your connection and preferences.

## Troubleshooting

**Cloudflare asks for permission to create KV storage** — allow it. This is the
private storage used for rotating Monzo tokens.

**Monzo says the redirect URL is wrong** — copy it again from the Worker home
page. It must end in `/auth/callback` and match exactly.

**The Worker says Unauthorised** — the widget key entered on the Worker page or
in Money Installer does not exactly match the `WIDGET_KEY` Cloudflare secret.

**Monzo returns 403** — open Monzo and approve the developer access request.

**Widgets look stale** — iOS controls widget refresh timing. Run the widget
inside Scriptable to force an immediate check.

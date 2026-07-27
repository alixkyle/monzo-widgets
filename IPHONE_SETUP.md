# Install Monzo Widgets on an iPhone

Follow these steps in order. You do not need a computer or any coding
knowledge. The first setup normally takes 15–20 minutes.

## Before you start

Install or create these first:

1. [Scriptable from the App Store](https://apps.apple.com/app/scriptable/id1405459188)
2. A free [GitHub account](https://github.com/signup)
3. A free [Cloudflare account](https://dash.cloudflare.com/sign-up)
4. Access to your Monzo app and email

GitHub is only used by Cloudflare to copy the widget code. You do not need to
upload anything or understand how GitHub works.

Keep all passwords and keys created below private.

## Step 1: Create the Monzo connection

1. Open [developers.monzo.com](https://developers.monzo.com/) in Safari.
2. Sign in with Monzo.
3. Tap **New OAuth Client**.
4. Enter these details:

   - **Name:** `Monzo Widgets`
   - **Confidentiality:** `Confidential`
   - **Redirect URL:** `https://example.com/auth/callback`

5. Save the client.
6. Copy the **Client ID** somewhere safe.
7. Copy the **Client Secret** somewhere safe.

The `example.com` address is temporary. Do not open it. You will replace it
with the real address in Step 3.

## Step 2: Deploy the widget service

Tap this button:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/alixkyle/monzo-widgets/tree/main/worker)

Then:

1. Sign in to GitHub if asked.
2. Sign in to Cloudflare if asked.
3. Allow Cloudflare to copy `monzo-widgets`.
4. Keep the suggested names.
5. Cloudflare will ask for three secret values. Enter:

   - **MONZO_CLIENT_ID:** the Client ID copied in Step 1
   - **MONZO_CLIENT_SECRET:** the Client Secret copied in Step 1
   - **WIDGET_KEY:** create a new private password containing at least 20
     characters

6. Save the `WIDGET_KEY` in the Passwords app. You must use exactly the same
   password again later.
7. Finish the deployment and wait for Cloudflare to show that it succeeded.
8. Open the new address ending in `.workers.dev`.

You should now see a page headed **Monzo Widgets**.

## Step 3: Add the real Monzo redirect address

This step replaces the temporary `example.com` address.

1. On the **Monzo Widgets** page, copy the address under
   **MONZO REDIRECT URL**.
2. Check that the copied address ends in `/auth/callback`.
3. Return to [developers.monzo.com](https://developers.monzo.com/).
4. Open the `Monzo Widgets` client created in Step 1.
5. Delete `https://example.com/auth/callback`.
6. Paste the new Cloudflare address in its place.
7. Save the Monzo client.

Do not continue until `example.com` has been replaced.

## Step 4: Connect your Monzo account

1. Return to the Cloudflare address ending in `.workers.dev`.
2. Enter the `WIDGET_KEY` saved in Step 2.
3. Tap **Connect Monzo**.
4. Open the sign-in link Monzo sends by email.
5. Open the Monzo app when asked.
6. Approve the access request.

The browser should confirm that Monzo is connected.

## Step 5: Install the Scriptable widgets

1. Open Scriptable once, then return to Safari. This creates its iCloud folder.
2. Open the
   [Money Installer file](https://raw.githubusercontent.com/alixkyle/monzo-widgets/main/widget/money-installer.js).
3. Tap Safari's **Share** button.
4. Tap **Save to Files**.
5. Choose **iCloud Drive → Scriptable**.
6. Save the file as `Money Installer.js`.
7. Open Scriptable.
8. Open **Money Installer** and tap the triangular Run button.
9. When asked for the **Worker URL**, enter the Cloudflare address ending in
   `.workers.dev`. Do not add `/auth/callback`.
10. When asked for the **Widget key**, enter the same `WIDGET_KEY` saved in
    Step 2.
11. Tap **Verify and install**.

The installer will add:

- `Money App`
- `Money Week`
- `Money — bills & savings`
- `Money — pots`
- `Money Settings`

Run **Money Settings** if you want to review the recommended defaults.

## Step 6: Put the widgets on the Home Screen

Add each widget separately:

1. Long-press an empty area of the Home Screen.
2. Tap **Edit**, then **Add Widget**.
3. Search for **Scriptable**.
4. Choose a size and tap **Add Widget**.
5. Long-press the new widget.
6. Tap **Edit Widget**.
7. Tap **Script**, then select the matching Money script.

Recommended sizes:

| Script | Size |
| --- | --- |
| `Money App` | Small or medium |
| `Money Week` | Medium |
| `Money — bills & savings` | Medium |
| `Money — pots` | Small |

Setup is complete.

## Change the settings later

Open Scriptable and run **Money Settings**. The options are grouped into:

- **Money App & Money Week**
- **Balances & Pots**
- **Advanced transaction handling**

Money App and Money Week use the same spending rules, so today's headline
matches today's bar.

## Install updates later

Run **Money Installer** again. It updates the scripts without removing the
Worker connection or widget preferences.

## If something goes wrong

**Monzo says the redirect URL is wrong**

Copy the Monzo Redirect URL from the Cloudflare page again. It must end in
`/auth/callback` and must exactly match the address saved at
[developers.monzo.com](https://developers.monzo.com/).

**The Worker says Unauthorised**

The `WIDGET_KEY` entered on the Cloudflare page does not exactly match the one
created in Step 2.

**Monzo returns 403**

Open the Monzo app and approve the developer access request.

**Money Installer cannot verify the connection**

Check that:

- Monzo was connected successfully in Step 4.
- The Worker URL ends in `.workers.dev` with nothing after it.
- The widget key is exactly the same as the `WIDGET_KEY` entered in Cloudflare.

**A widget looks out of date**

iOS chooses when Home Screen widgets refresh. Open its script in Scriptable
and run it to request fresh data immediately.

# Zibhoz Waitlist Page

Standalone landing page for the Zibhoz waitlist, designed to be deployed as a **separate Vercel project** at `https://zibhoz-waitlist.vercel.app`.

## Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import the `xtreemtechnology/zibhoz` repository.
2. Set the **Root Directory** to `waitlist` (this folder).
3. Leave Framework Preset as **Other** — no build step needed.
4. Click **Deploy**.

That's it. Vercel will serve `index.html` directly.

## Connecting a real backend

The form currently simulates submission with a short delay. To wire it up to a real backend (e.g. Mailchimp, Resend, Supabase, Airtable):

1. Replace the `setTimeout` block in `index.html` with a `fetch` call to your API endpoint.
2. Handle errors from the API and surface them via `showError(msg)`.

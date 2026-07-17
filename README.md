# DailyFlow

A calm, focused daily planner. Drag your favorite activities onto a live timeline, track
completion, and sync everywhere — free, no build step, no framework.

## Brand

| Role | Color |
|---|---|
| Deep Navy (primary) | `#1D2B63` |
| Royal Blue (secondary) | `#465E95` |
| Warm Gold (accent) | `#D9B362` |
| Ivory background | `#F7F3EA` |
| White background | `#FFFFFF` |

Design tokens live in [`css/tokens.css`](css/tokens.css) as CSS custom properties — change a
value there and it updates across the whole site.

## Files

```
index.html            Marketing landing page
app.html               The planner app (auth + timeline)
css/tokens.css          Design tokens (colors, gradients, spacing, type scale)
css/landing.css         Landing page styles
css/app.css             App styles
js/firebase-config.js   Firebase init (shared)
js/app.js                App logic (auth, Firestore listeners, rendering, drag-drop, modals)
firestore.rules          Security rules — each user only sees their own data
firestore.indexes.json   Firestore composite indexes (currently none needed)
firebase.json             Firebase CLI project config
.firebaserc                Points the Firebase CLI at project `dailyflow-33fb8`
```

## 1. Firebase project

This repo is already wired up to a Firebase project (`dailyflow-33fb8`) — the config in
[`js/firebase-config.js`](js/firebase-config.js) is filled in and ready to use. It's safe to keep
public: Firestore access is enforced by `firestore.rules`, not by hiding the config.

To point this at your **own** Firebase project instead:

1. Go to https://console.firebase.google.com → **Add project**.
2. **Build → Authentication → Get started** → enable **Email/Password** and **Google**.
3. **Build → Firestore Database → Create database** → start in **production mode**.
4. Click the **`</>`** (web app) icon on the project overview page → register app → copy the
   config object.
5. Paste it into the `firebaseConfig` object in `js/firebase-config.js`.
6. Update `.firebaserc` with your project ID.

## 2. Deploy the security rules

Install the Firebase CLI once:

```bash
npm install -g firebase-tools
firebase login
```

From this folder:

```bash
firebase deploy --only firestore:rules
```

## 3. Run locally

Google Sign-In requires `http://` or `https://`, not `file://`. Use any static server:

```bash
npx serve .
# or: python -m http.server 8000
```

Then visit `http://localhost:8000` (landing page) or `http://localhost:8000/app.html` directly.

## 4. Deploy — GitHub Pages (free)

1. Push this repo to GitHub.
2. Repo → **Settings → Pages → Source: Deploy from a branch** → branch `main`, folder `/ (root)`.
3. Your site goes live at `https://<username>.github.io/<repo>/`.
4. **Firebase Console → Authentication → Settings → Authorized domains** → add
   `<username>.github.io` so Google Sign-In works there.

### Alternative: Firebase Hosting

```bash
firebase init hosting
# public directory: .
# single-page app: No
firebase deploy --only hosting
```

Firebase gives you a URL like `https://dailyflow-33fb8.web.app` — already an authorized domain,
no extra setup needed.

## What the app does

- Landing page (`index.html`) introduces the product; every CTA links to `app.html`.
- Email/password + Google sign-in.
- Add **Favorites** (reusable activities with icon/color/duration) in the left sidebar.
- Drag a favorite onto the timeline to schedule it for that hour.
- Or use the **+** floating button to quick-add an activity with a custom time range.
- Check off activities as complete, or delete them.
- Dark mode toggle (saved in the browser).
- Everything syncs live to Firestore — only the signed-in user's own data is ever visible,
  enforced by `firestore.rules`.

## Extending it later

Everything lives in the `scheduleItems` Firestore collection, filtered by `date`, so adding
week/month views later just means changing the date filter in `startListeners()` inside
`js/app.js` — no restructuring needed.

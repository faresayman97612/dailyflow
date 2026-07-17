# DailyFlow — Simple Version (HTML + Firebase only)

No Next.js, no npm, no build step. One HTML file. Open it in a browser and it works.

## Files

- `index.html` — the entire app (HTML + CSS + JS in one file)
- `firestore.rules` — security rules so each user only sees their own data

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com → **Add project** → name it `dailyflow`.
2. **Build → Authentication → Get started**
   - Enable **Email/Password**
   - Enable **Google**
3. **Build → Firestore Database → Create database** → start in **production mode**.
4. Click the **`</>`** (web app) icon on the project overview page → register app.
5. Copy the config object Firebase gives you. It looks like:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "dailyflow-xxxx.firebaseapp.com",
  projectId: "dailyflow-xxxx",
  storageBucket: "dailyflow-xxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
```

## 2. Paste your config into `index.html`

Open `index.html`, find this block near the top of the `<script type="module">` section:

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

Replace it with the values from step 1. That's it — this is safe to make public; Firebase security comes from the rules file, not from hiding this config.

## 3. Deploy the security rules

Install the Firebase CLI once:

```bash
npm install -g firebase-tools
firebase login
```

From this folder:

```bash
firebase init firestore
# choose "Use an existing project" → select dailyflow
# when asked for rules file, point it at firestore.rules (or overwrite the generated one)

firebase deploy --only firestore:rules
```

## 4. Authorize your domain for login

If you're just opening `index.html` locally by double-clicking it, Google Sign-In may not work due to browser `file://` restrictions — use a simple local server instead:

```bash
npx serve .
# or: python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

Once you deploy somewhere real (see below), go to:
**Firebase Console → Authentication → Settings → Authorized domains** → add your domain (e.g. `yourname.github.io`).

## 5. Deploy — pick any ONE of these (all free)

### Option A: GitHub Pages (easiest)
1. Push this folder to a GitHub repo.
2. Repo → **Settings → Pages → Source: Deploy from a branch** → branch `main`, folder `/ (root)`.
3. Your site goes live at `https://<username>.github.io/<repo>/`.
4. Add that domain to Firebase's Authorized domains (step 4 above).

### Option B: Firebase Hosting (integrates natively, one command)
```bash
firebase init hosting
# public directory: .  (current folder)
# single-page app: No
firebase deploy --only hosting
```
Firebase gives you a URL like `https://dailyflow-xxxx.web.app` — no extra domain authorization needed since it's already a Firebase domain.

## What the app does

- Email/password + Google sign-in
- Add **Favorites** (reusable activities with icon/color/duration) in the left sidebar
- Drag a favorite onto the timeline to schedule it for that hour
- Or use the **+** floating button to quick-add an activity with a custom time range
- Check off activities as complete, or delete them
- Dark mode toggle (saved in the browser)
- Everything syncs live to Firestore — only the signed-in user's own data is ever visible, enforced by `firestore.rules`

## Extending it later

Everything lives in `scheduleItems` (one Firestore collection, filtered by `date`), so adding week/month views later just means changing the `date` filter in the `startListeners()` function — no restructuring needed.

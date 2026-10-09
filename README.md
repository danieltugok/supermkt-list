# Supermarket

Mobile-first PWA for a shared, real-time grocery list. Plain HTML/CSS/JS (no build step),
Firebase Authentication (Google) and Firebase Realtime Database.

## Features
- Tap an item to check it off; the other phone updates live.
- Items grouped by category; add items with an optional category.
- Edit mode (pencil icon): tap to rename/delete, hold and drag to reorder or move between categories.
- Eye icon hides bought items; circular-arrow icon starts a new trip (unchecks everything).
- Installable PWA with offline app shell and a cached copy of the last list.
- Google login, restricted to two allowed emails.

## Project files
| File | Purpose |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app (UI, auth, realtime logic, drag and drop) |
| `firebase-config.js` | Firebase web config (public values, safe to ship) |
| `database.rules.json` | Security rules: copy into Firebase console to publish (not read by the app) |
| `sw.js` | Service worker (offline). Bump `VERSION` after every deploy |
| `.htaccess` | Blocks `README.md`, `database.rules.json` and `.git` from being downloaded on the site |
| `manifest.webmanifest`, `icons/` | PWA install info and icons |

---

## Firebase

### Project info
- Firebase project name: **Playground**
- Project ID: `playground-4e469`
- Plan: **Spark** (free, no credit card)
- Console: https://console.firebase.google.com/project/playground-4e469
- Database URL: `https://playground-4e469-default-rtdb.firebaseio.com`
- Auth domain: `playground-4e469.firebaseapp.com`
- Web app config: in `firebase-config.js`. To see it again: Project settings (gear icon) > **General** tab > **Your apps** > web app > Config.
  These values are public by design. Security comes from Auth + the rules, not from hiding them.
- Never share or commit the **database secret** (Project settings > Service accounts) or any service-account JSON/private key.

### Services in use
- **Authentication**: Google sign-in only.
- **Realtime Database**: the shopping list.
- Not used: Firestore, Storage, Hosting (the site is hosted on Hostinger).

### Data model
Everything lives under `/items`. One child per item, keyed by an auto-generated ID:

    /items/{id}
      name:       string, 1-60 chars       e.g. "Almond milk"
      category:   string, up to 40 chars   "" = no category
      bought:     boolean                  true = checked off (teal)
      order:      number (optional)        position inside its category (set when you drag)
      updatedBy:  string                   first name of who changed it last
      updatedAt:  number                   timestamp (ms)

The earlier version of the site stored data under `/shoppingList`. That data is untouched but
**not readable by the app or by the new rules**. A one-time migration into `/items` is a planned follow-up.

### Who can access (security rules)
`database.rules.json` denies everything by default and allows read/write on `/items` only for
signed-in, email-verified Google accounts whose email is in the rules file
(the two emails listed inside `database.rules.json`). It also validates the shape of each item.

**Rules are NOT part of the website.** Changing the file does nothing until you publish it:
1. Firebase console > **Realtime Database** > **Rules** tab.
2. Replace the contents with the contents of `database.rules.json`.
3. Click **Publish**.

**To add or remove a person:** edit the emails in `database.rules.json` (they appear in both `.read` and `.write`),
then publish as above. They must sign in with that exact Google email.

### How to log in and check things later
**Check or edit the data**
- Console > **Realtime Database** > **Data** tab. Expand `items` to see every item. You can edit values
  or delete entries right there (changes show up live in the app).
- The console is read/write for you as project owner regardless of the rules.

**Backup / export**
- Data tab > three-dot menu on the node you want (top level for everything, or `items`) > **Export JSON**.
- Import (restore) is the same menu > **Import JSON**.

**See who has logged in**
- Console > **Authentication** > **Users** tab. You can disable or delete a user there.

**Check usage / limits**
- Realtime Database > **Usage** tab. Spark plan limits and what happens when exceeded:
  https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
  (A grocery list for two people is far below any limit.)

**Authorized domains (needed for Google login on each website address)**
- Authentication > **Settings** > **Authorized domains**. `localhost` is already there.
- Add every address the app runs on, e.g. `olivedrab-whale-418761.hostingersite.com` and any custom domain.
  Missing domain = login fails with `auth/unauthorized-domain`.

> The console menu is grouped by category in newer layouts: Authentication is under **Security** (Segurança).
> You can also use the search box ("Pesquise produtos") at the top left.

---

## Run locally
The app needs to be served over `http://localhost` (not opened as a file).

    # from WSL / Linux / macOS
    cd /path/to/supermkt
    python3 -m http.server 8080
    # or: npx serve . -l 8080

Open http://localhost:8080 (Google login works on `localhost` without extra setup).

## Deploy to Hostinger
1. Upload everything in this folder (the contents, not the folder itself) to `public_html` via hPanel > File Manager or FTP.
   `README.md` and `database.rules.json` are not needed on the server (the included `.htaccess` blocks them from public download).
2. Add the Hostinger address to Firebase **Authorized domains** (see above).
3. Bump `VERSION` in `sw.js` (e.g. `v3` -> `v4`) before uploading, so phones pick up the update.
   The service worker serves cached files first and updates in the background, so open the app twice to see changes.

## Install on phone
- Android (Chrome): menu > **Install app** / **Add to Home screen**.
- iPhone (Safari): **Share** > **Add to Home Screen**.

## Troubleshooting
| Symptom | Cause / fix |
|---|---|
| `auth/configuration-not-found` | Authentication was never initialized. Console > Authentication > **Get started**, then enable Google. |
| `auth/unauthorized-domain` | The site address isn't in Authentication > Settings > Authorized domains. |
| "No access" screen after login | That Google email isn't in `database.rules.json`, or the rules weren't published. |
| Login popup blocked / does nothing | Allow popups for the site; the app falls back to a redirect on some browsers. |
| List empty after login | New app reads `/items`. Old data is in `/shoppingList` (not migrated yet). |
| Changes not showing after deploy | Bump `VERSION` in `sw.js`, then reload twice (or clear site data). |
| Warning "rules are public" in console | Rules were never replaced. Publish `database.rules.json`. |

## Ideas for later
- Migrate old `/shoppingList` data into `/items`.
- Drag to reorder categories.
- Custom domain + HTTPS check on Hostinger.

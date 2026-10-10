# Changelog

Versioning: `MAJOR.MINOR.PATCH`. Bump MINOR for a bundle of new features, PATCH for bug fixes.
The version lives in ONE place: `APP_VERSION` at the top of `sw.js`. Bump it on every deploy.

## 1.1.2
- Fix: app files are now requested with a version in the URL (`?v=`), so Hostinger's CDN/server cache can't serve stale CSS/JS.

## 1.1.1 - 2026-10-10
- Fix: stale cached files could mix an old app.js with a new index.html and crash the app.
- New "Reset app" safety net: if the app fails to start, a red bar offers a one-tap cache reset (stays signed in).
- Server now tells browsers/CDN to always revalidate the app files (.htaccess).

## 1.1.0 - 2026-10-10
- Category filter (funnel icon): choose which categories are shown. Saved per device, new categories show by default,
  a badge shows how many are hidden, and the filter is paused in edit mode.
- Version label always shows in the footer (with a fallback when an older service worker can't report it).

## 1.0.0 - 2026-10-10
First versioned release.
- Shared real-time grocery list (Firebase Realtime Database), Google login, installable PWA with offline support.
- Items grouped by category; tap to check off; hold 2 seconds to delete (tap the X).
- Edit mode (pencil): rename, change category, drag and drop to reorder or move between categories.
- Category dropdown with existing categories and a clear (X) button; category header X deletes a category (two taps, with Undo).
- Hide bought items and "New trip" icons with tooltips.
- Share list (owner): invite and remove people from the app.
- Version label in the footer and a "new version available" banner.

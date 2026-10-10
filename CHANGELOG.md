# Changelog

Versioning: `MAJOR.MINOR.PATCH`. Bump MINOR for a bundle of new features, PATCH for bug fixes.
The version lives in ONE place: `APP_VERSION` at the top of `sw.js`. Bump it on every deploy.

## 1.0.0 - 2026-10-10
First versioned release.
- Shared real-time grocery list (Firebase Realtime Database), Google login, installable PWA with offline support.
- Items grouped by category; tap to check off; hold 2 seconds to delete (tap the X).
- Edit mode (pencil): rename, change category, drag and drop to reorder or move between categories.
- Category dropdown with existing categories and a clear (X) button; category header X deletes a category (two taps, with Undo).
- Hide bought items and "New trip" icons with tooltips.
- Share list (owner): invite and remove people from the app.
- Version label in the footer and a "new version available" banner.

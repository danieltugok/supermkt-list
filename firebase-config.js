// Public web config (safe to ship). Access is protected by Auth + database.rules.json.
export const firebaseConfig = {
  apiKey: "AIzaSyBcbxBIfw5gRHCcN2fzDGg0zP36D1tGrt0",
  authDomain: "playground-4e469.firebaseapp.com",
  databaseURL: "https://playground-4e469-default-rtdb.firebaseio.com",
  projectId: "playground-4e469",
  storageBucket: "playground-4e469.firebasestorage.app",
  messagingSenderId: "428555858523",
  appId: "1:428555858523:web:1c0923931f66419745c57e"
};

// Who sees the Share button. This only controls the UI: the real permission check
// is in database.rules.json (keep the two lists in sync).
export const ownerEmails = ["danieltugok@gmail.com"];

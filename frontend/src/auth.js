// "Sign in with GitHub" through Firebase Authentication. Firebase runs the GitHub OAuth popup and hands
// back a GitHub access token; the local server keeps it in memory and acts on GitHub as that user.
import { initializeApp } from "firebase/app";
import { getAuth, GithubAuthProvider, signInWithPopup, signOut as firebaseSignOut } from "firebase/auth";
import { api, post } from "./api.js";
import { firebaseConfig } from "./firebase-config.js";

export const configured = !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("PASTE");
const auth = configured ? getAuth(initializeApp(firebaseConfig)) : null;

// Resolves when signed in (or the popup was closed); throws an Error with a readable message otherwise.
export async function signIn() {
  const provider = new GithubAuthProvider();
  provider.addScope("repo"); // list and clone private repos, push branches, fork
  provider.setCustomParameters({ prompt: "select_account" }); // always show GitHub's account picker
  try {
    const result = await signInWithPopup(auth, provider);
    const token = GithubAuthProvider.credentialFromResult(result)?.accessToken;
    if (!token) throw new Error("GitHub sign-in returned no access token.");
    await post("/api/session", { github_token: token });
  } catch (e) {
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return;
    throw new Error(e.code === "auth/unauthorized-domain"
      ? "Open this page as http://localhost:8000 (Firebase does not accept 127.0.0.1)."
      : "Sign-in failed: " + (e.message || e.code));
  }
}

export async function signOut() {
  await api("/api/session", { method: "DELETE" });
  if (auth) await firebaseSignOut(auth);
}

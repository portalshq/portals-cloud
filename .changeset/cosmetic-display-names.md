---
"@portalshq/capability-identity": minor
---

Add same-tab sign-in and user-chosen display names to the auth-gateway client.

- `startAuthSession` accepts an optional `postLoginRedirectUri`: when the gateway's `AUTH_LOGIN_REDIRECT_ALLOWLIST` covers its origin, the hosted login sends the browser back to that URI with `session_code`/`state` handoff params instead of an interstitial HTML page, so apps can sign in without a popup or polling loop.
- `setUserDisplayName(userToken, displayName)` sets the caller's chat-visible name. Cosmetic only: the gateway rejects email-shaped values and account names, and allows setting it exactly once. IdP-derived names (profile name, email, login name) are no longer written as display names.

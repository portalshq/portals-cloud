---
"@portalshq/capability-identity": minor
---

Add guest trial support: `guest-token.ts` (HMAC `gt1.` token mint/verify/header extraction), `GuestUsageStore` (durable per-app vote/reaction caps and upgrade claims), `SignupBonusStore` (once-ever welcome-bonus claims), and `IdentityProvider.resolveActor` returning a user-or-guest discriminated union.

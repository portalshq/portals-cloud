// Kept as the existing entry point, but catalog terms now come from published
// Sanity package specifications. The delegated script is dry-run by default;
// pass --apply explicitly to update the Stripe test catalog.
await import('./sync-stripe-pricing')

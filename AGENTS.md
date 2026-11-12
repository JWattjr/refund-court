# Refund Court

Use exact pinned GenLayer SDK and runner versions. Never deposit without the owner's explicit cumulative budget approval. Never submit the Portal form. Desktop only; do not add mobile layouts or run mobile checks.

Every GenLayer submission must include each deployed contract's direct canonical GenLayer Explorer address URL as a separate evidence entry, type `GenLayer Explorer Contract`. Verify against `/api/address` with type `CONTRACT`, and verify transaction links against `/api/transactions`, using a browser user agent. Use `lib/explorer.ts` for every GenLayer link.

`npm run verify:proof` must fail while any required live case or native credit proof is missing. Never substitute test fixtures or mocked cases for live proof. Keep credentials under ignored `.secrets/` and server-only environment variables. Export of this project's generated demo seller key to its named Vercel project has owner approval; other keys do not.

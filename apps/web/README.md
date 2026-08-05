# apps/web (Angular)

The web app provides registered auth screens, the guest channel dashboard, Realtime chat, and LiveKit audio/screen-share UI.

## Local setup

From the repository root:

```bash
pnpm install
pnpm dev:web
```

The public Supabase URL and anonymous key live in Angular environment configuration. They are safe to expose only because every guest query uses the current user's JWT and database RLS. Never add the Supabase service-role key here.

## Data paths

- NestJS: auth initialization/refresh/logout and LiveKit token/status requests.
- Supabase browser client: `guest` RLS reads, RPC mutations, and Realtime.
- LiveKit client: direct audio and screen-share media.

Generated database types are composed in `src/app/core/supabase/database.types.ts`; do not hand-write parallel guest row or RPC interfaces.

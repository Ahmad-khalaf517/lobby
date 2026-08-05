# Docker development

Docker is optional. It provides Node.js 22 and pnpm 11.18.0 inside the containers; the existing host-based pnpm workflow remains unchanged.

## Prerequisites and initial setup

Install Docker Desktop (Windows/macOS) or Docker Engine with the Compose plugin (Linux). From the repository root, create the backend environment file:

```bash
cp apps/api/.env.example apps/api/.env
```

On PowerShell, use:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

Fill in these server-only values in `apps/api/.env`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

`PORT=3000` and `CORS_ORIGIN=http://localhost:4200` are already represented by Compose. Never expose `SUPABASE_SERVICE_ROLE_KEY` to the Angular application or commit `apps/api/.env`.

Lobby uses hosted Supabase and LiveKit Cloud. Compose intentionally does not start PostgreSQL, Supabase, LiveKit, Redis, or any other infrastructure service. Apply `supabase/schema.sql` to the configured Supabase project as described by the existing API setup.

## Start, stop, and rebuild

Start both applications from the repository root:

```bash
docker compose up --build
```

After the first build, start them without rebuilding:

```bash
docker compose up
```

Useful lifecycle commands:

```bash
docker compose logs -f
docker compose logs -f api
docker compose logs -f web
docker compose down
docker compose build --no-cache
```

Run only one application (Compose still creates the shared network):

```bash
docker compose up --build api
docker compose up --build web
```

To recreate the dependency layers from scratch, run `docker compose build --no-cache` and then `docker compose up`. Package changes require an image rebuild because dependencies are deliberately installed in the image instead of copied from the host.

`docker compose down -v` also removes Compose-managed volumes. The current setup has no database or dependency volume, so it does not delete hosted Supabase data; nevertheless, treat `-v` as destructive if named data volumes are added later.

## URLs and networking

| Service                    | Host URL                | Container address |
| -------------------------- | ----------------------- | ----------------- |
| Angular development server | `http://localhost:4200` | `http://web:4200` |
| NestJS API                 | `http://localhost:3000` | `http://api:3000` |

The browser is outside Docker, so Angular uses `http://localhost:3000` for NestJS auth and LiveKit-token requests. Guest channel data and Realtime traffic go directly from the browser to the configured public Supabase URL. Docker service names such as `api` resolve only inside the Compose network.

The API has an HTTP health check against `/`. The frontend does not wait for it because the Angular dev server can start safely while the API is initializing; requests made before the API is ready simply fail and can be retried.

## Live reload and cross-platform behavior

Compose bind-mounts application source and the shared package source, while container-owned `node_modules` remain untouched. Each container runs the shared TypeScript compiler in watch mode alongside its application:

- Angular uses polling every 1,000 ms for reliable Docker Desktop file events.
- NestJS uses TypeScript's dynamic polling because Docker Desktop did not reliably forward native file events to its watcher.
- Changes under `apps/web/src`, `apps/web/public`, `apps/api/src`, `apps/api/test`, or `packages/shared/src` do not require an image rebuild.
- Changes to package manifests, lockfiles, Dockerfiles, Angular/Nest configuration, or other non-mounted files require `docker compose up --build`.

On Windows, keep the repository in a Docker Desktop file-shared location. If changes are slow to appear, confirm that the relevant drive is shared, then restart Docker Desktop and recreate the containers. Polling is already enabled for Angular, so no host Node.js setting is needed.

## Run without Docker

The original local workflow remains available and uses the root workspace lockfile:

```bash
pnpm install
pnpm dev
```

Individual local commands remain `pnpm dev:api` and `pnpm dev:web`. Local development reads the same ignored `apps/api/.env` file.

## Production image targets

Both Dockerfiles include an optional non-root `production` target. Compose intentionally selects `development`. To build the production images manually:

```bash
docker build --target production -f apps/api/Dockerfile -t lobby-api:local .
docker build --target production -f apps/web/Dockerfile -t lobby-web:local .
```

The API production image listens on port 3000 and still requires the backend environment variables. The Angular SSR production image listens on port 4000.

## Troubleshooting

- **Compose says `apps/api/.env` is missing:** copy `.env.example` as shown above and provide the required hosted-service credentials.
- **The API exits during startup:** inspect `docker compose logs api`; the API intentionally fails when either required Supabase value is absent.
- **A browser request uses `api:3000`:** Docker service names resolve only inside the Compose network. Use `localhost:3000` from the browser, or use the Docker-only relative proxy paths.
- **Port 3000 or 4200 is already in use:** stop the conflicting local process or container before starting Compose.
- **A dependency is missing after editing `package.json`:** rebuild with `docker compose up --build`; use `docker compose build --no-cache` for a complete dependency reset.
- **Source changes are not detected:** check the bind mounts with `docker compose config`, then review the Windows/macOS file-sharing notes above.

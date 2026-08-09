# Guest call load test

`apps/web/scripts/guest-call-load-test.mjs` exercises the real Lobby guest integration path:

```text
registered owner -> Lobby login -> 50-person guest channel
anonymous participant -> Lobby anonymous auth -> guest.join_channel RPC
participant cookie -> Lobby /livekit/token -> LiveKit Node client
one Playwright observer -> actual Lobby Guest Room UI -> checkpoint screenshots
```

It does not mint privileged LiveKit tokens or use the Supabase service-role key. The runner creates
a temporary 60-minute channel, closes it during cleanup, and leaves anonymous-user deletion to the
existing cleanup job.

## Safety

Run only against a local API connected to a development/test Supabase and LiveKit project. The
runner refuses to start without `LOBBY_LOAD_TEST_CONFIRM=development`, and it rejects non-local API
URLs unless `LOBBY_LOAD_ALLOW_REMOTE_API=true` is explicitly set. The evidence observer applies the
same restriction to the web URL unless `LOBBY_LOAD_ALLOW_REMOTE_WEB=true` is explicitly set.

LiveKit Cloud usage counts against the selected project's allowances. Never place credentials or
tokens in this repository or the command itself; export them in the shell or load an ignored local
environment file.

## Prerequisites

- The API is running and configured with development/test Supabase and LiveKit credentials.
- The web app is running so the Playwright observer can open the actual Guest Room dashboard.
- Anonymous Supabase sign-in is enabled for the test project.
- The test project's anonymous-auth rate limit allows at least 58 sign-ins for the default run
  (50 initial clients, participant 51, two contenders across three race rounds, and one browser
  observer).
- A confirmed registered test account exists so Lobby can create a room with capacity 50.
- The test machine can sustain at least 50 WebRTC connections.
- Playwright Chromium is installed once for the web workspace:

  ```bash
  pnpm --filter web exec playwright install chromium
  ```

Required environment variables:

```text
LOBBY_LOAD_TEST_CONFIRM=development
LOBBY_LOAD_TEST_EMAIL=<registered test account>
LOBBY_LOAD_TEST_PASSWORD=<test account password>
SUPABASE_URL=<development/test Supabase URL>
SUPABASE_PUBLISHABLE_KEY=<public client key>
```

The API defaults to `http://127.0.0.1:3000`, and the UI defaults to `http://localhost:4200` to match
the Angular development API hostname and browser cookie scope. Override them with
`LOBBY_LOAD_API_URL` and `LOBBY_LOAD_WEB_URL`.

## Run

From the repository root:

```bash
pnpm dev:api
pnpm dev:web
pnpm --filter web load-test:guest-call -- --run
```

As an alternative to shell exports, put only the runner variables above in a root
`.load-test.env` file (it is covered by the existing `*.env` ignore rule), then run:

```bash
pnpm --dir apps/web exec node --env-file=../../.load-test.env scripts/guest-call-load-test.mjs --run
```

On Windows PowerShell installations that block `pnpm.ps1`, use `pnpm.cmd` in place of `pnpm`.

To smoke-test the real browser observer with one temporary room and no LiveKit load, run:

```bash
pnpm --dir apps/web exec node --env-file=../../.load-test.env scripts/guest-call-load-test.mjs --smoke
```

Running without `--run` or `--smoke` is safe and prints help without generating traffic.

Useful tuning variables:

| Variable                         |      Default | Purpose                                           |
| -------------------------------- | -----------: | ------------------------------------------------- |
| `LOBBY_LOAD_AUTH_CONCURRENCY`    |            4 | Concurrent anonymous-session and membership setup |
| `LOBBY_LOAD_CONNECT_CONCURRENCY` |            1 | Serialized LiveKit startup on native Windows SDK  |
| `LOBBY_LOAD_AUDIO_PUBLISHERS`    |            3 | Clients publishing silent microphone audio        |
| `LOBBY_LOAD_STABILITY_SECONDS`   |           10 | Hold duration at 40 participants                  |
| `LOBBY_LOAD_RACE_ROUNDS`         |            3 | Repetitions of the 49/50 two-user race            |
| `LOBBY_LOAD_CHURN_ROUNDS`        |            3 | Repeated simultaneous leave/rejoin rounds         |
| `LOBBY_LOAD_CHURN_PARTICIPANTS`  |            5 | Participants cycled per churn round               |
| `LOBBY_LOAD_SETTLE_TIMEOUT_MS`   |        25000 | Time allowed for API and SDK counts to converge   |
| `LOBBY_LOAD_WEB_URL`             |     local UI | Guest Room URL used by the browser observer       |
| `LOBBY_LOAD_EVIDENCE_DIR`        | test results | Evidence root relative to `apps/web`              |
| `LOBBY_LOAD_EVIDENCE`            |       `true` | Set to `false` to explicitly skip visual evidence |

The process exits non-zero on any capacity, identity, count, reconnect, chat-access, unexpected
disconnect, or evidence failure. Screenshot failures are recorded without stopping the core load
assertions. The JSON report includes timestamps, requested and peak capacity, unique simulated
clients, successful and rejected connections, participant 51, race/reconnect/churn results, resource
observations, evidence status, and overall pass/fail. Cleanup runs on both success and ordinary test
failure.

## Visual evidence

One headless Playwright browser joins the same temporary channel through the real Guest Room UI. It
stays outside the LiveKit call so all 50 call slots remain available to the Node clients. Screenshots
are taken only after the API count and a connected LiveKit Node client's participant map agree and
the UI has displayed that same count.

Each run writes to a timestamped, ignored directory under:

```text
apps/web/test-results/guest-call-load-test/<run timestamp>/
```

The full run produces `01-40-participants.png` through `10-load-test-success.png`, plus
`load-test-report.json` and `load-test-summary.md`. The smoke run produces
`00-observer-smoke.png` and the two reports. Generated evidence is ignored by Git and must not
contain credentials, tokens, cookies, or authorization headers.

## What is verified

- Checkpoints at 40/50, 45/50, 49/50, and 50/50 through both the Lobby call-status endpoint and a
  connected LiveKit client's participant map.
- Unique LiveKit identities and stable counts.
- Participant 51 rejection while chat remains usable, followed by successful admission after a
  slot opens.
- Repeated simultaneous 49/50 races, where exactly one contender wins.
- Race contenders run in isolated Node processes so their genuinely simultaneous LiveKit connects
  do not share the Windows native SDK handle table. Tokens are sent over private process IPC, not
  command arguments, environment variables, reports, or screenshots.
- Forced LiveKit full reconnects using the SDK's test scenario.
- Repeated simultaneous disconnect/reconnect churn using fresh Lobby-issued tokens and the same
  Lobby membership identities.
- Peak process CPU and resident memory during the run, so obvious local resource spikes are visible
  in the JSON report alongside client and count failures.

## Separate LiveKit CLI test

The `lk` CLI was not installed when this runner was added. If it is installed later and the current
version exposes `lk load-test`, that command can be used as a separate infrastructure/media test.
It bypasses Lobby authentication, guest membership, NestJS token issuance, and application-level
capacity handling, so its results must not be reported as the Lobby integration result.

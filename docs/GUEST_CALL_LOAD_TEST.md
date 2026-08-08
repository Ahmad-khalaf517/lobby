# Guest call load test

`apps/web/scripts/guest-call-load-test.mjs` exercises the real Lobby guest integration path:

```text
registered owner -> Lobby login -> 50-person guest channel
anonymous participant -> Lobby anonymous auth -> guest.join_channel RPC
participant cookie -> Lobby /livekit/token -> LiveKit Node client
```

It does not mint privileged LiveKit tokens or use the Supabase service-role key. The runner creates
a temporary 60-minute channel, closes it during cleanup, and leaves anonymous-user deletion to the
existing cleanup job.

## Safety

Run only against a local API connected to a development/test Supabase and LiveKit project. The
runner refuses to start without `LOBBY_LOAD_TEST_CONFIRM=development`, and it rejects non-local API
URLs unless `LOBBY_LOAD_ALLOW_REMOTE_API=true` is explicitly set.

LiveKit Cloud usage counts against the selected project's allowances. Never place credentials or
tokens in this repository or the command itself; export them in the shell or load an ignored local
environment file.

## Prerequisites

- The API is running and configured with development/test Supabase and LiveKit credentials.
- Anonymous Supabase sign-in is enabled for the test project.
- The test project's anonymous-auth rate limit allows at least 57 sign-ins for the default run
  (50 initial clients, participant 51, and two contenders across three race rounds).
- A confirmed registered test account exists so Lobby can create a room with capacity 50.
- The test machine can sustain at least 50 WebRTC connections.

Required environment variables:

```text
LOBBY_LOAD_TEST_CONFIRM=development
LOBBY_LOAD_TEST_EMAIL=<registered test account>
LOBBY_LOAD_TEST_PASSWORD=<test account password>
SUPABASE_URL=<development/test Supabase URL>
SUPABASE_PUBLISHABLE_KEY=<public client key>
```

The API defaults to `http://127.0.0.1:3000`. Override it with `LOBBY_LOAD_API_URL`.

## Run

From the repository root:

```bash
pnpm dev:api
pnpm --filter web load-test:guest-call -- --run
```

As an alternative to shell exports, put only the runner variables above in a root
`.load-test.env` file (it is covered by the existing `*.env` ignore rule), then run:

```bash
pnpm --filter web exec node --env-file=../../.load-test.env scripts/guest-call-load-test.mjs --run
```

Running without `--run` is safe and prints help without generating traffic.

Useful tuning variables:

| Variable                         | Default | Purpose                                           |
| -------------------------------- | ------: | ------------------------------------------------- |
| `LOBBY_LOAD_AUTH_CONCURRENCY`    |       4 | Concurrent anonymous-session and membership setup |
| `LOBBY_LOAD_CONNECT_CONCURRENCY` |       5 | Concurrent LiveKit connections                    |
| `LOBBY_LOAD_AUDIO_PUBLISHERS`    |       3 | Clients publishing silent microphone audio        |
| `LOBBY_LOAD_STABILITY_SECONDS`   |      10 | Hold duration at 40 participants                  |
| `LOBBY_LOAD_RACE_ROUNDS`         |       3 | Repetitions of the 49/50 two-user race            |
| `LOBBY_LOAD_CHURN_ROUNDS`        |       3 | Repeated simultaneous leave/rejoin rounds         |
| `LOBBY_LOAD_CHURN_PARTICIPANTS`  |       5 | Participants cycled per churn round               |
| `LOBBY_LOAD_SETTLE_TIMEOUT_MS`   |   25000 | Time allowed for API and SDK counts to converge   |

The process exits non-zero on any capacity, identity, count, reconnect, chat-access, or unexpected
disconnect failure. Its JSON report includes unique simulated clients plus successful and failed
connection attempts across the full scenario. Cleanup runs on both success and ordinary test
failure.

## What is verified

- Checkpoints at 40/50, 45/50, 49/50, and 50/50 through both the Lobby call-status endpoint and a
  connected LiveKit client's participant map.
- Unique LiveKit identities and stable counts.
- Participant 51 rejection while chat remains usable, followed by successful admission after a
  slot opens.
- Repeated simultaneous 49/50 races, where exactly one contender wins.
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

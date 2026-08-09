import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';
import { clearInterval, clearTimeout, setInterval, setTimeout } from 'node:timers';
import { fileURLToPath, URL } from 'node:url';

import {
  AudioFrame,
  AudioSource,
  dispose,
  LocalAudioTrack,
  Room,
  RoomEvent,
  SimulateScenarioKind,
  TrackPublishOptions,
  TrackSource,
} from '@livekit/rtc-node';
import { createClient } from '@supabase/supabase-js';
import {
  AnonymousAuthRequestSchema,
  AuthSessionResponseSchema,
  CallStatusResponseSchema,
  CallTokenRequestSchema,
  CallTokenResponseSchema,
  GuestChannelCreateRequestSchema,
  GuestChannelCreateResponseSchema,
  LoginRequestSchema,
} from '@lobby/shared';
import { GuestCallEvidenceObserver } from './guest-call-load-test-observer.mjs';

const CALL_CAPACITY = 50;
const PRIMARY_PARTICIPANTS = 40;
const CHECKPOINTS = [40, 45, 49, 50];
const WEB_PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RACE_WORKER_PATH = fileURLToPath(new URL('./guest-call-race-worker.mjs', import.meta.url));
const FULL_ERROR_PATTERN =
  /call.+full|room.+full|max(?:imum)? participants|participant limit|resource exhausted/i;

class ApiRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

class CookieJar {
  #cookies = new Map();

  absorb(headers) {
    const values =
      typeof headers.getSetCookie === 'function'
        ? headers.getSetCookie()
        : [headers.get('set-cookie')].filter(Boolean);

    for (const value of values) {
      const pair = value.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      this.#cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  header() {
    return [...this.#cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
  }
}

class ResourceMonitor {
  #timer = null;
  #lastCpu = process.cpuUsage();
  #lastTime = process.hrtime.bigint();
  #startRss = process.memoryUsage().rss;
  #maxRss = this.#startRss;
  #maxCpuPercent = 0;
  #samples = 0;

  start() {
    this.#timer = setInterval(() => this.#sample(), 1_000);
    this.#timer.unref();
  }

  stop() {
    this.#sample();
    if (this.#timer) clearInterval(this.#timer);
    const finalRss = process.memoryUsage().rss;
    return {
      samples: this.#samples,
      startRssMiB: bytesToMiB(this.#startRss),
      maxRssMiB: bytesToMiB(this.#maxRss),
      finalRssMiB: bytesToMiB(finalRss),
      maxProcessCpuPercent: Number(this.#maxCpuPercent.toFixed(1)),
    };
  }

  #sample() {
    const now = process.hrtime.bigint();
    const elapsedMicros = Number(now - this.#lastTime) / 1_000;
    const usage = process.cpuUsage(this.#lastCpu);
    if (elapsedMicros > 0) {
      this.#maxCpuPercent = Math.max(
        this.#maxCpuPercent,
        ((usage.user + usage.system) / elapsedMicros) * 100,
      );
    }
    this.#lastCpu = process.cpuUsage();
    this.#lastTime = now;
    this.#maxRss = Math.max(this.#maxRss, process.memoryUsage().rss);
    this.#samples += 1;
  }
}

function bytesToMiB(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(1));
}

function numberSetting(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be a whole number between ${min} and ${max}.`);
  }
  return value;
}

function readConfig() {
  const apiUrl = (process.env.LOBBY_LOAD_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
  const webUrl = (process.env.LOBBY_LOAD_WEB_URL ?? 'http://localhost:4200').replace(/\/$/, '');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  const ownerEmail = process.env.LOBBY_LOAD_TEST_EMAIL;
  const ownerPassword = process.env.LOBBY_LOAD_TEST_PASSWORD;

  if (process.env.LOBBY_LOAD_TEST_CONFIRM !== 'development') {
    throw new Error(
      'Refusing to start. Set LOBBY_LOAD_TEST_CONFIRM=development after verifying every target is non-production.',
    );
  }
  if (!isLocalUrl(apiUrl) && process.env.LOBBY_LOAD_ALLOW_REMOTE_API !== 'true') {
    throw new Error(
      'LOBBY_LOAD_API_URL must be localhost. Set LOBBY_LOAD_ALLOW_REMOTE_API=true only for an explicitly approved test API.',
    );
  }
  if (!isLocalUrl(webUrl) && process.env.LOBBY_LOAD_ALLOW_REMOTE_WEB !== 'true') {
    throw new Error(
      'LOBBY_LOAD_WEB_URL must be localhost. Set LOBBY_LOAD_ALLOW_REMOTE_WEB=true only for an explicitly approved test UI.',
    );
  }
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY) are required.',
    );
  }
  if (!ownerEmail || !ownerPassword) {
    throw new Error(
      'LOBBY_LOAD_TEST_EMAIL and LOBBY_LOAD_TEST_PASSWORD must identify a registered development/test user.',
    );
  }

  return {
    apiUrl,
    webUrl,
    supabaseUrl,
    supabaseKey,
    ownerEmail,
    ownerPassword,
    authConcurrency: numberSetting('LOBBY_LOAD_AUTH_CONCURRENCY', 4, { min: 1, max: 10 }),
    connectConcurrency: numberSetting('LOBBY_LOAD_CONNECT_CONCURRENCY', 1, {
      min: 1,
      max: 10,
    }),
    audioPublishers: numberSetting('LOBBY_LOAD_AUDIO_PUBLISHERS', 3, { min: 0, max: 8 }),
    stabilitySeconds: numberSetting('LOBBY_LOAD_STABILITY_SECONDS', 10, {
      min: 1,
      max: 300,
    }),
    raceRounds: numberSetting('LOBBY_LOAD_RACE_ROUNDS', 3, { min: 1, max: 10 }),
    churnRounds: numberSetting('LOBBY_LOAD_CHURN_ROUNDS', 3, { min: 1, max: 10 }),
    churnParticipants: numberSetting('LOBBY_LOAD_CHURN_PARTICIPANTS', 5, {
      min: 1,
      max: 15,
    }),
    requestTimeoutMs: numberSetting('LOBBY_LOAD_REQUEST_TIMEOUT_MS', 30_000, {
      min: 1_000,
      max: 120_000,
    }),
    settleTimeoutMs: numberSetting('LOBBY_LOAD_SETTLE_TIMEOUT_MS', 25_000, {
      min: 2_000,
      max: 120_000,
    }),
    evidenceEnabled: process.env.LOBBY_LOAD_EVIDENCE !== 'false',
    evidenceRoot: process.env.LOBBY_LOAD_EVIDENCE_DIR,
  };
}

function isLocalUrl(value) {
  try {
    const url = new URL(value);
    return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function createRunId(startedAt) {
  return startedAt.replace(/[:.]/g, '-');
}

function resolveEvidenceDirectory(config, startedAt) {
  const root = config.evidenceRoot
    ? isAbsolute(config.evidenceRoot)
      ? config.evidenceRoot
      : resolve(WEB_PACKAGE_ROOT, config.evidenceRoot)
    : resolve(WEB_PACKAGE_ROOT, 'test-results', 'guest-call-load-test');
  return resolve(root, createRunId(startedAt));
}

function reportPath(value) {
  return relative(WEB_PACKAGE_ROOT, value).replaceAll('\\', '/');
}

function createReport({ mode, startedAt, evidenceEnabled, evidenceDirectory }) {
  return {
    mode,
    environment: 'development/test',
    testStartedAt: startedAt,
    testCompletedAt: null,
    overallResult: 'RUNNING',
    loadTestResult: mode === 'full' ? 'RUNNING' : 'NOT_RUN',
    requestedCapacity: CALL_CAPACITY,
    requestedPrimaryParticipants: mode === 'full' ? PRIMARY_PARTICIPANTS : 0,
    peakConnectedParticipants: 0,
    uniqueSimulatedParticipants: 0,
    successfulPrimaryConnections: 0,
    failedPrimaryConnections: 0,
    successfulConnectionAttempts: 0,
    failedConnectionAttempts: 0,
    rejectedConnectionAttempts: 0,
    finalParticipantCount: 0,
    fortyOfFifty: false,
    fiftyOfFifty: false,
    participant51: 'not-run',
    raceCondition: 'not-run',
    reconnect: 'not-run',
    churn: 'not-run',
    errors: [],
    countInconsistencies: [],
    resourceObservations: null,
    evidence: {
      enabled: evidenceEnabled,
      result: evidenceEnabled ? 'PENDING' : 'SKIPPED',
      observer: evidenceEnabled ? 'not-started' : 'disabled',
      directory: reportPath(evidenceDirectory),
      screenshots: [],
      errors: [],
    },
  };
}

function verifiedMarkdownItem(verified, label) {
  return `- [${verified ? 'x' : ' '}] ${label}`;
}

function createMarkdownSummary(report) {
  const participant51Rejected = report.participant51.startsWith('rejected at 50/50');
  const participant51Admitted = report.participant51.includes('joined successfully');
  const racePassed = report.raceCondition !== 'not-run';
  const reconnectPassed = report.reconnect !== 'not-run';
  const churnPassed = report.churn !== 'not-run';
  const evidenceLines = report.evidence.screenshots.map((name) => `- ${name}`);
  evidenceLines.push('- load-test-report.json');

  return `# Lobby Guest Call Load Test

## Result

**${report.overallResult}**

## Environment

Development/Test only

## Capacity

- Configured maximum: ${report.requestedCapacity}
- Peak observed: ${report.peakConnectedParticipants} / ${report.requestedCapacity}
- Final observed: ${report.finalParticipantCount} / ${report.requestedCapacity}

## Verified

${verifiedMarkdownItem(report.fortyOfFifty, '40 participants connected')}
${verifiedMarkdownItem(report.peakConnectedParticipants >= 45, '45 participants connected')}
${verifiedMarkdownItem(report.peakConnectedParticipants >= 49, '49 participants connected')}
${verifiedMarkdownItem(report.fiftyOfFifty, '50 participants connected')}
${verifiedMarkdownItem(participant51Rejected, 'Participant 51 rejected')}
${verifiedMarkdownItem(participant51Rejected, 'Chat remained available after rejection')}
${verifiedMarkdownItem(participant51Admitted, 'Slot reopened after a participant left')}
${verifiedMarkdownItem(participant51Admitted, 'Participant 51 admitted after the slot reopened')}
${verifiedMarkdownItem(racePassed, 'Concurrent 49/50 race behaved correctly')}
${verifiedMarkdownItem(reconnectPassed, 'Reconnect test passed')}
${verifiedMarkdownItem(churnPassed, 'Churn test passed')}
${verifiedMarkdownItem(
  report.countInconsistencies.length === 0 && report.fiftyOfFifty,
  'LiveKit identities and counts remained consistent',
)}

## Evidence

${evidenceLines.join('\n')}

## Errors

${
  [...report.errors, ...report.evidence.errors].length > 0
    ? [...report.errors, ...report.evidence.errors].map((error) => `- ${error}`).join('\n')
    : '- None'
}
`;
}

async function writeEvidenceReports(report, evidenceDirectory) {
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    resolve(evidenceDirectory, 'load-test-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    resolve(evidenceDirectory, 'load-test-summary.md'),
    createMarkdownSummary(report),
    'utf8',
  );
}

function line(message = '') {
  process.stdout.write(`${message}\n`);
}

function readErrorMessage(body, fallback) {
  if (typeof body === 'string') return body;
  if (typeof body !== 'object' || body === null) return fallback;
  const message = Reflect.get(body, 'message');
  if (Array.isArray(message)) return message.filter((item) => typeof item === 'string').join(' ');
  return typeof message === 'string' ? message : fallback;
}

async function apiRequest(config, jar, path, options, schema) {
  const controller = new globalThis.AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await globalThis.fetch(`${config.apiUrl}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(jar.header() ? { cookie: jar.header() } : {}),
        ...options.headers,
      },
      signal: controller.signal,
    });
    jar.absorb(response.headers);

    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!response.ok) {
      throw new ApiRequestError(
        response.status,
        readErrorMessage(body, `Lobby API request failed with HTTP ${response.status}.`),
      );
    }
    return schema.parse(body);
  } finally {
    clearTimeout(timeout);
  }
}

function createUserSupabase(config, accessToken) {
  return createClient(config.supabaseUrl, config.supabaseKey, {
    accessToken: async () => accessToken,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function loginOwner(config) {
  const jar = new CookieJar();
  const body = LoginRequestSchema.parse({
    email: config.ownerEmail,
    password: config.ownerPassword,
  });
  const session = await apiRequest(
    config,
    jar,
    '/auth/login',
    { method: 'POST', body: JSON.stringify(body) },
    AuthSessionResponseSchema,
  );
  if (session.user.isAnonymous) throw new Error('The load-test owner must be a registered user.');
  return { jar, session };
}

async function createChannel(config, owner) {
  const request = GuestChannelCreateRequestSchema.parse({
    name: `Capacity test ${new Date().toISOString()}`,
    maxParticipants: CALL_CAPACITY,
    lifetimeMinutes: 60,
  });
  const channel = await apiRequest(
    config,
    owner.jar,
    '/guest/channels',
    { method: 'POST', body: JSON.stringify(request) },
    GuestChannelCreateResponseSchema,
  );
  return { ...channel, name: request.name };
}

async function prepareParticipant(config, channel, ordinal) {
  const jar = new CookieJar();
  const authRequest = AnonymousAuthRequestSchema.parse({});
  const session = await apiRequest(
    config,
    jar,
    '/auth/anonymous',
    { method: 'POST', body: JSON.stringify(authRequest) },
    AuthSessionResponseSchema,
  );
  if (!session.user.isAnonymous) {
    throw new Error(`Participant ${ordinal} did not receive a unique anonymous session.`);
  }

  const supabase = createUserSupabase(config, session.accessToken);
  const { data, error } = await supabase.schema('guest').rpc('join_channel', {
    p_code: channel.code,
    p_display_name: `Load Guest ${String(ordinal).padStart(3, '0')}`,
  });
  if (error)
    throw new Error(`Participant ${ordinal} could not join the guest channel: ${error.message}`);
  const membership = data[0];
  if (!membership) throw new Error(`Participant ${ordinal} received no guest membership.`);

  return {
    ordinal,
    jar,
    supabase,
    membership,
    room: null,
    identity: null,
    audio: null,
    externalConnection: null,
    intentionalDisconnect: false,
    unexpectedDisconnects: [],
    successfulConnectionAttempts: 0,
    failedConnectionAttempts: 0,
  };
}

async function mintCallToken(config, participant, channelId) {
  const request = CallTokenRequestSchema.parse({ channelId });
  return apiRequest(
    config,
    participant.jar,
    '/livekit/token',
    { method: 'POST', body: JSON.stringify(request) },
    CallTokenResponseSchema,
  );
}

async function connectParticipant(config, participant, channelId) {
  try {
    const response = await mintCallToken(config, participant, channelId);
    return await connectParticipantWithToken(participant, response);
  } catch (error) {
    participant.failedConnectionAttempts += 1;
    throw error;
  }
}

async function connectParticipantWithToken(participant, response) {
  const room = new Room();

  room.on(RoomEvent.Disconnected, (reason) => {
    if (!participant.intentionalDisconnect) {
      participant.unexpectedDisconnects.push(String(reason));
    }
  });

  try {
    await room.connect(response.livekitUrl, response.token, {
      autoSubscribe: false,
      dynacast: true,
    });
    const identity = room.localParticipant?.identity;
    if (!identity)
      throw new Error(`Participant ${participant.ordinal} connected without an identity.`);
    if (participant.identity !== null && participant.identity !== identity) {
      throw new Error(`Participant ${participant.ordinal} changed LiveKit identity on reconnect.`);
    }

    participant.identity = identity;
    participant.room = room;
    participant.intentionalDisconnect = false;
    participant.successfulConnectionAttempts += 1;
    return participant;
  } catch (error) {
    participant.intentionalDisconnect = true;
    await room.disconnect().catch(() => undefined);
    participant.intentionalDisconnect = false;
    throw error;
  }
}

async function disconnectParticipant(participant) {
  await stopAudio(participant);
  if (participant.externalConnection) {
    const externalConnection = participant.externalConnection;
    participant.externalConnection = null;
    await externalConnection.close();
    return;
  }
  if (!participant.room) return;

  participant.intentionalDisconnect = true;
  const room = participant.room;
  participant.room = null;
  try {
    await room.disconnect();
  } finally {
    participant.intentionalDisconnect = false;
  }
}

async function startAudio(participant) {
  const localParticipant = participant.room?.localParticipant;
  if (!localParticipant || participant.audio) return;

  const sampleRate = 48_000;
  const channels = 1;
  const samplesPerChannel = 960;
  const source = new AudioSource(sampleRate, channels);
  const track = LocalAudioTrack.createAudioTrack(`load-mic-${participant.ordinal}`, source);
  const options = new TrackPublishOptions();
  options.source = TrackSource.SOURCE_MICROPHONE;
  const publication = await localParticipant.publishTrack(track, options);
  const frame = new AudioFrame(
    new Int16Array(samplesPerChannel * channels),
    sampleRate,
    channels,
    samplesPerChannel,
  );
  let capturePending = false;
  const timer = setInterval(() => {
    if (capturePending) return;
    capturePending = true;
    void source
      .captureFrame(frame)
      .catch((error) => participant.unexpectedDisconnects.push(`audio: ${describeError(error)}`))
      .finally(() => {
        capturePending = false;
      });
  }, 20);

  participant.audio = { source, track, publication, timer };
}

async function stopAudio(participant) {
  const audio = participant.audio;
  if (!audio) return;
  participant.audio = null;
  clearInterval(audio.timer);

  try {
    if (participant.room?.localParticipant && audio.publication.sid) {
      await participant.room.localParticipant.unpublishTrack(audio.publication.sid, false);
    }
  } catch {
    // Room disconnection may already have stopped the publication.
  }
  await audio.track.close().catch(() => undefined);
}

function connectedParticipants(participants) {
  return participants.filter((participant) => participant.room?.isConnected === true);
}

async function getCallStatus(config, owner, channelId) {
  return apiRequest(
    config,
    owner.jar,
    `/channels/${channelId}/call-status`,
    { method: 'GET' },
    CallStatusResponseSchema,
  );
}

async function waitForCount(config, owner, channelId, participants, expected, label, report) {
  const startedAt = Date.now();
  let lastApiCount = -1;
  let lastSdkCount = -1;

  while (Date.now() - startedAt < config.settleTimeoutMs) {
    const status = await getCallStatus(config, owner, channelId);
    lastApiCount = status.participants;
    const observer = connectedParticipants(participants)[0];
    lastSdkCount = observer ? observer.room.remoteParticipants.size + 1 : 0;
    report.peakConnectedParticipants = Math.max(
      report.peakConnectedParticipants,
      lastApiCount,
      lastSdkCount,
    );

    if (status.maxParticipants !== CALL_CAPACITY) {
      throw new Error(
        `Lobby reported capacity ${status.maxParticipants}; expected ${CALL_CAPACITY}.`,
      );
    }
    if (lastApiCount === expected && lastSdkCount === expected) {
      assertUniqueIdentities(observer, expected);
      line(`✓ ${label}: ${expected}/${CALL_CAPACITY} (API and LiveKit SDK agree)`);
      return status;
    }
    await delay(250);
  }

  throw new Error(
    `${label} did not settle at ${expected}/${CALL_CAPACITY}; API=${lastApiCount}, SDK=${lastSdkCount}.`,
  );
}

function assertUniqueIdentities(observer, expected) {
  const localIdentity = observer?.room.localParticipant?.identity;
  const identities = [localIdentity, ...(observer?.room.remoteParticipants.keys() ?? [])].filter(
    (identity) => typeof identity === 'string',
  );
  if (identities.length !== expected || new Set(identities).size !== expected) {
    throw new Error(
      `Expected ${expected} unique connected identities; observed ${identities.length} identities and ${new Set(identities).size} unique values.`,
    );
  }
}

async function mapWithConcurrency(items, concurrency, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;
  let firstError = null;

  async function worker() {
    while (firstError === null) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = await callback(items[index], index);
      } catch (error) {
        firstError ??= error;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  if (firstError !== null) throw firstError;
  return results;
}

async function prepareRange(config, channel, start, end, participantRegistry) {
  const ordinals = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  return mapWithConcurrency(ordinals, config.authConcurrency, async (ordinal) => {
    const participant = await prepareParticipant(config, channel, ordinal);
    participantRegistry.push(participant);
    return participant;
  });
}

async function connectBatch(config, channel, participants) {
  await mapWithConcurrency(participants, config.connectConcurrency, (participant) =>
    connectParticipant(config, participant, channel.channelId),
  );
}

async function verifyGuestAccess(participant, channelId) {
  const { data: channel, error: channelError } = await participant.supabase
    .schema('guest')
    .from('channels')
    .select('id,status,max_call_participants')
    .eq('id', channelId)
    .single();
  if (channelError || channel?.status !== 'active') {
    throw new Error(
      `Rejected participant lost guest-channel access: ${channelError?.message ?? 'inactive channel'}`,
    );
  }

  const { error: messageError } = await participant.supabase.schema('guest').rpc('create_message', {
    p_channel_id: channelId,
    p_content: 'Capacity test: chat remains available while the call is full.',
    p_client_message_id: randomUUID(),
  });
  if (messageError)
    throw new Error(`Rejected participant could not use chat: ${messageError.message}`);
}

async function attemptConnection(config, participant, channelId) {
  try {
    await connectParticipant(config, participant, channelId);
    return { ok: true, participant, error: null };
  } catch (error) {
    return { ok: false, participant, error: describeError(error) };
  }
}

function raceWorkerEnvironment() {
  const allowedKeys = [
    'LOCALAPPDATA',
    'PATH',
    'Path',
    'SYSTEMROOT',
    'SystemRoot',
    'TEMP',
    'TMP',
    'USERPROFILE',
  ];
  return Object.fromEntries(
    allowedKeys
      .filter((key) => typeof process.env[key] === 'string')
      .map((key) => [key, process.env[key]]),
  );
}

function closeRaceWorker(child, timeoutMs) {
  return new Promise((resolveClose) => {
    if (child.exitCode !== null || !child.connected) {
      resolveClose();
      return;
    }

    const finish = () => {
      clearTimeout(timeout);
      child.off('exit', finish);
      child.off('message', onMessage);
      resolveClose();
    };
    const onMessage = (message) => {
      if (message?.type === 'closed') finish();
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish();
    }, timeoutMs);
    child.once('exit', finish);
    child.on('message', onMessage);
    child.send({ type: 'disconnect' });
  });
}

function attemptIsolatedRaceConnection(participant, tokenResponse, timeoutMs) {
  const child = fork(RACE_WORKER_PATH, [], {
    env: raceWorkerEnvironment(),
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let stderr = '';
  child.stderr?.on('data', (chunk) => {
    stderr = `${stderr}${String(chunk)}`.slice(-2_000);
  });

  return new Promise((resolveAttempt) => {
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveAttempt(outcome);
    };
    const timeout = setTimeout(() => {
      participant.failedConnectionAttempts += 1;
      child.kill();
      finish({
        ok: false,
        participant,
        error: `Race contender timed out after ${timeoutMs}ms.${stderr ? ` ${stderr.trim()}` : ''}`,
      });
    }, timeoutMs);

    child.on('message', (message) => {
      if (message?.type === 'connected') {
        participant.identity = message.identity;
        participant.successfulConnectionAttempts += 1;
        participant.externalConnection = {
          close: () => closeRaceWorker(child, timeoutMs),
        };
        finish({ ok: true, participant, error: null });
      } else if (message?.type === 'rejected') {
        participant.failedConnectionAttempts += 1;
        finish({ ok: false, participant, error: message.error });
      } else if (message?.type === 'unexpected-disconnect') {
        participant.unexpectedDisconnects.push(`race worker: ${message.reason}`);
      }
    });
    child.once('error', (error) => {
      participant.failedConnectionAttempts += 1;
      finish({ ok: false, participant, error: describeError(error) });
    });
    child.once('exit', (code) => {
      if (!settled) {
        participant.failedConnectionAttempts += 1;
        finish({
          ok: false,
          participant,
          error: `Race contender exited before reporting a result (code ${code}).${stderr ? ` ${stderr.trim()}` : ''}`,
        });
      }
    });

    child.send({ type: 'connect', ...tokenResponse });
  });
}

function isExpectedFullRejection(outcome) {
  return !outcome.ok && FULL_ERROR_PATTERN.test(outcome.error ?? '');
}

async function waitForRoomEvent(room, event, timeoutMs) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      room.off(event, handler);
      reject(new Error(`Timed out waiting for LiveKit event ${event}.`));
    }, timeoutMs);
    const handler = () => {
      clearTimeout(timeout);
      resolve();
    };
    room.once(event, handler);
  });
}

async function testSdkReconnect(config, owner, channel, participants, report) {
  const targets = connectedParticipants(participants)
    .filter((participant) => !participant.audio)
    .slice(0, Math.min(3, connectedParticipants(participants).length));
  if (targets.length !== 3) {
    throw new Error(`SDK reconnect test needs three clients; found ${targets.length}.`);
  }
  const events = targets.map((participant) =>
    waitForRoomEvent(participant.room, RoomEvent.Reconnected, config.settleTimeoutMs),
  );
  await Promise.all(
    targets.map((participant) =>
      participant.room.simulateScenario(SimulateScenarioKind.SIMULATE_FULL_RECONNECT),
    ),
  );
  await Promise.all(events);
  await waitForCount(
    config,
    owner,
    channel.channelId,
    participants,
    CALL_CAPACITY,
    'SDK reconnect',
    report,
  );
}

async function testChurn(config, owner, channel, participants, report) {
  for (let round = 1; round <= config.churnRounds; round += 1) {
    const targets = connectedParticipants(participants)
      .filter((participant) => !participant.audio)
      .slice(-config.churnParticipants);
    if (targets.length !== config.churnParticipants) {
      throw new Error('Not enough non-publishing participants for the requested churn batch.');
    }

    await Promise.all(targets.map((participant) => disconnectParticipant(participant)));
    await waitForCount(
      config,
      owner,
      channel.channelId,
      participants,
      CALL_CAPACITY - targets.length,
      `Churn ${round} leave`,
      report,
    );
    await connectBatch(config, channel, targets);
    await waitForCount(
      config,
      owner,
      channel.channelId,
      participants,
      CALL_CAPACITY,
      `Churn ${round} reconnect`,
      report,
    );
  }
}

function describeError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function closeChannel(owner, config, channelId) {
  const supabase = createUserSupabase(config, owner.session.accessToken);
  const { error } = await supabase.schema('guest').rpc('close_channel', {
    p_channel_id: channelId,
  });
  if (error) throw new Error(error.message);
}

async function cleanup(participants, owner, config, channel) {
  await Promise.allSettled(participants.map((participant) => disconnectParticipant(participant)));
  if (owner && channel) {
    await closeChannel(owner, config, channel.channelId).catch((error) =>
      process.stderr.write(`Cleanup warning: ${describeError(error)}\n`),
    );
  }
  dispose();
}

async function startEvidenceObserver(config, channel, evidenceDirectory, report) {
  if (!config.evidenceEnabled) return null;

  const observer = new GuestCallEvidenceObserver({
    webUrl: config.webUrl,
    outputDirectory: evidenceDirectory,
    settleTimeoutMs: config.settleTimeoutMs,
  });
  try {
    await observer.start(channel);
    report.evidence.observer = 'ready';
    line('✓ Browser evidence observer joined the real Guest Room dashboard.');
    return observer;
  } catch (error) {
    await observer.close();
    const message = `Could not start browser evidence observer: ${describeError(error)}`;
    report.evidence.observer = 'failed';
    report.evidence.errors.push(message);
    process.stderr.write(`Evidence warning: ${message}\n`);
    return null;
  }
}

async function captureEvidence(observer, report, filename, expectedCount) {
  if (!observer) return;

  try {
    await observer.capture(filename, expectedCount, CALL_CAPACITY);
    report.evidence.screenshots.push(filename);
    line(`✓ Captured browser evidence ${filename}.`);
  } catch (error) {
    const message = `${filename}: ${describeError(error)}`;
    report.evidence.errors.push(message);
    process.stderr.write(`Evidence warning: ${message}\n`);
  }
}

function printHelp() {
  line('Guest call integration load test');
  line();
  line('Usage: pnpm --filter web load-test:guest-call -- --run');
  line('       pnpm --filter web load-test:guest-call -- --smoke');
  line();
  line('Required environment variables:');
  line('  LOBBY_LOAD_TEST_CONFIRM=development');
  line('  LOBBY_LOAD_TEST_EMAIL=<registered development user>');
  line('  LOBBY_LOAD_TEST_PASSWORD=<password>');
  line('  SUPABASE_URL=<development/test project URL>');
  line('  SUPABASE_PUBLISHABLE_KEY=<public client key>');
  line();
  line('The Lobby API defaults to http://127.0.0.1:3000 and must already be running.');
  line('The Lobby UI defaults to http://127.0.0.1:4200 and must already be running for evidence.');
}

async function main() {
  const fullRun = process.argv.includes('--run');
  const smokeRun = process.argv.includes('--smoke');
  if (process.argv.includes('--help') || (!fullRun && !smokeRun)) {
    printHelp();
    if (!process.argv.includes('--help')) {
      line();
      line('No load was generated because --run or --smoke was not supplied.');
    }
    return;
  }

  const config = readConfig();
  const startedAt = new Date().toISOString();
  const evidenceDirectory = resolveEvidenceDirectory(config, startedAt);
  const report = createReport({
    mode: smokeRun ? 'observer-smoke' : 'full',
    startedAt,
    evidenceEnabled: config.evidenceEnabled,
    evidenceDirectory,
  });
  const resourceMonitor = new ResourceMonitor();
  resourceMonitor.start();
  const unhandledRejections = [];
  const onUnhandledRejection = (reason) => unhandledRejections.push(describeError(reason));
  process.on('unhandledRejection', onUnhandledRejection);

  let owner = null;
  let channel = null;
  let evidenceObserver = null;
  const participants = [];

  line(
    smokeRun
      ? 'Starting Lobby guest-call browser evidence smoke test.'
      : 'Starting Lobby guest-call integration load test against the configured development target.',
  );
  try {
    owner = await loginOwner(config);
    channel = await createChannel(config, owner);
    line(`Created temporary 50-person room ${channel.code}.`);
    evidenceObserver = await startEvidenceObserver(config, channel, evidenceDirectory, report);

    if (smokeRun) {
      await captureEvidence(evidenceObserver, report, '00-observer-smoke.png', 0);
    } else {
      const primary = await prepareRange(config, channel, 1, PRIMARY_PARTICIPANTS, participants);
      const primaryOutcomes = await mapWithConcurrency(
        primary,
        config.connectConcurrency,
        (participant) => attemptConnection(config, participant, channel.channelId),
      );
      report.successfulPrimaryConnections = primaryOutcomes.filter((outcome) => outcome.ok).length;
      report.failedPrimaryConnections =
        primaryOutcomes.length - report.successfulPrimaryConnections;
      if (report.failedPrimaryConnections > 0) {
        throw new Error(
          `Primary load reached only ${report.successfulPrimaryConnections}/${PRIMARY_PARTICIPANTS}; first failure: ${primaryOutcomes.find((outcome) => !outcome.ok)?.error}`,
        );
      }

      await waitForCount(
        config,
        owner,
        channel.channelId,
        participants,
        40,
        'Primary load',
        report,
      );
      report.fortyOfFifty = true;
      await captureEvidence(evidenceObserver, report, '01-40-participants.png', 40);

      const audioTargets = connectedParticipants(participants).slice(0, config.audioPublishers);
      await Promise.all(audioTargets.map((participant) => startAudio(participant)));
      line(
        `✓ ${audioTargets.length} participant(s) publishing silent microphone audio; others remain muted.`,
      );
      await delay(config.stabilitySeconds * 1_000);
      await waitForCount(
        config,
        owner,
        channel.channelId,
        participants,
        40,
        'Stability hold',
        report,
      );

      let nextOrdinal = 41;
      const checkpointScreenshot = new Map([
        [45, '02-45-participants.png'],
        [49, '03-49-participants.png'],
        [50, '04-50-participants.png'],
      ]);
      for (const target of CHECKPOINTS.slice(1)) {
        const additions = await prepareRange(config, channel, nextOrdinal, target, participants);
        nextOrdinal = target + 1;
        await connectBatch(config, channel, additions);
        await waitForCount(
          config,
          owner,
          channel.channelId,
          participants,
          target,
          'Capacity checkpoint',
          report,
        );
        await captureEvidence(evidenceObserver, report, checkpointScreenshot.get(target), target);
      }
      report.fiftyOfFifty = true;
      await captureEvidence(evidenceObserver, report, '05-room-full.png', 50);

      const [participant51] = await prepareRange(config, channel, 51, 51, participants);
      const rejectedAtFull = await attemptConnection(config, participant51, channel.channelId);
      if (!isExpectedFullRejection(rejectedAtFull)) {
        throw new Error(
          rejectedAtFull.ok
            ? 'Participant 51 connected while the room was already 50/50.'
            : `Participant 51 received an unexpected rejection: ${rejectedAtFull.error}`,
        );
      }
      report.rejectedConnectionAttempts += 1;
      await verifyGuestAccess(participant51, channel.channelId);
      await waitForCount(
        config,
        owner,
        channel.channelId,
        participants,
        50,
        'Participant 51 rejection',
        report,
      );
      report.participant51 = `rejected at 50/50 (${rejectedAtFull.error}); chat remained available`;
      await captureEvidence(evidenceObserver, report, '06-participant-51-rejected.png', 50);

      const vacated = connectedParticipants(participants).find((participant) => !participant.audio);
      if (!vacated) throw new Error('Could not select a participant to vacate a call slot.');
      await disconnectParticipant(vacated);
      await waitForCount(
        config,
        owner,
        channel.channelId,
        participants,
        49,
        'Vacated slot',
        report,
      );
      await captureEvidence(evidenceObserver, report, '07-slot-reopened.png', 49);
      await connectParticipant(config, participant51, channel.channelId);
      await waitForCount(
        config,
        owner,
        channel.channelId,
        participants,
        50,
        'Participant 51 retry',
        report,
      );
      report.participant51 += '; joined successfully after a slot opened';
      await captureEvidence(evidenceObserver, report, '08-back-to-50.png', 50);

      const raceResults = [];
      for (let round = 1; round <= config.raceRounds; round += 1) {
        const leaving = connectedParticipants(participants).find(
          (participant) => !participant.audio && participant !== participant51,
        );
        if (!leaving) throw new Error(`Could not select a participant for race ${round}.`);
        await disconnectParticipant(leaving);
        await waitForCount(
          config,
          owner,
          channel.channelId,
          participants,
          49,
          `Race ${round} setup`,
          report,
        );

        const contenders = await prepareRange(
          config,
          channel,
          nextOrdinal,
          nextOrdinal + 1,
          participants,
        );
        nextOrdinal += 2;
        const contenderTokens = await Promise.all(
          contenders.map((participant) => mintCallToken(config, participant, channel.channelId)),
        );
        const outcomes = await Promise.all(
          contenders.map((participant, index) =>
            attemptIsolatedRaceConnection(
              participant,
              contenderTokens[index],
              config.settleTimeoutMs,
            ),
          ),
        );
        const winners = outcomes.filter((outcome) => outcome.ok);
        const rejected = outcomes.filter((outcome) => !outcome.ok);
        if (
          winners.length !== 1 ||
          rejected.length !== 1 ||
          !isExpectedFullRejection(rejected[0])
        ) {
          const raceStatus = await getCallStatus(config, owner, channel.channelId);
          report.finalParticipantCount = raceStatus.participants;
          report.peakConnectedParticipants = Math.max(
            report.peakConnectedParticipants,
            raceStatus.participants,
          );
          if (raceStatus.participants > CALL_CAPACITY) {
            await captureEvidence(
              evidenceObserver,
              report,
              `failure-race-${round}-over-capacity.png`,
              raceStatus.participants,
            );
          }
          throw new Error(
            `Race ${round} expected one winner and one full-call rejection; got ${winners.length} winner(s) and ${rejected.length} rejection(s).`,
          );
        }
        report.rejectedConnectionAttempts += 1;
        await waitForCount(
          config,
          owner,
          channel.channelId,
          participants,
          50,
          `Race ${round} result`,
          report,
        );
        raceResults.push(`round ${round}: one LiveKit-enforced winner, one handled rejection`);
      }
      report.raceCondition = raceResults.join('; ');

      await testSdkReconnect(config, owner, channel, participants, report);
      report.reconnect =
        'three simultaneous forced full reconnects completed without duplicate identities';

      await testChurn(config, owner, channel, participants, report);
      report.churn = `${config.churnRounds} rounds of ${config.churnParticipants} simultaneous leaves/rejoins stayed consistent`;
      await captureEvidence(evidenceObserver, report, '09-after-reconnect-churn.png', 50);

      const unexpectedDisconnects = participants.flatMap((participant) =>
        participant.unexpectedDisconnects.map(
          (reason) => `participant ${participant.ordinal}: ${reason}`,
        ),
      );
      if (unexpectedDisconnects.length > 0) {
        throw new Error(`Unexpected client errors: ${unexpectedDisconnects.join('; ')}`);
      }
      if (unhandledRejections.length > 0) {
        throw new Error(`Unhandled rejections: ${unhandledRejections.join('; ')}`);
      }

      const finalStatus = await getCallStatus(config, owner, channel.channelId);
      report.finalParticipantCount = finalStatus.participants;
      report.peakConnectedParticipants = Math.max(
        report.peakConnectedParticipants,
        finalStatus.participants,
      );
      await captureEvidence(evidenceObserver, report, '10-load-test-success.png', 50);
    }
  } catch (error) {
    const message = describeError(error);
    report.errors.push(message);
    if (/did not settle|unique connected identities|reported capacity/i.test(message)) {
      report.countInconsistencies.push(message);
    }
    try {
      if (owner && channel) {
        const status = await getCallStatus(config, owner, channel.channelId);
        report.finalParticipantCount = status.participants;
        report.peakConnectedParticipants = Math.max(
          report.peakConnectedParticipants,
          status.participants,
        );
      }
    } catch (statusError) {
      report.errors.push(`Could not read final count: ${describeError(statusError)}`);
    }
  } finally {
    report.uniqueSimulatedParticipants = participants.length;
    report.successfulConnectionAttempts = participants.reduce(
      (total, participant) => total + participant.successfulConnectionAttempts,
      0,
    );
    report.failedConnectionAttempts = participants.reduce(
      (total, participant) => total + participant.failedConnectionAttempts,
      0,
    );
    await evidenceObserver?.close();
    await cleanup(participants, owner, config, channel);
    report.resourceObservations = resourceMonitor.stop();
    process.off('unhandledRejection', onUnhandledRejection);

    report.testCompletedAt = new Date().toISOString();
    report.loadTestResult = smokeRun ? 'NOT_RUN' : report.errors.length === 0 ? 'PASS' : 'FAIL';
    const expectedScreenshotCount = smokeRun ? 1 : 10;
    if (config.evidenceEnabled && report.evidence.screenshots.length !== expectedScreenshotCount) {
      report.evidence.errors.push(
        `Expected ${expectedScreenshotCount} evidence screenshot(s); captured ${report.evidence.screenshots.length}.`,
      );
    }
    report.evidence.result = config.evidenceEnabled
      ? report.evidence.errors.length === 0 && report.evidence.observer === 'ready'
        ? 'PASS'
        : 'FAIL'
      : 'SKIPPED';
    report.overallResult =
      report.errors.length === 0 && report.evidence.result !== 'FAIL' ? 'PASS' : 'FAIL';

    try {
      await writeEvidenceReports(report, evidenceDirectory);
    } catch (error) {
      const message = `Could not write evidence reports: ${describeError(error)}`;
      report.errors.push(message);
      report.overallResult = 'FAIL';
      process.stderr.write(`${message}\n`);
    }
  }

  line();
  line('Load-test report');
  line(JSON.stringify(report, null, 2));
  line(`Evidence directory: ${report.evidence.directory}`);
  if (report.overallResult !== 'PASS') process.exitCode = 1;
}

await main().catch((error) => {
  process.stderr.write(`Load-test setup failed: ${describeError(error)}\n`);
  try {
    dispose();
  } catch {
    // The native SDK may not have initialized before setup validation failed.
  }
  process.exitCode = 1;
});

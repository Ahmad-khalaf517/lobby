import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { clearInterval, clearTimeout, setInterval, setTimeout } from 'node:timers';
import { URL } from 'node:url';

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

const CALL_CAPACITY = 50;
const PRIMARY_PARTICIPANTS = 40;
const CHECKPOINTS = [40, 45, 49, 50];
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
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  const ownerEmail = process.env.LOBBY_LOAD_TEST_EMAIL;
  const ownerPassword = process.env.LOBBY_LOAD_TEST_PASSWORD;

  if (process.env.LOBBY_LOAD_TEST_CONFIRM !== 'development') {
    throw new Error(
      'Refusing to start. Set LOBBY_LOAD_TEST_CONFIRM=development after verifying every target is non-production.',
    );
  }
  if (!isLocalApiUrl(apiUrl) && process.env.LOBBY_LOAD_ALLOW_REMOTE_API !== 'true') {
    throw new Error(
      'LOBBY_LOAD_API_URL must be localhost. Set LOBBY_LOAD_ALLOW_REMOTE_API=true only for an explicitly approved test API.',
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
    supabaseUrl,
    supabaseKey,
    ownerEmail,
    ownerPassword,
    authConcurrency: numberSetting('LOBBY_LOAD_AUTH_CONCURRENCY', 4, { min: 1, max: 10 }),
    connectConcurrency: numberSetting('LOBBY_LOAD_CONNECT_CONCURRENCY', 5, {
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
  };
}

function isLocalApiUrl(value) {
  try {
    const url = new URL(value);
    return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
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
  return apiRequest(
    config,
    owner.jar,
    '/guest/channels',
    { method: 'POST', body: JSON.stringify(request) },
    GuestChannelCreateResponseSchema,
  );
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

function connectedIdentities(participants) {
  return connectedParticipants(participants).map((participant) => participant.identity);
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

async function waitForCount(config, owner, channelId, participants, expected, label) {
  const startedAt = Date.now();
  let lastApiCount = -1;
  let lastSdkCount = -1;

  while (Date.now() - startedAt < config.settleTimeoutMs) {
    const status = await getCallStatus(config, owner, channelId);
    lastApiCount = status.participants;
    const observer = connectedParticipants(participants)[0];
    lastSdkCount = observer ? observer.room.remoteParticipants.size + 1 : 0;

    if (status.maxParticipants !== CALL_CAPACITY) {
      throw new Error(
        `Lobby reported capacity ${status.maxParticipants}; expected ${CALL_CAPACITY}.`,
      );
    }
    if (lastApiCount === expected && lastSdkCount === expected) {
      assertUniqueIdentities(participants, expected);
      line(`✓ ${label}: ${expected}/${CALL_CAPACITY} (API and LiveKit SDK agree)`);
      return status;
    }
    await delay(250);
  }

  throw new Error(
    `${label} did not settle at ${expected}/${CALL_CAPACITY}; API=${lastApiCount}, SDK=${lastSdkCount}.`,
  );
}

function assertUniqueIdentities(participants, expected) {
  const identities = connectedIdentities(participants);
  const validIdentities = identities.filter((identity) => typeof identity === 'string');
  if (validIdentities.length !== expected || new Set(validIdentities).size !== expected) {
    throw new Error(
      `Expected ${expected} unique connected identities; observed ${validIdentities.length} identities and ${new Set(validIdentities).size} unique values.`,
    );
  }
}

async function mapWithConcurrency(items, concurrency, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await callback(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function prepareRange(config, channel, start, end) {
  const ordinals = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  return mapWithConcurrency(ordinals, config.authConcurrency, (ordinal) =>
    prepareParticipant(config, channel, ordinal),
  );
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

async function attemptConnectionWithToken(participant, token) {
  try {
    await connectParticipantWithToken(participant, token);
    return { ok: true, participant, error: null };
  } catch (error) {
    participant.failedConnectionAttempts += 1;
    return { ok: false, participant, error: describeError(error) };
  }
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

async function testSdkReconnect(config, owner, channel, participants) {
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
  );
}

async function testChurn(config, owner, channel, participants) {
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
    );
    await connectBatch(config, channel, targets);
    await waitForCount(
      config,
      owner,
      channel.channelId,
      participants,
      CALL_CAPACITY,
      `Churn ${round} reconnect`,
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

function printHelp() {
  line('Guest call integration load test');
  line();
  line('Usage: pnpm --filter web load-test:guest-call -- --run');
  line();
  line('Required environment variables:');
  line('  LOBBY_LOAD_TEST_CONFIRM=development');
  line('  LOBBY_LOAD_TEST_EMAIL=<registered development user>');
  line('  LOBBY_LOAD_TEST_PASSWORD=<password>');
  line('  SUPABASE_URL=<development/test project URL>');
  line('  SUPABASE_PUBLISHABLE_KEY=<public client key>');
  line();
  line('The Lobby API defaults to http://127.0.0.1:3000 and must already be running.');
}

async function main() {
  if (process.argv.includes('--help') || !process.argv.includes('--run')) {
    printHelp();
    if (!process.argv.includes('--help')) {
      line();
      line('No load was generated because --run was not supplied.');
    }
    return;
  }

  const config = readConfig();
  const report = {
    requestedPrimaryParticipants: PRIMARY_PARTICIPANTS,
    uniqueSimulatedParticipants: 0,
    successfulPrimaryConnections: 0,
    failedPrimaryConnections: 0,
    successfulConnectionAttempts: 0,
    failedConnectionAttempts: 0,
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
  };
  const resourceMonitor = new ResourceMonitor();
  resourceMonitor.start();
  const unhandledRejections = [];
  const onUnhandledRejection = (reason) => unhandledRejections.push(describeError(reason));
  process.on('unhandledRejection', onUnhandledRejection);

  let owner = null;
  let channel = null;
  const participants = [];

  line(
    'Starting Lobby guest-call integration load test against the configured development target.',
  );
  try {
    owner = await loginOwner(config);
    channel = await createChannel(config, owner);
    line(`Created temporary 50-person room ${channel.code}.`);

    const primary = await prepareRange(config, channel, 1, PRIMARY_PARTICIPANTS);
    participants.push(...primary);
    const primaryOutcomes = await mapWithConcurrency(
      primary,
      config.connectConcurrency,
      (participant) => attemptConnection(config, participant, channel.channelId),
    );
    report.successfulPrimaryConnections = primaryOutcomes.filter((outcome) => outcome.ok).length;
    report.failedPrimaryConnections = primaryOutcomes.length - report.successfulPrimaryConnections;
    if (report.failedPrimaryConnections > 0) {
      throw new Error(
        `Primary load reached only ${report.successfulPrimaryConnections}/${PRIMARY_PARTICIPANTS}; first failure: ${primaryOutcomes.find((outcome) => !outcome.ok)?.error}`,
      );
    }

    await waitForCount(config, owner, channel.channelId, participants, 40, 'Primary load');
    report.fortyOfFifty = true;

    const audioTargets = connectedParticipants(participants).slice(0, config.audioPublishers);
    await Promise.all(audioTargets.map((participant) => startAudio(participant)));
    line(
      `✓ ${audioTargets.length} participant(s) publishing silent microphone audio; others remain muted.`,
    );
    await delay(config.stabilitySeconds * 1_000);
    await waitForCount(config, owner, channel.channelId, participants, 40, 'Stability hold');

    let nextOrdinal = 41;
    for (const target of CHECKPOINTS.slice(1)) {
      const additions = await prepareRange(config, channel, nextOrdinal, target);
      nextOrdinal = target + 1;
      participants.push(...additions);
      await connectBatch(config, channel, additions);
      await waitForCount(
        config,
        owner,
        channel.channelId,
        participants,
        target,
        `Capacity checkpoint`,
      );
    }
    report.fiftyOfFifty = true;

    const [participant51] = await prepareRange(config, channel, 51, 51);
    participants.push(participant51);
    const rejectedAtFull = await attemptConnection(config, participant51, channel.channelId);
    if (!isExpectedFullRejection(rejectedAtFull)) {
      throw new Error(
        rejectedAtFull.ok
          ? 'Participant 51 connected while the room was already 50/50.'
          : `Participant 51 received an unexpected rejection: ${rejectedAtFull.error}`,
      );
    }
    await verifyGuestAccess(participant51, channel.channelId);
    await waitForCount(
      config,
      owner,
      channel.channelId,
      participants,
      50,
      'Participant 51 rejection',
    );
    report.participant51 = `rejected at 50/50 (${rejectedAtFull.error}); chat remained available`;

    const vacated = connectedParticipants(participants).find((participant) => !participant.audio);
    if (!vacated) throw new Error('Could not select a participant to vacate a call slot.');
    await disconnectParticipant(vacated);
    await waitForCount(config, owner, channel.channelId, participants, 49, 'Vacated slot');
    await connectParticipant(config, participant51, channel.channelId);
    await waitForCount(config, owner, channel.channelId, participants, 50, 'Participant 51 retry');
    report.participant51 += '; joined successfully after a slot opened';

    const raceResults = [];
    for (let round = 1; round <= config.raceRounds; round += 1) {
      const leaving = connectedParticipants(participants).find(
        (participant) => !participant.audio && participant !== participant51,
      );
      if (!leaving) throw new Error(`Could not select a participant for race ${round}.`);
      await disconnectParticipant(leaving);
      await waitForCount(config, owner, channel.channelId, participants, 49, `Race ${round} setup`);

      const contenders = await prepareRange(config, channel, nextOrdinal, nextOrdinal + 1);
      nextOrdinal += 2;
      participants.push(...contenders);
      const contenderTokens = await Promise.all(
        contenders.map((participant) => mintCallToken(config, participant, channel.channelId)),
      );
      const outcomes = await Promise.all(
        contenders.map((participant, index) =>
          attemptConnectionWithToken(participant, contenderTokens[index]),
        ),
      );
      const winners = outcomes.filter((outcome) => outcome.ok);
      const rejected = outcomes.filter((outcome) => !outcome.ok);
      if (winners.length !== 1 || rejected.length !== 1 || !isExpectedFullRejection(rejected[0])) {
        throw new Error(
          `Race ${round} expected one winner and one full-call rejection; got ${winners.length} winner(s) and ${rejected.length} rejection(s).`,
        );
      }
      await waitForCount(
        config,
        owner,
        channel.channelId,
        participants,
        50,
        `Race ${round} result`,
      );
      raceResults.push(`round ${round}: one LiveKit-enforced winner, one handled rejection`);
    }
    report.raceCondition = raceResults.join('; ');

    await testSdkReconnect(config, owner, channel, participants);
    report.reconnect =
      'three simultaneous forced full reconnects completed without duplicate identities';

    await testChurn(config, owner, channel, participants);
    report.churn = `${config.churnRounds} rounds of ${config.churnParticipants} simultaneous leaves/rejoins stayed consistent`;

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
    await cleanup(participants, owner, config, channel);
    report.resourceObservations = resourceMonitor.stop();
    process.off('unhandledRejection', onUnhandledRejection);
  }

  line();
  line('Load-test report');
  line(JSON.stringify(report, null, 2));
  if (report.errors.length > 0) process.exitCode = 1;
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

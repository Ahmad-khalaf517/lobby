/** Shared limits — import these instead of redefining the same numbers on both sides. */
export const MAX_NAME_LENGTH = 40;
export const MAX_CHANNEL_NAME_LENGTH = 60;
export const MAX_MESSAGE_LENGTH = 2000;

/** Product limits and defaults for temporary guest-room calls. */
export const MIN_CALL_PARTICIPANTS = 2;
export const DEFAULT_CALL_PARTICIPANTS = 8;
export const MAX_CALL_PARTICIPANTS = 50;

export const MIN_GUEST_ROOM_LIFETIME_MINUTES = 5;
export const DEFAULT_GUEST_ROOM_LIFETIME_MINUTES = 60;
export const MAX_GUEST_ROOM_LIFETIME_MINUTES = 180;
/**
 * Soft cap on call participants — LiveKit itself can handle far more, this is a
 * product decision, not a technical limit. Enforced in apps/api when minting a
 * call token (reject if the room already has this many participants).
 */
/** Avatar uploads go through the API as base64 JSON, then land in Supabase Storage. */
export const MAX_AVATAR_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
// Base64 inflates payload size by ~4/3 — cap the encoded string generously above the raw limit.
export const MAX_AVATAR_BASE64_LENGTH = Math.ceil((MAX_AVATAR_FILE_SIZE_BYTES * 4) / 3) + 1024;
export const ALLOWED_AVATAR_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

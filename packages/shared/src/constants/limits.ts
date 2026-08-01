/** Shared limits — import these instead of redefining the same numbers on both sides. */
export const MAX_NAME_LENGTH = 40;
export const MAX_CHANNEL_NAME_LENGTH = 60;
export const MAX_MESSAGE_LENGTH = 2000;

/**
 * Soft cap on call participants — LiveKit itself can handle far more, this is a
 * product decision, not a technical limit. Enforced in apps/api when minting a
 * call token (reject if the room already has this many participants).
 */
export const MAX_CALL_PARTICIPANTS = 8;

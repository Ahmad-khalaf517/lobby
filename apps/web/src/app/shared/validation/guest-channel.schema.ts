import { MAX_CHANNEL_NAME_LENGTH, MAX_NAME_LENGTH } from '@lobby/shared';
import { z } from 'zod';

// eslint-disable-next-line no-control-regex
const printableText = /^[^\u0000-\u001f\u007f]*$/;

export const guestDisplayNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter your display name.')
  .max(MAX_NAME_LENGTH, `Display name must be ${MAX_NAME_LENGTH} characters or fewer.`)
  .regex(printableText, 'Display name contains unsupported characters.');

export const guestInviteCodeSchema = z
  .string()
  .trim()
  .min(1, 'Enter an invite code.')
  .regex(/^[a-z0-9]+$/i, 'Invite code can contain only letters and numbers.')
  .transform((value) => value.toUpperCase());

export const guestChannelNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a channel name.')
  .max(
    MAX_CHANNEL_NAME_LENGTH,
    `Channel name must be ${MAX_CHANNEL_NAME_LENGTH} characters or fewer.`,
  )
  .regex(printableText, 'Channel name contains unsupported characters.');

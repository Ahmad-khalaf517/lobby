import { z } from 'zod';
import {
  ALLOWED_AVATAR_MIME_TYPES,
  MAX_AVATAR_BASE64_LENGTH,
  MAX_NAME_LENGTH,
} from '../constants/limits.js';

export const MAX_PROFILE_BIO_LENGTH = 280;
export const MAX_PROFILE_AVATAR_URL_LENGTH = 2048;

/** A persisted user profile record used by the REST API. */
export const UserProfileSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1).max(MAX_NAME_LENGTH),
  username: z.string().min(1).max(MAX_NAME_LENGTH),
  bio: z.string().max(MAX_PROFILE_BIO_LENGTH).nullable(),
  avatarUrl: z.string().url().max(MAX_PROFILE_AVATAR_URL_LENGTH).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

/** REST: PATCH /users/:userId/profile — request body */
export const UpdateUserProfileRequestSchema = z
  .object({
    displayName: z.string().min(1).max(MAX_NAME_LENGTH).optional(),
    userName: z.string().min(1).max(MAX_NAME_LENGTH).optional(),
    bio: z.string().max(MAX_PROFILE_BIO_LENGTH).nullable().optional(),
    avatarUrl: z.string().url().max(MAX_PROFILE_AVATAR_URL_LENGTH).nullable().optional(),
  })
  .refine(
    (payload) =>
      payload.displayName !== undefined ||
      payload.userName !== undefined ||
      payload.bio !== undefined ||
      payload.avatarUrl !== undefined,
    {
      message: 'At least one field must be provided',
    },
  );
export type UpdateUserProfileRequest = z.infer<typeof UpdateUserProfileRequestSchema>;

/** REST: PATCH /users/:userId/profile — response */
export const UpdateUserProfileResponseSchema = UserProfileSchema;
export type UpdateUserProfileResponse = z.infer<typeof UpdateUserProfileResponseSchema>;

/**
 * REST: POST /users/:userId/profile/avatar — request body.
 * The file travels as a base64 data payload (no multipart) so the request
 * can be validated with the same Zod pipeline as everything else.
 */
export const UploadUserAvatarRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_AVATAR_MIME_TYPES),
  data: z.string().min(1).max(MAX_AVATAR_BASE64_LENGTH),
});
export type UploadUserAvatarRequest = z.infer<typeof UploadUserAvatarRequestSchema>;

/** REST: POST /users/:userId/profile/avatar — response */
export const UploadUserAvatarResponseSchema = UserProfileSchema;
export type UploadUserAvatarResponse = z.infer<typeof UploadUserAvatarResponseSchema>;

/** REST: DELETE /users/:userId/profile/avatar — response */
export const DeleteUserAvatarResponseSchema = UserProfileSchema;
export type DeleteUserAvatarResponse = z.infer<typeof DeleteUserAvatarResponseSchema>;

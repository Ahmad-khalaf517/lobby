import { z } from 'zod';

/** A persisted account settings record used by the REST API. */
export const AccountSettingsSchema = z.object({
  userId: z.string().min(1),
 
  pushNotificationsEnabled: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type AccountSettings = z.infer<typeof AccountSettingsSchema>;

/** REST: PATCH /users/:userId/account-settings — request body */
export const UpdateAccountSettingsRequestSchema = z
  .object({
   
    pushNotificationsEnabled: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateAccountSettingsRequest = z.infer<typeof UpdateAccountSettingsRequestSchema>;

/** REST: PATCH /users/:userId/account-settings — response */
export const UpdateAccountSettingsResponseSchema = AccountSettingsSchema;
export type UpdateAccountSettingsResponse = z.infer<typeof UpdateAccountSettingsResponseSchema>;

import { z } from 'zod';

/**
 * Settings are catalog-driven (see `account_setting_definitions`): the row
 * describes how a setting should render, and `value_type` picks which shape
 * its `default_value` / stored `value` must be.
 */
export const AccountSettingValueTypeSchema = z.enum(['boolean', 'string', 'number', 'select']);
export type AccountSettingValueType = z.infer<typeof AccountSettingValueTypeSchema>;

/** A single JSON-safe value a setting can hold — matches the `jsonb` column shape. */
export const AccountSettingValueSchema = z.union([z.boolean(), z.string(), z.number()]);
export type AccountSettingValue = z.infer<typeof AccountSettingValueSchema>;

/** One entry of a `select`-type setting's `options` array. */
export const AccountSettingOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});
export type AccountSettingOption = z.infer<typeof AccountSettingOptionSchema>;

/**
 * A setting's catalog entry (`account_setting_definitions`), merged with the
 * effective value for the requesting user — their override from
 * `account_settings` if one exists, otherwise the definition's default.
 * This is what both `GET` endpoints below return.
 */
export const AccountSettingSchema = z.object({
  settingKey: z.string().min(1),
  label: z.string().min(1),
  description: z.string().nullable(),
  valueType: AccountSettingValueTypeSchema,
  options: z.array(AccountSettingOptionSchema).nullable(),
  category: z.string().min(1),
  sortOrder: z.number().int(),
  value: AccountSettingValueSchema,
});
export type AccountSetting = z.infer<typeof AccountSettingSchema>;

/** REST: GET /account-settings/definitions, GET /users/:userId/account-settings — response */
export const AccountSettingsSchema = z.array(AccountSettingSchema);
export type AccountSettings = z.infer<typeof AccountSettingsSchema>;

/**
 * REST: PATCH /users/:userId/account-settings — request body.
 * Maps `setting_key` -> new value; every key must be a known, active
 * definition and the value must match that definition's `value_type`
 * (enforced server-side, since the shape isn't knowable statically here).
 */
export const UpdateAccountSettingsRequestSchema = z
  .record(z.string().min(1), AccountSettingValueSchema)
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one setting must be provided',
  });
export type UpdateAccountSettingsRequest = z.infer<typeof UpdateAccountSettingsRequestSchema>;

/** REST: PATCH /users/:userId/account-settings — response */
export const UpdateAccountSettingsResponseSchema = AccountSettingsSchema;
export type UpdateAccountSettingsResponse = z.infer<typeof UpdateAccountSettingsResponseSchema>;

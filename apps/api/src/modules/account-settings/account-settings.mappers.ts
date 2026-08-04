import type { AccountSettings, UpdateAccountSettingsRequest } from '@lobby/shared';
import type { AccountSettingsInsert, AccountSettingsRow } from '../database/database.types';

export function toAccountSettings(row: AccountSettingsRow): AccountSettings {
  return {
    userId: row.user_id,
    emailNotificationsEnabled: row.email_notifications_enabled,
    pushNotificationsEnabled: row.push_notifications_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toAccountSettingsInsert(
  userId: string,
  payload: UpdateAccountSettingsRequest,
): AccountSettingsInsert {
  return {
    user_id: userId,
    email_notifications_enabled: payload.emailNotificationsEnabled ?? true,
    push_notifications_enabled: payload.pushNotificationsEnabled ?? true,
  };
}

export function toAccountSettingsUpdate(
  payload: UpdateAccountSettingsRequest,
): Partial<AccountSettingsInsert> {
  return {
    ...(payload.emailNotificationsEnabled !== undefined
      ? { email_notifications_enabled: payload.emailNotificationsEnabled }
      : {}),
    ...(payload.pushNotificationsEnabled !== undefined
      ? { push_notifications_enabled: payload.pushNotificationsEnabled }
      : {}),
  };
}

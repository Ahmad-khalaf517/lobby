import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  ALLOWED_AVATAR_MIME_TYPES,
  MAX_AVATAR_FILE_SIZE_BYTES,
  UpdateUserProfileRequest,
  UploadUserAvatarRequestSchema,
  UserProfile,
  UserProfileSchema,
} from '@lobby/shared';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/$/, '');

  async getProfile(userId: string): Promise<UserProfile> {
    const response = await firstValueFrom(
      this.http.get<unknown>(`${this.apiUrl}/users/${userId}/profile`),
    );
    return UserProfileSchema.parse(response);
  }

  async updateProfile(userId: string, changes: UpdateUserProfileRequest): Promise<UserProfile> {
    const response = await firstValueFrom(
      this.http.patch<unknown>(`${this.apiUrl}/users/${userId}/profile`, changes),
    );
    return UserProfileSchema.parse(response);
  }

  async uploadAvatar(userId: string, file: File): Promise<UserProfile> {
    if (
      !ALLOWED_AVATAR_MIME_TYPES.includes(file.type as (typeof ALLOWED_AVATAR_MIME_TYPES)[number])
    ) {
      throw new Error('Please choose a PNG, JPEG, WEBP, or GIF image.');
    }
    if (file.size > MAX_AVATAR_FILE_SIZE_BYTES) {
      throw new Error(
        `Image must be ${Math.floor(MAX_AVATAR_FILE_SIZE_BYTES / (1024 * 1024))}MB or smaller.`,
      );
    }

    const data = await this.fileToBase64(file);
    const body = UploadUserAvatarRequestSchema.parse({
      fileName: file.name,
      contentType: file.type,
      data,
    });

    const response = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/users/${userId}/profile/avatar`, body),
    );
    return UserProfileSchema.parse(response);
  }

  async deleteAvatar(userId: string): Promise<UserProfile> {
    const response = await firstValueFrom(
      this.http.delete<unknown>(`${this.apiUrl}/users/${userId}/profile/avatar`),
    );
    return UserProfileSchema.parse(response);
  }

  /** Strips the `data:image/png;base64,` prefix — the API only wants the payload. */
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const commaIndex = result.indexOf(',');
        resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
      };
      reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
      reader.readAsDataURL(file);
    });
  }
}

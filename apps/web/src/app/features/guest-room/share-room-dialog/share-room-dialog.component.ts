import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { renderSVG } from 'uqr';

import { LobbyIconComponent } from '../../../shared/ui/icon/lobby-icon.component';

const QR_EXPORT_SIZE = 1024;

@Component({
  selector: 'app-share-room-dialog',
  imports: [LobbyIconComponent],
  templateUrl: './share-room-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'close.emit()',
  },
})
export class ShareRoomDialogComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly inviteUrl = input.required<string>();
  readonly inviteCode = input.required<string>();
  readonly roomName = input('Guest room');
  readonly close = output<void>();

  protected readonly copied = signal(false);
  protected readonly downloadPending = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly nativeShareSupported =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  protected readonly qrImageUrl = computed(() => {
    const svg = renderSVG(this.inviteUrl(), {
      border: 4,
      boostEcc: true,
      ecc: 'M',
      pixelSize: 10,
      blackColor: '#000000',
      whiteColor: '#ffffff',
    });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

  private copiedTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.copiedTimeoutId) clearTimeout(this.copiedTimeoutId);
    });
  }

  protected async copyInviteLink(): Promise<void> {
    this.errorMessage.set(null);

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(this.inviteUrl());
      } else if (!this.copyWithSelectionFallback()) {
        throw new Error('Clipboard access is unavailable.');
      }

      this.copied.set(true);
      if (this.copiedTimeoutId) clearTimeout(this.copiedTimeoutId);
      this.copiedTimeoutId = setTimeout(() => this.copied.set(false), 1_600);
    } catch {
      this.errorMessage.set('Could not copy the invite link. You can select it manually instead.');
    }
  }

  protected async shareRoom(): Promise<void> {
    if (!this.nativeShareSupported) return;

    this.errorMessage.set(null);
    try {
      await navigator.share({
        title: `Join ${this.roomName()} on Lobby`,
        text: 'Join my Lobby room',
        url: this.inviteUrl(),
      });
    } catch (error: unknown) {
      if (!isShareCancellation(error)) {
        this.errorMessage.set(
          'Could not open the share menu. The other sharing options still work.',
        );
      }
    }
  }

  protected async downloadQrCode(): Promise<void> {
    if (typeof document === 'undefined' || this.downloadPending()) return;

    this.downloadPending.set(true);
    this.errorMessage.set(null);

    try {
      const image = new Image();
      image.src = this.qrImageUrl();
      await image.decode();

      const canvas = document.createElement('canvas');
      canvas.width = QR_EXPORT_SIZE;
      canvas.height = QR_EXPORT_SIZE;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable.');

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, QR_EXPORT_SIZE, QR_EXPORT_SIZE);
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, QR_EXPORT_SIZE, QR_EXPORT_SIZE);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG export failed.');

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `lobby-room-${safeRoomCode(this.inviteCode())}.png`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch {
      this.errorMessage.set('Could not download the QR code. Please try again.');
    } finally {
      this.downloadPending.set(false);
    }
  }

  private copyWithSelectionFallback(): boolean {
    if (typeof document === 'undefined') return false;

    const textarea = document.createElement('textarea');
    textarea.value = this.inviteUrl();
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  }
}

function safeRoomCode(inviteCode: string): string {
  const safeCode = inviteCode.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return safeCode || 'invite';
}

function isShareCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

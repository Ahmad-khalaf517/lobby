import { Injectable, signal } from '@angular/core';

export type ToastVariant = 'success' | 'error' | 'info' | 'notification';

export interface ToastMessage {
  id: number;
  variant: ToastVariant;
  message: string;
  /** Bold lead-in shown above the message — used by notification-style toasts (e.g. a sender's name). */
  title?: string;
  /** Real photo for notification-style toasts (message/friend-request); falls back to a variant icon. */
  avatarUrl?: string | null;
  /** When set, the toast is clickable and dismisses itself after running this. */
  onClick?: () => void;
}

interface ToastOptions {
  title?: string;
  avatarUrl?: string | null;
  onClick?: () => void;
}

const DEFAULT_DURATION_MS = 4000;
const ERROR_DURATION_MS = 6000;
const NOTIFICATION_DURATION_MS = 7000;
/** Caps the stack so a burst of errors/messages can't fill the whole screen. */
const MAX_TOASTS = 4;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<ToastMessage[]>([]);
  readonly toasts = this._toasts.asReadonly();

  private nextId = 1;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  success(message: string): void {
    this.show(message, 'success');
  }

  error(message: string): void {
    this.show(message, 'error');
  }

  info(message: string): void {
    this.show(message, 'info');
  }

  /** A richer, clickable toast for real-time events (new message, friend request). */
  notify(message: string, options: ToastOptions = {}): void {
    this.show(message, 'notification', options);
  }

  dismiss(id: number): void {
    this.clearTimer(id);
    this._toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  /** Runs the toast's click action (if any) and dismisses it. */
  activate(id: number): void {
    const toast = this._toasts().find((candidate) => candidate.id === id);
    this.dismiss(id);
    toast?.onClick?.();
  }

  dismissNotifications(): void {
    for (const toast of this._toasts()) {
      if (toast.variant === 'notification') this.dismiss(toast.id);
    }
  }

  private show(message: string, variant: ToastVariant, options: ToastOptions = {}): void {
    const id = this.nextId++;
    const toast: ToastMessage = { id, variant, message, ...options };

    this._toasts.update((toasts) => {
      const next = [...toasts, toast];
      if (next.length <= MAX_TOASTS) return next;

      const overflow = next.slice(0, next.length - MAX_TOASTS);
      for (const stale of overflow) this.clearTimer(stale.id);
      return next.slice(next.length - MAX_TOASTS);
    });

    const duration =
      variant === 'error'
        ? ERROR_DURATION_MS
        : variant === 'notification'
          ? NOTIFICATION_DURATION_MS
          : DEFAULT_DURATION_MS;
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), duration),
    );
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}

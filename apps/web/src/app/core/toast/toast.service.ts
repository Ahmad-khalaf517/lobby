import { Injectable, signal } from '@angular/core';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  variant: ToastVariant;
  message: string;
}

const DEFAULT_DURATION_MS = 4000;
const ERROR_DURATION_MS = 6000;
/** Caps the stack so a burst of errors can't fill the whole screen. */
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

  dismiss(id: number): void {
    this.clearTimer(id);
    this._toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  private show(message: string, variant: ToastVariant): void {
    const id = this.nextId++;

    this._toasts.update((toasts) => {
      const next = [...toasts, { id, variant, message }];
      if (next.length <= MAX_TOASTS) return next;

      const overflow = next.slice(0, next.length - MAX_TOASTS);
      for (const stale of overflow) this.clearTimer(stale.id);
      return next.slice(next.length - MAX_TOASTS);
    });

    const duration = variant === 'error' ? ERROR_DURATION_MS : DEFAULT_DURATION_MS;
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

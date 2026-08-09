import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { LobbyIconComponent, type LobbyIconName } from '../../shared/ui/icon/lobby-icon.component';
import { ToastService, type ToastVariant } from './toast.service';

const BADGE_CLASSES: Record<ToastVariant, string> = {
  success: 'bg-online/15 text-online',
  error: 'bg-destructive/15 text-destructive',
  info: 'bg-primary/15 text-primary',
  notification: 'bg-primary/15 text-primary',
};

const BADGE_ICONS: Record<ToastVariant, LobbyIconName> = {
  success: 'check',
  error: 'warning',
  info: 'info',
  notification: 'chat',
};

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [LobbyIconComponent],
  templateUrl: './toast-container.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastContainerComponent {
  private readonly toastService = inject(ToastService);
  protected readonly toasts = this.toastService.toasts;

  protected badgeClasses(variant: ToastVariant): string {
    return BADGE_CLASSES[variant];
  }

  protected iconFor(variant: ToastVariant): LobbyIconName {
    return BADGE_ICONS[variant];
  }

  protected dismiss(id: number): void {
    this.toastService.dismiss(id);
  }

  protected activate(id: number): void {
    this.toastService.activate(id);
  }
}

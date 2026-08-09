import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/**
 * Reusable pill-shaped on/off switch (see the account/app-settings screens).
 * Two-way bind `checked` with `[(checked)]`, or use `[checked]` + `(checkedChange)`.
 */
@Component({
  selector: 'app-toggle',
  standalone: true,
  templateUrl: './toggle.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToggleComponent {
  readonly checked = model.required<boolean>();
  readonly disabled = input(false);
  /** Accessible label — required since the control has no visible text of its own. */
  readonly ariaLabel = input.required<string>();

  protected toggle(): void {
    if (this.disabled()) return;
    this.checked.set(!this.checked());
  }
}

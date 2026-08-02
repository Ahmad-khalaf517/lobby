import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-security-section',
  standalone: true,
  templateUrl: './security-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecuritySection {}

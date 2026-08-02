import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-guest-experience-section',
  standalone: true,
  templateUrl: './guest-experience-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestExperienceSection {}

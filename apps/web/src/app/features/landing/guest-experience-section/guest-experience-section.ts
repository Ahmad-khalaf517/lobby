import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-guest-experience-section',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './guest-experience-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestExperienceSection {}

import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-authenticated-experience-section',
  standalone: true,
  templateUrl: './authenticated-experience-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthenticatedExperienceSection {}

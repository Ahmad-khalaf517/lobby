import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-how-it-works-section',
  standalone: true,
  templateUrl: './how-it-works-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HowItWorksSection {}

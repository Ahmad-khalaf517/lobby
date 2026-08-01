import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-faq-section',
  standalone: true,
  templateUrl: './faq-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FaqSection {}

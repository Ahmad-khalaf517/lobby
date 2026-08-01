import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-final-cta-section',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './final-cta-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinalCtaSection {}

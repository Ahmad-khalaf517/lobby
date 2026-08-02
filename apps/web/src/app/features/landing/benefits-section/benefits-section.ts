import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-benefits-section',
  standalone: true,
  templateUrl: './benefits-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BenefitsSection {}

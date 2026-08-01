import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-use-cases-section',
  standalone: true,
  templateUrl: './use-cases-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UseCasesSection {}

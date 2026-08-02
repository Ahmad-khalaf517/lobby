import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../../../shared/ui/logo/lobby-logo.component';

@Component({
  selector: 'app-landing-footer',
  standalone: true,
  imports: [RouterLink, LogoComponent],
  templateUrl: './landing-footer.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingFooter {
  readonly currentYear = new Date().getFullYear();
}

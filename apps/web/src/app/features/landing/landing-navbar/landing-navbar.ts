import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../../../shared/ui/logo/lobby-logo.component';

@Component({
  selector: 'app-landing-navbar',
  standalone: true,
  imports: [RouterLink, LogoComponent],
  templateUrl: './landing-navbar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingNavbar {}

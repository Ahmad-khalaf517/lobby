import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

import { LogoComponent } from '../../../../shared/ui/logo/lobby-logo.component';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [LogoComponent, RouterLink, RouterOutlet],
  templateUrl: './auth-layout.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthLayout {}

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../../../shared/ui/logo/lobby-logo.component';

@Component({
  selector: 'app-unauthorized-page',
  imports: [RouterLink, LogoComponent],
  templateUrl: './unauthorized-page.html',
  styleUrl: './unauthorized-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnauthorizedPage {}

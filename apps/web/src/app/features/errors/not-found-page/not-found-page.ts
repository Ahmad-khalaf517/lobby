import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LogoComponent } from '../../../shared/ui/logo/lobby-logo.component';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink, LogoComponent],
  templateUrl: './not-found-page.html',
  styleUrl: './not-found-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {}

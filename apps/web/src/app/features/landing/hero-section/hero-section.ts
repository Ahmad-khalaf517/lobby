import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-hero-section',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './hero-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeroSection {}

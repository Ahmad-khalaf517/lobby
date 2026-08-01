import { ChangeDetectionStrategy, Component } from '@angular/core';

import { AuthenticatedExperienceSection } from '../authenticated-experience-section/authenticated-experience-section';
import { BenefitsSection } from '../benefits-section/benefits-section';
import { FaqSection } from '../faq-section/faq-section';
import { FinalCtaSection } from '../final-cta-section/final-cta-section';
import { GuestExperienceSection } from '../guest-experience-section/guest-experience-section';
import { HeroSection } from '../hero-section/hero-section';
import { HowItWorksSection } from '../how-it-works-section/how-it-works-section';
import { LandingFooter } from '../landing-footer/landing-footer';
import { LandingNavbar } from '../landing-navbar/landing-navbar';
import { SecuritySection } from '../security-section/security-section';
import { UseCasesSection } from '../use-cases-section/use-cases-section';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [
    LandingNavbar,
    HeroSection,
    BenefitsSection,
    GuestExperienceSection,
    AuthenticatedExperienceSection,
    HowItWorksSection,
    UseCasesSection,
    SecuritySection,
    FaqSection,
    FinalCtaSection,
    LandingFooter,
  ],
  templateUrl: './landing-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPage {}

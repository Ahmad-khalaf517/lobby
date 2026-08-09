import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  PLATFORM_ID,
  ViewEncapsulation,
} from '@angular/core';

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
  styleUrl: './landing-page.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPage implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  private revealObserver?: IntersectionObserver;
  private setupAnimationFrame?: number;
  private readonly faqItems: HTMLDetailsElement[] = [];

  ngAfterViewInit(): void {
    if (!this.browser) {
      return;
    }

    this.setupAnimationFrame = window.requestAnimationFrame(() => {
      this.prepareRevealAnimations();
      this.prepareInteractiveCards();
      this.prepareFaqAccordion();
      this.updateScrollEffects();
    });
  }

  ngOnDestroy(): void {
    this.revealObserver?.disconnect();

    if (this.setupAnimationFrame !== undefined) {
      window.cancelAnimationFrame(this.setupAnimationFrame);
    }

    this.faqItems.forEach((item) => item.removeEventListener('toggle', this.handleFaqToggle));
  }

  @HostListener('window:scroll')
  protected handleWindowScroll(): void {
    this.updateScrollEffects();
  }

  @HostListener('window:resize')
  protected handleWindowResize(): void {
    this.updateScrollEffects();
  }

  @HostListener('pointermove', ['$event'])
  protected handlePointerMove(event: PointerEvent): void {
    if (!this.browser || event.pointerType === 'touch' || !(event.target instanceof Element)) {
      return;
    }

    const card = event.target.closest<HTMLElement>('.lobby-interactive-card');
    if (!card || !this.host.nativeElement.contains(card)) {
      return;
    }

    const bounds = card.getBoundingClientRect();
    card.style.setProperty('--lobby-pointer-x', `${event.clientX - bounds.left}px`);
    card.style.setProperty('--lobby-pointer-y', `${event.clientY - bounds.top}px`);
  }

  private prepareRevealAnimations(): void {
    const root: HTMLElement = this.host.nativeElement;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const targets = root.querySelectorAll(
      '.lobby-reveal-group, .lobby-reveal-panel, .lobby-section article, .lobby-section details',
    ) as NodeListOf<HTMLElement>;

    targets.forEach((target: HTMLElement, index: number) => {
      target.classList.add('lobby-reveal');
      target.style.setProperty('--lobby-reveal-delay', `${(index % 4) * 70}ms`);
    });

    root.classList.add('lobby-motion-ready');

    if (reduceMotion || !('IntersectionObserver' in window)) {
      targets.forEach((target: HTMLElement) => target.classList.add('is-visible'));
      return;
    }

    this.revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -48px 0px',
      },
    );

    targets.forEach((target: HTMLElement) => this.revealObserver?.observe(target));
  }

  private prepareInteractiveCards(): void {
    const root: HTMLElement = this.host.nativeElement;
    const cards = root.querySelectorAll(
      '.lobby-section article, .lobby-section details, .lobby-feature-band > .grid > .grid > div',
    ) as NodeListOf<HTMLElement>;

    cards.forEach((card: HTMLElement) => card.classList.add('lobby-interactive-card'));
  }

  private prepareFaqAccordion(): void {
    const root: HTMLElement = this.host.nativeElement;
    const items = root.querySelectorAll('#faq details') as NodeListOf<HTMLDetailsElement>;

    items.forEach((item: HTMLDetailsElement) => {
      this.faqItems.push(item);
      item.addEventListener('toggle', this.handleFaqToggle);
    });
  }

  private readonly handleFaqToggle = (event: Event): void => {
    const current = event.currentTarget;
    if (!(current instanceof HTMLDetailsElement) || !current.open) {
      return;
    }

    this.faqItems.forEach((item) => {
      if (item !== current) {
        item.open = false;
      }
    });
  };

  private updateScrollEffects(): void {
    if (!this.browser) {
      return;
    }

    const root: HTMLElement = this.host.nativeElement;
    const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = documentHeight > 0 ? Math.min(window.scrollY / documentHeight, 1) : 0;

    root.style.setProperty('--lobby-scroll-progress', progress.toFixed(4));
    root.classList.toggle('lobby-has-scrolled', window.scrollY > 12);
  }
}

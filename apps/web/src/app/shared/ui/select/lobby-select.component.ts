import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  forwardRef,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { LobbyIconComponent } from '../icon/lobby-icon.component';

export type LobbySelectValue = string | number;

export type LobbySelectOption = {
  label: string;
  value: LobbySelectValue;
  disabled?: boolean;
};

let nextSelectId = 0;

@Component({
  selector: 'app-select',
  standalone: true,
  imports: [LobbyIconComponent],
  templateUrl: './lobby-select.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => LobbySelectComponent),
      multi: true,
    },
  ],
  host: {
    class: 'relative block min-w-0',
  },
})
export class LobbySelectComponent implements ControlValueAccessor {
  readonly label = input<string | null>(null);
  readonly placeholder = input('Select an option');
  readonly options = input<readonly LobbySelectOption[]>([]);
  readonly disabled = input(false);
  readonly required = input(false);
  readonly invalid = input(false);
  readonly errorMessage = input<string | null>(null);
  readonly ariaDescribedBy = input<string | null>(null);

  readonly valueChange = output<LobbySelectValue>();

  protected readonly componentId = `lobby-select-${++nextSelectId}`;
  protected readonly triggerId = `${this.componentId}-trigger`;
  protected readonly labelId = `${this.componentId}-label`;
  protected readonly listboxId = `${this.componentId}-listbox`;
  protected readonly valueId = `${this.componentId}-value`;
  protected readonly errorId = `${this.componentId}-error`;

  protected readonly open = signal(false);
  protected readonly activeIndex = signal(-1);
  protected readonly opensUpward = signal(false);
  protected readonly menuMaxHeight = signal(240);

  private readonly value = signal<LobbySelectValue | null>(null);
  private readonly formDisabled = signal(false);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');
  private readonly optionElements = viewChildren<ElementRef<HTMLElement>>('optionElement');

  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  protected readonly isInvalid = computed(() => this.invalid() || this.errorMessage() !== null);
  protected readonly selectedOption = computed(
    () => this.options().find((option) => Object.is(option.value, this.value())) ?? null,
  );
  protected readonly activeOptionId = computed(() =>
    this.open() && this.activeIndex() >= 0 ? this.optionId(this.activeIndex()) : null,
  );
  protected readonly describedBy = computed(
    () =>
      [this.ariaDescribedBy(), this.errorMessage() ? this.errorId : null]
        .filter(Boolean)
        .join(' ') || null,
  );

  private onChange: (value: LobbySelectValue | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor(private readonly host: ElementRef<HTMLElement>) {
    effect(() => {
      if (this.isDisabled()) this.closeMenu(false);
    });
  }

  writeValue(value: unknown): void {
    this.value.set(typeof value === 'string' || typeof value === 'number' ? value : null);
  }

  registerOnChange(callback: (value: LobbySelectValue | null) => void): void {
    this.onChange = callback;
  }

  registerOnTouched(callback: () => void): void {
    this.onTouched = callback;
  }

  setDisabledState(disabled: boolean): void {
    this.formDisabled.set(disabled);
  }

  protected toggleMenu(): void {
    if (this.isDisabled()) return;
    if (this.open()) {
      this.closeMenu(false);
    } else {
      this.openMenu();
    }
  }

  protected handleKeydown(event: KeyboardEvent): void {
    if (this.isDisabled()) return;

    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (this.open()) {
          this.selectActiveOption();
        } else {
          this.openMenu();
        }
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (!this.open()) this.openMenu();
        else this.moveActiveOption(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!this.open()) this.openMenu();
        else this.moveActiveOption(-1);
        break;
      case 'Home':
        if (!this.open()) return;
        event.preventDefault();
        this.activateBoundaryOption('first');
        break;
      case 'End':
        if (!this.open()) return;
        event.preventDefault();
        this.activateBoundaryOption('last');
        break;
      case 'Escape':
        if (!this.open()) return;
        event.preventDefault();
        this.closeMenu(true);
        break;
      case 'Tab':
        if (this.open()) this.closeMenu(true);
        break;
    }
  }

  protected handleBlur(): void {
    this.onTouched();
  }

  protected activateOption(index: number): void {
    if (this.options()[index]?.disabled) return;
    this.activeIndex.set(index);
  }

  protected selectOption(option: LobbySelectOption): void {
    if (option.disabled || this.isDisabled()) return;

    this.value.set(option.value);
    this.onChange(option.value);
    this.onTouched();
    this.valueChange.emit(option.value);
    this.closeMenu(false);
    this.trigger()?.nativeElement.focus();
  }

  protected optionId(index: number): string {
    return `${this.componentId}-option-${index}`;
  }

  protected isSelected(option: LobbySelectOption): boolean {
    return Object.is(option.value, this.selectedOption()?.value);
  }

  @HostListener('document:pointerdown', ['$event'])
  protected handleDocumentPointerDown(event: PointerEvent): void {
    if (
      !this.open() ||
      !(event.target instanceof Node) ||
      this.host.nativeElement.contains(event.target)
    ) {
      return;
    }

    this.closeMenu(true);
  }

  @HostListener('window:resize')
  protected handleWindowResize(): void {
    this.closeMenu(false);
  }

  private openMenu(): void {
    const selectedIndex = this.options().findIndex(
      (option) => !option.disabled && Object.is(option.value, this.value()),
    );
    const firstEnabledIndex = this.options().findIndex((option) => !option.disabled);

    this.activeIndex.set(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex);
    this.open.set(true);

    setTimeout(() => {
      this.positionMenu();
      this.scrollActiveOptionIntoView();
    }, 0);
  }

  private closeMenu(markTouched: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    this.activeIndex.set(-1);
    if (markTouched) this.onTouched();
  }

  private moveActiveOption(direction: 1 | -1): void {
    const options = this.options();
    if (options.length === 0) return;

    let index = this.activeIndex();
    for (let offset = 0; offset < options.length; offset += 1) {
      index = (index + direction + options.length) % options.length;
      if (!options[index]?.disabled) {
        this.activeIndex.set(index);
        this.scrollActiveOptionIntoView();
        return;
      }
    }
  }

  private activateBoundaryOption(boundary: 'first' | 'last'): void {
    const options = this.options();
    let index = options.findIndex((option) => !option.disabled);

    if (boundary === 'last') {
      index = -1;
      for (let optionIndex = options.length - 1; optionIndex >= 0; optionIndex -= 1) {
        if (!options[optionIndex]?.disabled) {
          index = optionIndex;
          break;
        }
      }
    }

    if (index >= 0) {
      this.activeIndex.set(index);
      this.scrollActiveOptionIntoView();
    }
  }

  private selectActiveOption(): void {
    const option = this.options()[this.activeIndex()];
    if (option) this.selectOption(option);
  }

  private positionMenu(): void {
    if (typeof window === 'undefined') return;
    const trigger = this.trigger()?.nativeElement;
    const menu = this.menu()?.nativeElement;
    if (!trigger || !menu) return;

    const triggerRect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - triggerRect.bottom - 8;
    const spaceAbove = triggerRect.top - 8;
    const desiredHeight = Math.min(menu.scrollHeight, 240);
    const shouldOpenUpward = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
    const availableSpace = shouldOpenUpward ? spaceAbove : spaceBelow;

    this.opensUpward.set(shouldOpenUpward);
    this.menuMaxHeight.set(Math.max(96, Math.min(240, availableSpace)));
  }

  private scrollActiveOptionIntoView(): void {
    queueMicrotask(() => {
      const index = this.activeIndex();
      if (index < 0) return;
      this.optionElements()[index]?.nativeElement.scrollIntoView({ block: 'nearest' });
    });
  }
}

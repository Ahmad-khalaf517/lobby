import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  LucideArrowRight,
  LucideCheck,
  LucideChevronDown,
  LucideCopy,
  LucideMaximize2,
  LucideInfo,
  LucideLink,
  LucideLogOut,
  LucideLock,
  LucideMessageCircle,
  LucideMic,
  LucideMicOff,
  LucideMinimize2,
  LucidePanelRightClose,
  LucidePanelRightOpen,
  LucidePencil,
  LucidePhone,
  LucidePhoneOff,
  LucidePlus,
  LucideRefreshCw,
  LucideReply,
  LucideScreenShare,
  LucideScreenShareOff,
  LucideSend,
  LucideSmile,
  LucideTrash2,
  LucideTriangleAlert,
  LucideUserMinus,
  LucideUsers,
  LucideX,
  LucideDynamicIcon,
} from '@lucide/angular';

const LOBBY_ICONS = {
  'arrow-right': LucideArrowRight,
  check: LucideCheck,
  'chevron-down': LucideChevronDown,
  copy: LucideCopy,
  expand: LucideMaximize2,
  info: LucideInfo,
  link: LucideLink,
  logout: LucideLogOut,
  lock: LucideLock,
  chat: LucideMessageCircle,
  mic: LucideMic,
  'mic-off': LucideMicOff,
  minimize: LucideMinimize2,
  'panel-close': LucidePanelRightClose,
  'panel-open': LucidePanelRightOpen,
  edit: LucidePencil,
  call: LucidePhone,
  'leave-call': LucidePhoneOff,
  plus: LucidePlus,
  refresh: LucideRefreshCw,
  reply: LucideReply,
  'screen-share': LucideScreenShare,
  'screen-share-off': LucideScreenShareOff,
  send: LucideSend,
  smile: LucideSmile,
  delete: LucideTrash2,
  warning: LucideTriangleAlert,
  'user-minus': LucideUserMinus,
  users: LucideUsers,
  close: LucideX,
} as const;

export type LobbyIconName = keyof typeof LOBBY_ICONS;

@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [LucideDynamicIcon],
  template: `<svg [lucideIcon]="icon()"></svg>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex shrink-0 items-center justify-center leading-none',
  },
})
export class LobbyIconComponent {
  name = input.required<LobbyIconName>();
  size = input<number>(10);
  strokeWidth = input<number>(1.8);

  protected readonly icon = computed(() => LOBBY_ICONS[this.name()]);
}

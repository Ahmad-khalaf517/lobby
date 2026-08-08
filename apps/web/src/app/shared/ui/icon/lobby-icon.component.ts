import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  LucideArrowRight,
  LucideCheck,
  LucideChevronDown,
  LucideCopy,
  LucideDownload,
  LucideMaximize2,
  LucideInfo,
  LucideLink,
  LucideLogOut,
  LucideLock,
  LucideBan,
  LucideEllipsis,
  LucideMessageCircle,
  LucideMic,
  LucideMicOff,
  LucideMinimize2,
  LucidePencil,
  LucidePhone,
  LucidePhoneOff,
  LucidePlus,
  LucideRefreshCw,
  LucideReply,
  LucideQrCode,
  LucideScreenShare,
  LucideScreenShareOff,
  LucideSend,
  LucideShare2,
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
  download: LucideDownload,
  expand: LucideMaximize2,
  info: LucideInfo,
  link: LucideLink,
  logout: LucideLogOut,
  lock: LucideLock,
  ban: LucideBan,
  more: LucideEllipsis,
  chat: LucideMessageCircle,
  mic: LucideMic,
  'mic-off': LucideMicOff,
  minimize: LucideMinimize2,
  edit: LucidePencil,
  call: LucidePhone,
  'leave-call': LucidePhoneOff,
  plus: LucidePlus,
  refresh: LucideRefreshCw,
  reply: LucideReply,
  qr: LucideQrCode,
  'screen-share': LucideScreenShare,
  'screen-share-off': LucideScreenShareOff,
  send: LucideSend,
  share: LucideShare2,
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

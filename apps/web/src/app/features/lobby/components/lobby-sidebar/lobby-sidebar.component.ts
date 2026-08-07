import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-lobby-sidebar',
  standalone: true,
  imports: [],
  templateUrl: './lobby-sidebar.component.html',
})
export class LobbySidebarComponent {
  @Output() selectSpace = new EventEmitter<string>();

  selectedSpaceId = 'dh';

  spaces = [
    { id: 'dh', name: 'Digital Hub', initials: 'DH', unread: 3, active: true },
    { id: 'fe', name: 'Frontend Team', initials: 'FE', unread: 0, active: false },
    { id: 'as', name: 'Angular Study', initials: 'AS', unread: 1, active: false },
    { id: 'pl', name: 'Project Lounge', initials: 'PL', unread: 0, active: false },
  ];

  channelsBySpace: Record<string, { id: string; name: string; active: boolean }[]> = {
    dh: [
      { id: 'general', name: 'General', active: true },
      { id: 'angular', name: 'Angular', active: false },
      { id: 'nestjs', name: 'NestJS', active: false },
      { id: 'resources', name: 'Resources', active: false },
    ],
    fe: [
      { id: 'general', name: 'General', active: true },
      { id: 'reviews', name: 'Code Reviews', active: false },
    ],
    as: [
      { id: 'general', name: 'General', active: true },
      { id: 'questions', name: 'Questions', active: false },
    ],
    pl: [
      { id: 'general', name: 'General', active: true },
      { id: 'random', name: 'Random', active: false },
    ],
  };

  get selectedChannels() {
    return this.channelsBySpace[this.selectedSpaceId] ?? [];
  }

  onSelectSpace(id: string) {
    this.selectedSpaceId = id;
    this.spaces = this.spaces.map((space) => ({
      ...space,
      active: space.id === id,
    }));
    this.selectSpace.emit(id);
  }
}

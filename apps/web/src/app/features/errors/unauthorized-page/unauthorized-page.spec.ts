import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UnauthorizedPage } from './unauthorized-page';

describe('UnauthorizedPage', () => {
  let component: UnauthorizedPage;
  let fixture: ComponentFixture<UnauthorizedPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UnauthorizedPage],
    }).compileComponents();

    fixture = TestBed.createComponent(UnauthorizedPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

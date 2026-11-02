import {
  isReturnVisitToProject,
  laterStartIsSeparateVisit,
} from './project-stint-boundary.util';

describe('project stint boundary', () => {
  it('treats Binghatti 19 → GCL 27 → Binghatti 28 as a return, not a moved start', () => {
    expect(
      isReturnVisitToProject({
        newStartDate: '2026-10-28',
        priorSameProjectDates: ['2026-10-19'],
        otherProjectDates: ['2026-10-27'],
      }),
    ).toBe(true);
  });

  it('treats a later start on the same project with no other site as a correction', () => {
    expect(
      isReturnVisitToProject({
        newStartDate: '2026-10-19',
        priorSameProjectDates: ['2026-10-01'],
        otherProjectDates: [],
      }),
    ).toBe(false);
  });

  it('does not treat the first Binghatti row of the month as a return', () => {
    expect(
      isReturnVisitToProject({
        newStartDate: '2026-10-19',
        priorSameProjectDates: [],
        otherProjectDates: [],
      }),
    ).toBe(false);
  });

  it('keeps the 28 Oct Binghatti row when GCL is between 19 and 28', () => {
    expect(
      laterStartIsSeparateVisit('2026-10-19', '2026-10-28', ['2026-10-27']),
    ).toBe(true);
  });

  it('drops a later same-project start when nothing else is between the dates', () => {
    expect(laterStartIsSeparateVisit('2026-08-01', '2026-08-10', [])).toBe(
      false,
    );
  });
});

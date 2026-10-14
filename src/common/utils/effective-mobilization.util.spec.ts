import {
  JobStatus,
  MobStatus,
  Mobilization,
} from '../../modules/mobilizations/entities/mobilization.entity';
import { getEffectiveMobilizationForDate } from './effective-mobilization.util';

function mob(
  partial: Pick<
    Mobilization,
    'actionDate' | 'projectId' | 'jobStatus' | 'mobStatus'
  > &
    Partial<Mobilization>,
): Mobilization {
  return {
    id: partial.id ?? 1,
    employeeId: 1,
    mobilizedTradeId: 1,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as Mobilization;
}

describe('getEffectiveMobilizationForDate', () => {
  it('stays on new project after day-specific absent following a transfer', () => {
    const mobs = [
      mob({
        id: 3,
        actionDate: '2026-09-01' as any,
        projectId: 91,
        mobStatus: MobStatus.MOBILIZED,
        jobStatus: JobStatus.ABSENT,
      }),
      mob({
        id: 2,
        actionDate: '2026-08-31' as any,
        projectId: 64,
        mobStatus: MobStatus.MOBILIZED,
        jobStatus: JobStatus.SICK_LEAVE,
      }),
      mob({
        id: 1,
        actionDate: '2026-08-10' as any,
        projectId: 64,
        mobStatus: MobStatus.MOBILIZED,
        jobStatus: JobStatus.ACTIVE,
      }),
      mob({
        id: 0,
        actionDate: '2026-09-01' as any,
        projectId: 91,
        mobStatus: MobStatus.MOBILIZED,
        jobStatus: JobStatus.ACTIVE,
      }),
    ].sort((a, b) => {
      const d = String(b.actionDate).localeCompare(String(a.actionDate));
      return d !== 0 ? d : (b.id ?? 0) - (a.id ?? 0);
    });

    const effective = getEffectiveMobilizationForDate(mobs, '2026-09-02');

    expect(effective?.projectId).toBe(91);
    expect(effective?.jobStatus).toBe(JobStatus.ACTIVE);
    expect(effective?.mobStatus).toBe(MobStatus.MOBILIZED);
  });
});

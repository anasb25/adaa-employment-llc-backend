import {
  getEffectiveMobilizationForDate,
  isAssignedToProject,
} from './effective-mobilization.util';
import {
  JobStatus,
  MobStatus,
} from '../../modules/mobilizations/entities/mobilization.entity';

const mk = (
  id: number,
  date: string,
  status: string,
  mobStatus: MobStatus,
  projectId: number | null,
  notes?: string | null,
) => ({
  id,
  employeeId: 1,
  actionDate: date,
  createdAt: new Date(`${date}T12:00:00Z`),
  jobStatus: status as any,
  mobStatus,
  projectId,
  notes: notes ?? null,
  mobilizedTradeId: 1,
});

describe('getEffectiveMobilizationForDate leave / remob', () => {
  it('keeps remobilized days active when a later urgent leave starts', () => {
    const mobs = [
      mk(
        9,
        '2026-03-25',
        JobStatus.URGENT_LEAVE,
        MobStatus.DEMOBILIZED,
        null,
        'Auto-synced; previousProjectId=5',
      ),
      mk(
        8,
        '2026-03-19',
        JobStatus.ACTIVE,
        MobStatus.MOBILIZED,
        5,
        'Remobilized from idle timesheet',
      ),
      mk(
        4,
        '2026-03-15',
        JobStatus.ACTIVE,
        MobStatus.MOBILIZED,
        5,
        'Remobilized from idle timesheet',
      ),
      mk(
        1,
        '2026-03-10',
        JobStatus.URGENT_LEAVE,
        MobStatus.DEMOBILIZED,
        null,
        'Auto-synced; previousProjectId=5',
      ),
    ];

    for (const day of ['2026-03-15', '2026-03-18', '2026-03-19', '2026-03-22']) {
      const eff = getEffectiveMobilizationForDate(mobs, day);
      expect(eff?.jobStatus).toBe(JobStatus.ACTIVE);
      expect(isAssignedToProject(eff, 5)).toBe(true);
    }

    for (const day of ['2026-03-25', '2026-03-26']) {
      const eff = getEffectiveMobilizationForDate(mobs, day);
      expect(eff?.jobStatus).toBe(JobStatus.URGENT_LEAVE);
      expect(isAssignedToProject(eff, 5)).toBe(false);
    }
  });

  it('shows urgent leave on idle days before remobilization', () => {
    const mobs = [
      mk(
        1,
        '2026-03-10',
        JobStatus.URGENT_LEAVE,
        MobStatus.DEMOBILIZED,
        null,
        'previousProjectId=5',
      ),
    ];

    const eff = getEffectiveMobilizationForDate(mobs, '2026-03-12');
    expect(eff?.jobStatus).toBe(JobStatus.URGENT_LEAVE);
    expect(isAssignedToProject(eff, 5)).toBe(false);
  });

  it('keeps Jul 8 active when backdated urgent leave is set on Jul 7', () => {
    const mobs = [
      mk(
        3,
        '2026-07-07',
        JobStatus.URGENT_LEAVE,
        MobStatus.DEMOBILIZED,
        null,
        'previousProjectId=5',
      ),
      mk(
        2,
        '2026-07-08',
        JobStatus.ACTIVE,
        MobStatus.MOBILIZED,
        5,
        'Remobilized from idle timesheet',
      ),
      mk(
        1,
        '2026-07-08',
        JobStatus.URGENT_LEAVE,
        MobStatus.DEMOBILIZED,
        null,
        'Auto-synced from timesheet - Auto-demobilized; previousProjectId=5',
      ),
    ];

    expect(getEffectiveMobilizationForDate(mobs, '2026-07-07')?.jobStatus).toBe(
      JobStatus.URGENT_LEAVE,
    );
    expect(getEffectiveMobilizationForDate(mobs, '2026-07-08')?.jobStatus).toBe(
      JobStatus.ACTIVE,
    );
    expect(isAssignedToProject(getEffectiveMobilizationForDate(mobs, '2026-07-08'), 5)).toBe(
      true,
    );
  });
});

import {
  Mobilization,
  MobStatus,
  JobStatus,
} from '../../modules/mobilizations/entities/mobilization.entity';
import { compareDateOnly, formatDateOnly } from './date.util';

const TERMINAL_PERMANENT = new Set([
  JobStatus.ABSCONDED,
  JobStatus.CANCELLED,
  JobStatus.RESIGNED,
  'absconded',
  'cancelled',
  'resigned',
]);

/** Statuses that must not appear on a project roster / timesheet / utilization. */
const HIDDEN_FROM_PROJECT_ROSTER = new Set([
  JobStatus.ANNUAL_LEAVE,
  JobStatus.IDLE,
  JobStatus.ABSCONDED,
  JobStatus.CANCELLED,
  JobStatus.RESIGNED,
  JobStatus.URGENT_LEAVE,
  'annual_leave',
  'idle',
  'absconded',
  'cancelled',
  'resigned',
  'urgent_leave',
]);

/** Day-specific statuses — apply only on their action date, not on carry-forward days. */
const TEMPORARY_STATUSES = [
  'absent',
  'sick_leave',
  'casual_leave',
  'urgent_leave',
  'off',
];

export function normalizeJobStatus(
  jobStatus: string | null | undefined,
): string | null {
  if (!jobStatus) return null;
  return String(jobStatus).toLowerCase();
}

export function isAutoSyncedFromTimesheet(mob: Mobilization): boolean {
  return !!mob.notes?.startsWith('Auto-synced from timesheet');
}

export function isExplicitRemobilization(mob: Mobilization): boolean {
  if (isAutoSyncedFromTimesheet(mob)) {
    return false;
  }
  const jobStatus = normalizeJobStatus(mob.jobStatus);
  return (
    mob.mobStatus === MobStatus.MOBILIZED &&
    jobStatus === JobStatus.ACTIVE &&
    mob.projectId !== null
  );
}

type MobilizationStatusContext = Pick<
  Mobilization,
  'jobStatus' | 'mobStatus' | 'projectId'
>;

/** Demobilized urgent leave persists on the idle sheet until remobilization. */
export function isDemobilizedUrgentLeave(
  mob: MobilizationStatusContext | undefined,
): boolean {
  if (!mob) return false;
  const jobStatus = normalizeJobStatus(mob.jobStatus);
  if (jobStatus !== JobStatus.URGENT_LEAVE) return false;
  return (
    mob.mobStatus === MobStatus.DEMOBILIZED ||
    mob.projectId === null
  );
}

export function isPersistentUntilRemobStatus(
  jobStatus: string | null | undefined,
  mob?: MobilizationStatusContext,
): boolean {
  if (mob && isDemobilizedUrgentLeave(mob)) {
    return true;
  }
  const normalized = normalizeJobStatus(jobStatus);
  if (!normalized) return false;
  return (
    TERMINAL_PERMANENT.has(normalized) ||
    normalized === JobStatus.ANNUAL_LEAVE ||
    normalized === JobStatus.IDLE
  );
}

export function shouldHideFromProjectRoster(
  jobStatus: string | null | undefined,
): boolean {
  const normalized = normalizeJobStatus(jobStatus);
  return normalized !== null && HIDDEN_FROM_PROJECT_ROSTER.has(normalized);
}

/**
 * Single rule for mobilization roster, project timesheet, and utilization reports:
 * employee is on a project when mobilized there and not on leave/terminal status.
 */
export function isAssignedToProject(
  effectiveMob: Mobilization | undefined,
  projectId: number,
): boolean {
  if (!effectiveMob || effectiveMob.projectId !== projectId) {
    return false;
  }
  const jobStatus = normalizeJobStatus(effectiveMob.jobStatus);
  if (!jobStatus || shouldHideFromProjectRoster(jobStatus)) {
    return false;
  }
  if (effectiveMob.mobStatus !== MobStatus.MOBILIZED) {
    return false;
  }
  return true;
}

/** Clear stale projectId on leave/terminal rows so grouping matches timesheets. */
export function normalizeMobilizationForProjectRoster(
  mob: Mobilization,
): Mobilization {
  if (mob.projectId === null) {
    return { ...mob, project: null };
  }
  if (!isAssignedToProject(mob, mob.projectId)) {
    return { ...mob, projectId: null, project: null };
  }
  return mob;
}

/** Day-specific statuses (absent, sick leave, etc.) apply only on their action date. */
export function isDaySpecificJobStatus(
  jobStatus: string | null | undefined,
  mob?: MobilizationStatusContext,
): boolean {
  if (mob && isDemobilizedUrgentLeave(mob)) {
    return false;
  }
  const normalized = normalizeJobStatus(jobStatus);
  return normalized !== null && TEMPORARY_STATUSES.includes(normalized);
}

/**
 * When multiple mobilizations share the same action date, prefer manual records
 * and day-specific statuses (e.g. absent) over auto-synced active rows.
 */
export function pickBestSameDayMobilization(
  sameDayMobs: Mobilization[],
): Mobilization | undefined {
  if (sameDayMobs.length === 0) {
    return undefined;
  }
  if (sameDayMobs.length === 1) {
    return sameDayMobs[0];
  }

  const manualMobs = sameDayMobs.filter((m) => !isAutoSyncedFromTimesheet(m));
  const pool = manualMobs.length > 0 ? manualMobs : sameDayMobs;

  const daySpecific = pool.find((m) => isDaySpecificJobStatus(m.jobStatus, m));
  if (daySpecific) {
    return daySpecific;
  }

  const nonActive = pool.find((m) => {
    const status = normalizeJobStatus(m.jobStatus);
    return status !== null && status !== JobStatus.ACTIVE;
  });
  if (nonActive) {
    return nonActive;
  }

  return pool[0];
}

export function resolveCarriedMobilization(
  mobilizationsUpToDate: Mobilization[],
  dateStr: string,
): Mobilization | undefined {
  if (mobilizationsUpToDate.length === 0) {
    return undefined;
  }

  const latestMob = mobilizationsUpToDate[0];
  const latestMobDateStr = formatDateOnly(latestMob.actionDate);

  if (latestMobDateStr === dateStr) {
    const sameDayMobs = mobilizationsUpToDate.filter(
      (m) => formatDateOnly(m.actionDate) === dateStr,
    );
    return pickBestSameDayMobilization(sameDayMobs) ?? latestMob;
  }

  if (isDaySpecificJobStatus(latestMob.jobStatus, latestMob)) {
    const nonTemporaryMob = mobilizationsUpToDate.find(
      (m, index) =>
        index > 0 && !isDaySpecificJobStatus(m.jobStatus, m),
    );

    if (nonTemporaryMob) {
      // Same project: resume prior status after a one-day leave (e.g. absent then active).
      if (
        latestMob.projectId != null &&
        nonTemporaryMob.projectId === latestMob.projectId
      ) {
        return {
          ...latestMob,
          jobStatus: nonTemporaryMob.jobStatus as JobStatus,
        };
      }

      // Transferred to a new project, then absent/sick/off on that project: stay on the
      // new project with a working status — do not revert to an older project stint.
      if (
        latestMob.projectId != null &&
        latestMob.mobStatus === MobStatus.MOBILIZED
      ) {
        const onSameProject = mobilizationsUpToDate.filter(
          (m) =>
            m.projectId === latestMob.projectId &&
            m.mobStatus === MobStatus.MOBILIZED,
        );
        const baselineOnProject = onSameProject.find(
          (m) => !isDaySpecificJobStatus(m.jobStatus, m),
        );
        return {
          ...latestMob,
          projectId: latestMob.projectId,
          mobStatus: MobStatus.MOBILIZED,
          jobStatus: (baselineOnProject?.jobStatus ??
            JobStatus.ACTIVE) as JobStatus,
        };
      }

      return nonTemporaryMob;
    }

    // No earlier baseline: do not keep the employee on the leave day's project.
    return {
      ...latestMob,
      jobStatus: JobStatus.ACTIVE,
      mobStatus: MobStatus.DEMOBILIZED,
      projectId: null,
      project: null,
    };
  }

  return latestMob;
}

export function getEffectiveMobilizationForDate(
  employeeMobilizations: Mobilization[],
  dateStr: string,
): Mobilization | undefined {
  const mobilizationsUpToDate = employeeMobilizations.filter((m) => {
    const mobDateStr = formatDateOnly(m.actionDate);
    return mobDateStr <= dateStr;
  });

  if (mobilizationsUpToDate.length === 0) {
    return undefined;
  }

  const mostRecentRemob = mobilizationsUpToDate.find((m) =>
    isExplicitRemobilization(m),
  );
  const mostRecentPersistent = mobilizationsUpToDate.find((m) =>
    isPersistentUntilRemobStatus(m.jobStatus, m),
  );

  if (mostRecentPersistent) {
    const persistentDate = formatDateOnly(mostRecentPersistent.actionDate);
    const remobAfterPersistent =
      mostRecentRemob &&
      compareDateOnly(
        formatDateOnly(mostRecentRemob.actionDate),
        persistentDate,
      ) > 0;

    if (!remobAfterPersistent) {
      if (compareDateOnly(dateStr, persistentDate) >= 0) {
        return mostRecentPersistent;
      }
    } else {
      const remobDate = formatDateOnly(mostRecentRemob!.actionDate);
      if (compareDateOnly(dateStr, remobDate) >= 0) {
        const sinceRemob = mobilizationsUpToDate.filter(
          (m) => compareDateOnly(formatDateOnly(m.actionDate), remobDate) >= 0,
        );
        return resolveCarriedMobilization(sinceRemob, dateStr);
      }
      if (compareDateOnly(dateStr, persistentDate) >= 0) {
        return mostRecentPersistent;
      }
    }
  }

  return resolveCarriedMobilization(mobilizationsUpToDate, dateStr);
}

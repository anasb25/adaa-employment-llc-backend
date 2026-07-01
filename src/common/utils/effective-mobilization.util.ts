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

const TEMPORARY_STATUSES = [
  'absent',
  'sick_leave',
  'casual_leave',
  'urgent_leave',
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

export function isPersistentUntilRemobStatus(
  jobStatus: string | null | undefined,
): boolean {
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
    return latestMob;
  }

  if (TEMPORARY_STATUSES.includes(latestMob.jobStatus)) {
    const nonTemporaryMob = mobilizationsUpToDate.find(
      (m, index) => index > 0 && !TEMPORARY_STATUSES.includes(m.jobStatus),
    );

    if (nonTemporaryMob) {
      return {
        ...latestMob,
        jobStatus: nonTemporaryMob.jobStatus as JobStatus,
      };
    }

    return {
      ...latestMob,
      jobStatus: JobStatus.ACTIVE,
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
    isPersistentUntilRemobStatus(m.jobStatus),
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

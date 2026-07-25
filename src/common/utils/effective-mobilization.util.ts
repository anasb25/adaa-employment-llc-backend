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

const TEMPORARY_STATUSES = ['absent', 'sick_leave', 'casual_leave'];

export function normalizeJobStatus(
  jobStatus: string | null | undefined,
): string | null {
  if (!jobStatus) return null;
  return String(jobStatus).toLowerCase();
}

export function isAutoSyncedFromTimesheet(mob: Mobilization): boolean {
  return !!mob.notes?.startsWith('Auto-synced from timesheet');
}

export function isRemobilizedFromIdleSheet(mob: Mobilization): boolean {
  return !!mob.notes?.startsWith('Remobilized from idle timesheet');
}

export function isExplicitRemobilization(mob: Mobilization): boolean {
  if (isAutoSyncedFromTimesheet(mob)) {
    return false;
  }
  if (mob.mobStatus !== MobStatus.MOBILIZED || mob.projectId === null) {
    return false;
  }
  if (isRemobilizedFromIdleSheet(mob)) {
    return true;
  }
  const jobStatus = normalizeJobStatus(mob.jobStatus);
  return (
    jobStatus === JobStatus.ACTIVE || jobStatus === JobStatus.NOTICE_PERIOD
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
    normalized === JobStatus.URGENT_LEAVE ||
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
): boolean {
  const normalized = normalizeJobStatus(jobStatus);
  return normalized !== null && TEMPORARY_STATUSES.includes(normalized);
}

/**
 * When multiple mobilizations share the same action date, prefer explicit remob,
 * manual records, and day-specific statuses over auto-synced rows.
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

  const explicitRemob = sameDayMobs.find((m) => isExplicitRemobilization(m));
  if (explicitRemob) {
    return explicitRemob;
  }

  const manualMobs = sameDayMobs.filter((m) => !isAutoSyncedFromTimesheet(m));
  const pool = manualMobs.length > 0 ? manualMobs : sameDayMobs;

  const daySpecific = pool.find((m) => isDaySpecificJobStatus(m.jobStatus));
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

  if (isDaySpecificJobStatus(latestMob.jobStatus)) {
    const nonTemporaryMob = mobilizationsUpToDate.find(
      (m, index) => index > 0 && !isDaySpecificJobStatus(m.jobStatus),
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

function hasSameDayExplicitRemob(
  mobilizationsNewestFirst: Mobilization[],
  mobDateStr: string,
): boolean {
  return mobilizationsNewestFirst.some(
    (m) =>
      formatDateOnly(m.actionDate) === mobDateStr &&
      isExplicitRemobilization(m),
  );
}

function findNewestPersistentLeaveUpTo(
  mobilizationsNewestFirst: Mobilization[],
  dateStr: string,
): Mobilization | undefined {
  for (const mob of mobilizationsNewestFirst) {
    const mobDateStr = formatDateOnly(mob.actionDate);
    if (compareDateOnly(mobDateStr, dateStr) > 0) {
      continue;
    }
    if (!isPersistentUntilRemobStatus(mob.jobStatus)) {
      continue;
    }
    // Same-day remob ends leave on that date — look for an earlier leave start.
    if (hasSameDayExplicitRemob(mobilizationsNewestFirst, mobDateStr)) {
      continue;
    }
    return mob;
  }
  return undefined;
}

function findNewestRemobAfterLeaveUpTo(
  mobilizationsNewestFirst: Mobilization[],
  dateStr: string,
  leaveDateStr: string,
): Mobilization | undefined {
  for (const mob of mobilizationsNewestFirst) {
    const mobDateStr = formatDateOnly(mob.actionDate);
    if (compareDateOnly(mobDateStr, dateStr) > 0) {
      continue;
    }
    if (!isExplicitRemobilization(mob)) {
      continue;
    }
    // Remob on the leave start date itself also ends leave for that day onward.
    if (compareDateOnly(mobDateStr, leaveDateStr) < 0) {
      continue;
    }
    return mob;
  }
  return undefined;
}

/**
 * Resolve the effective mobilization for one calendar day.
 * Leave (idle / annual / urgent) persists until an explicit remobilization on
 * or after the leave start. A later leave period only affects dates on/after
 * that later leave start — remobilized days before it stay on the project.
 */
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

  const governingLeave = findNewestPersistentLeaveUpTo(
    mobilizationsUpToDate,
    dateStr,
  );

  if (!governingLeave) {
    return resolveCarriedMobilization(mobilizationsUpToDate, dateStr);
  }

  const leaveDateStr = formatDateOnly(governingLeave.actionDate);

  if (compareDateOnly(dateStr, leaveDateStr) < 0) {
    return resolveCarriedMobilization(mobilizationsUpToDate, dateStr);
  }

  const governingRemob = findNewestRemobAfterLeaveUpTo(
    mobilizationsUpToDate,
    dateStr,
    leaveDateStr,
  );

  if (!governingRemob) {
    return governingLeave;
  }

  const remobDateStr = formatDateOnly(governingRemob.actionDate);

  // A newer leave period after the remob overrides the remob from its start date.
  const laterLeave = findNewestPersistentLeaveUpTo(
    mobilizationsUpToDate.filter(
      (m) => compareDateOnly(formatDateOnly(m.actionDate), remobDateStr) > 0,
    ),
    dateStr,
  );

  if (laterLeave) {
    const laterLeaveDateStr = formatDateOnly(laterLeave.actionDate);
    if (compareDateOnly(dateStr, laterLeaveDateStr) >= 0) {
      const remobAfterLaterLeave = findNewestRemobAfterLeaveUpTo(
        mobilizationsUpToDate,
        dateStr,
        laterLeaveDateStr,
      );
      if (
        remobAfterLaterLeave &&
        compareDateOnly(dateStr, formatDateOnly(remobAfterLaterLeave.actionDate)) >=
          0
      ) {
        const sinceLaterRemob = mobilizationsUpToDate.filter(
          (m) =>
            compareDateOnly(
              formatDateOnly(m.actionDate),
              formatDateOnly(remobAfterLaterLeave.actionDate),
            ) >= 0,
        );
        return resolveCarriedMobilization(sinceLaterRemob, dateStr);
      }
      return laterLeave;
    }
  }

  if (compareDateOnly(dateStr, remobDateStr) >= 0) {
    const sinceRemob = mobilizationsUpToDate.filter(
      (m) => compareDateOnly(formatDateOnly(m.actionDate), remobDateStr) >= 0,
    );
    return resolveCarriedMobilization(sinceRemob, dateStr);
  }

  return governingLeave;
}

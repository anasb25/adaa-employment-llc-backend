import { compareDateOnly } from '../../../common/utils/date.util';

/**
 * True when another project sits between an earlier visit to this project and
 * the new start. That is a return (Binghatti → GCL → Binghatti), not a correction
 * of the same stint's start date.
 */
export function isReturnVisitToProject(options: {
  newStartDate: string;
  priorSameProjectDates: string[];
  otherProjectDates: string[];
}): boolean {
  return options.otherProjectDates.some((otherDate) => {
    if (compareDateOnly(otherDate, options.newStartDate) >= 0) {
      return false;
    }
    return options.priorSameProjectDates.some(
      (priorDate) => compareDateOnly(otherDate, priorDate) > 0,
    );
  });
}

/** Later row on the same project is a separate visit when another site is between the two dates. */
export function laterStartIsSeparateVisit(
  earlierDate: string,
  laterDate: string,
  otherProjectDates: string[],
): boolean {
  return otherProjectDates.some(
    (date) =>
      compareDateOnly(date, earlierDate) > 0 &&
      compareDateOnly(date, laterDate) < 0,
  );
}

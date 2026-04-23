import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Business rule: an idle employee is, by definition, demobilized and not
 * assigned to any project. This migration fixes any legacy rows that violate
 * that rule (mobStatus='mobilized' with jobStatus='idle') so their hours stop
 * being attributed to the project they were last assigned to.
 *
 * Idempotent: safe to run multiple times.
 */
export class NormalizeIdleMobilizations1775300000000
  implements MigrationInterface
{
  name = 'NormalizeIdleMobilizations1775300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const result = await queryRunner.query(
      `UPDATE "mobilizations"
         SET "mobStatus" = 'demobilized',
             "projectId" = NULL
       WHERE "jobStatus" = 'idle'
         AND ("mobStatus" <> 'demobilized' OR "projectId" IS NOT NULL)`,
    );
    const affected = Array.isArray(result) ? result[1] : result;
    console.log(
      `Normalized ${affected ?? 'unknown number of'} idle mobilization records ` +
        `(forced mobStatus=demobilized, projectId=null).`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    console.log(
      'No-op: original mobStatus/projectId values for idle rows cannot be restored.',
    );
  }
}

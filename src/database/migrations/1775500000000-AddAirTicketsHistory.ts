import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAirTicketsHistory1775500000000 implements MigrationInterface {
  name = 'AddAirTicketsHistory1775500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD COLUMN IF NOT EXISTS "air_tickets_history" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "employees"."air_tickets_history" IS 'Audit log of air ticket balance changes: additions and subtractions with timestamps.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employees" DROP COLUMN IF EXISTS "air_tickets_history"`,
    );
  }
}

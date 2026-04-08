import { MigrationInterface, QueryRunner } from "typeorm";

export class DeleteAutoSyncedMobilizations1775200000000 implements MigrationInterface {
    name = 'DeleteAutoSyncedMobilizations1775200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const result = await queryRunner.query(
            `DELETE FROM "mobilizations" WHERE "notes" LIKE 'Auto-synced from timesheet%'`
        );
        console.log(`Deleted ${result[1] ?? 'unknown number of'} auto-synced mobilization records`);
    }

    public async down(_queryRunner: QueryRunner): Promise<void> {
        console.log('Cannot restore deleted auto-synced mobilization records');
    }
}

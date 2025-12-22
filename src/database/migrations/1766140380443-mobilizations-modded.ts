import { MigrationInterface, QueryRunner } from "typeorm";

export class MobilizationsModded1766140380443 implements MigrationInterface {
    name = 'MobilizationsModded1766140380443'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mobilizations" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."mobilizations_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."mobilizations_jobstatus_enum" RENAME TO "mobilizations_jobstatus_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."mobilizations_jobstatus_enum" AS ENUM('active', 'cancelled', 'absconded', 'on_vacation', 'absent', 'sick_leave', 'casual_leave', 'notice_period', 'resigned', 'idle')`);
        await queryRunner.query(`ALTER TABLE "mobilizations" ALTER COLUMN "jobStatus" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "mobilizations" ALTER COLUMN "jobStatus" TYPE "public"."mobilizations_jobstatus_enum" USING "jobStatus"::"text"::"public"."mobilizations_jobstatus_enum"`);
        await queryRunner.query(`ALTER TABLE "mobilizations" ALTER COLUMN "jobStatus" SET DEFAULT 'active'`);
        await queryRunner.query(`DROP TYPE "public"."mobilizations_jobstatus_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."mobilizations_jobstatus_enum_old" AS ENUM('on_job', 'cancelled', 'on_vacation', 'absconded')`);
        await queryRunner.query(`ALTER TABLE "mobilizations" ALTER COLUMN "jobStatus" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "mobilizations" ALTER COLUMN "jobStatus" TYPE "public"."mobilizations_jobstatus_enum_old" USING "jobStatus"::"text"::"public"."mobilizations_jobstatus_enum_old"`);
        await queryRunner.query(`ALTER TABLE "mobilizations" ALTER COLUMN "jobStatus" SET DEFAULT 'on_job'`);
        await queryRunner.query(`DROP TYPE "public"."mobilizations_jobstatus_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."mobilizations_jobstatus_enum_old" RENAME TO "mobilizations_jobstatus_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."mobilizations_status_enum" AS ENUM('active', 'inactive')`);
        await queryRunner.query(`ALTER TABLE "mobilizations" ADD "status" "public"."mobilizations_status_enum" NOT NULL DEFAULT 'active'`);
    }

}

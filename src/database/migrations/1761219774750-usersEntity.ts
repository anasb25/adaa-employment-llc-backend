import { MigrationInterface, QueryRunner } from "typeorm";

export class UsersEntity1761219774750 implements MigrationInterface {
    name = 'UsersEntity1761219774750'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "users" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "email" character varying NOT NULL, "firstName" character varying NOT NULL, "lastName" character varying NOT NULL, "password" character varying, "role" character varying NOT NULL DEFAULT 'user', "permissions" text, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "users"`);
    }

}

import { MigrationInterface, QueryRunner } from "typeorm";

export class RolesAndPermissions1761279000363 implements MigrationInterface {
    name = 'RolesAndPermissions1761279000363'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "permissions" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "name" character varying NOT NULL, "description" character varying, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_48ce552495d14eae9b187bb6716" UNIQUE ("name"), CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "roles" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "name" character varying NOT NULL, "description" character varying, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_648e3f5447f725579d7d4ffdfb7" UNIQUE ("name"), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."invitations_status_enum" AS ENUM('pending', 'accepted', 'expired', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "invitations" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "email" character varying NOT NULL, "token" character varying NOT NULL, "status" "public"."invitations_status_enum" NOT NULL DEFAULT 'pending', "expiresAt" TIMESTAMP NOT NULL, "roleId" integer, "inviterId" integer NOT NULL, "acceptedAt" TIMESTAMP, "acceptedById" integer, CONSTRAINT "UQ_97ab59cb592c7cec109741b592d" UNIQUE ("email"), CONSTRAINT "UQ_e577dcf9bb6d084373ed3998509" UNIQUE ("token"), CONSTRAINT "PK_5dec98cfdfd562e4ad3648bbb07" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "role_permissions" ("roleId" integer NOT NULL, "permissionId" integer NOT NULL, CONSTRAINT "PK_d430a02aad006d8a70f3acd7d03" PRIMARY KEY ("roleId", "permissionId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b4599f8b8f548d35850afa2d12" ON "role_permissions" ("roleId") `);
        await queryRunner.query(`CREATE INDEX "IDX_06792d0c62ce6b0203c03643cd" ON "role_permissions" ("permissionId") `);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "permissions"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "roleId" integer`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_368e146b785b574f42ae9e53d5e" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invitations" ADD CONSTRAINT "FK_7f2c37e6463b81cf0f2c72d2819" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invitations" ADD CONSTRAINT "FK_925ca5a02bf01ec03252a3050fd" FOREIGN KEY ("inviterId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invitations" ADD CONSTRAINT "FK_2c2b945d55160f5ddccea8b6467" FOREIGN KEY ("acceptedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_b4599f8b8f548d35850afa2d12c" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_06792d0c62ce6b0203c03643cdd" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_06792d0c62ce6b0203c03643cdd"`);
        await queryRunner.query(`ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_b4599f8b8f548d35850afa2d12c"`);
        await queryRunner.query(`ALTER TABLE "invitations" DROP CONSTRAINT "FK_2c2b945d55160f5ddccea8b6467"`);
        await queryRunner.query(`ALTER TABLE "invitations" DROP CONSTRAINT "FK_925ca5a02bf01ec03252a3050fd"`);
        await queryRunner.query(`ALTER TABLE "invitations" DROP CONSTRAINT "FK_7f2c37e6463b81cf0f2c72d2819"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_368e146b785b574f42ae9e53d5e"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "roleId"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "permissions" text`);
        await queryRunner.query(`ALTER TABLE "users" ADD "role" character varying NOT NULL DEFAULT 'user'`);
        await queryRunner.query(`DROP INDEX "public"."IDX_06792d0c62ce6b0203c03643cd"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b4599f8b8f548d35850afa2d12"`);
        await queryRunner.query(`DROP TABLE "role_permissions"`);
        await queryRunner.query(`DROP TABLE "invitations"`);
        await queryRunner.query(`DROP TYPE "public"."invitations_status_enum"`);
        await queryRunner.query(`DROP TABLE "roles"`);
        await queryRunner.query(`DROP TABLE "permissions"`);
    }

}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProfiles1725100000000 implements MigrationInterface {
  name = 'CreateProfiles1725100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE "profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "public_identifier" character varying(255) NOT NULL,
        "linkedin_url" character varying(500) NOT NULL,
        "profile_data" jsonb NOT NULL,
        "content_hash" character varying(64) NOT NULL,
        "source_status" character varying(50) NOT NULL DEFAULT 'success',
        "fetched_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "cache_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_profiles_public_identifier" UNIQUE ("public_identifier")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_profiles_cache_expires_at" ON "profiles" ("cache_expires_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_profiles_fetched_at" ON "profiles" ("fetched_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_profiles_fetched_at"`);
    await queryRunner.query(`DROP INDEX "IDX_profiles_cache_expires_at"`);
    await queryRunner.query(`DROP TABLE "profiles"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProfileFetches1725100000001 implements MigrationInterface {
  name = 'CreateProfileFetches1725100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "profile_fetches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "public_identifier" character varying(255) NOT NULL,
        "outcome" character varying(50) NOT NULL,
        "duration_ms" integer,
        "error_category" character varying(100),
        "http_status" integer,
        "is_cache_hit" boolean NOT NULL DEFAULT false,
        "fetched_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_profile_fetches" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_profile_fetches_public_identifier" ON "profile_fetches" ("public_identifier")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_profile_fetches_fetched_at" ON "profile_fetches" ("fetched_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_profile_fetches_outcome" ON "profile_fetches" ("outcome")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_profile_fetches_outcome"`);
    await queryRunner.query(`DROP INDEX "IDX_profile_fetches_fetched_at"`);
    await queryRunner.query(`DROP INDEX "IDX_profile_fetches_public_identifier"`);
    await queryRunner.query(`DROP TABLE "profile_fetches"`);
  }
}

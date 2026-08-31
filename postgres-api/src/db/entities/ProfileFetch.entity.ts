import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import type { FetchOutcome } from '../../services/linkedin/types.js';

@Entity('profile_fetches')
export class ProfileFetch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'public_identifier', type: 'varchar', length: 255 })
  publicIdentifier!: string;

  @Index()
  @Column({ name: 'outcome', type: 'varchar', length: 50 })
  outcome!: FetchOutcome;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs!: number | null;

  @Column({ name: 'error_category', type: 'varchar', length: 100, nullable: true })
  errorCategory!: string | null;

  @Column({ name: 'http_status', type: 'integer', nullable: true })
  httpStatus!: number | null;

  @Column({ name: 'is_cache_hit', type: 'boolean', default: false })
  isCacheHit!: boolean;

  @Index()
  @Column({ name: 'fetched_at', type: 'timestamptz', default: () => 'NOW()' })
  fetchedAt!: Date;
}

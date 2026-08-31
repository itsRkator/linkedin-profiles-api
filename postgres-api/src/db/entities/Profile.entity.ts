import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import type { NormalizedProfile } from '../../services/linkedin/types.js';

@Entity('profiles')
export class Profile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'public_identifier', type: 'varchar', length: 255 })
  publicIdentifier!: string;

  @Column({ name: 'linkedin_url', type: 'varchar', length: 500 })
  linkedinUrl!: string;

  @Column({ name: 'profile_data', type: 'jsonb' })
  profileData!: NormalizedProfile;

  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash!: string;

  @Column({ name: 'source_status', type: 'varchar', length: 50, default: 'success' })
  sourceStatus!: string;

  @Column({ name: 'fetched_at', type: 'timestamptz', default: () => 'NOW()' })
  fetchedAt!: Date;

  @Index()
  @Column({ name: 'cache_expires_at', type: 'timestamptz' })
  cacheExpiresAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

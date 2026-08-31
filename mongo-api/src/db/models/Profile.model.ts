import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import type { NormalizedProfile } from '../../services/linkedin/types.js';

const profileSchema = new Schema(
  {
    publicIdentifier: { type: String, required: true, unique: true, index: true },
    linkedinUrl: { type: String, required: true },
    profileData: { type: Schema.Types.Mixed, required: true },
    contentHash: { type: String, required: true },
    sourceStatus: { type: String, required: true, default: 'success' },
    fetchedAt: { type: Date, required: true, index: true },
    cacheExpiresAt: { type: Date, required: true, index: true },
  },
  {
    timestamps: true,
    collection: 'profiles',
  },
);

export type ProfileDocument = InferSchemaType<typeof profileSchema> & {
  _id: mongoose.Types.ObjectId;
  profileData: NormalizedProfile;
  createdAt: Date;
  updatedAt: Date;
};

export const ProfileModel =
  mongoose.models.Profile ?? mongoose.model('Profile', profileSchema);

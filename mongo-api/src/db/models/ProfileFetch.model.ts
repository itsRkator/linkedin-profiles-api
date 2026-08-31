import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import type { FetchOutcome } from '../../services/linkedin/types.js';

const profileFetchSchema = new Schema(
  {
    publicIdentifier: { type: String, required: true, index: true },
    outcome: { type: String, required: true, index: true },
    durationMs: { type: Number, default: null },
    errorCategory: { type: String, default: null },
    httpStatus: { type: Number, default: null },
    isCacheHit: { type: Boolean, required: true, default: false },
    fetchedAt: { type: Date, required: true, default: Date.now, index: true },
  },
  {
    timestamps: false,
    collection: 'profile_fetches',
  },
);

export type ProfileFetchDocument = InferSchemaType<typeof profileFetchSchema> & {
  _id: mongoose.Types.ObjectId;
  outcome: FetchOutcome;
};

export const ProfileFetchModel =
  mongoose.models.ProfileFetch ?? mongoose.model('ProfileFetch', profileFetchSchema);

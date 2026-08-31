import { Router } from 'express';
import { createOrFetchProfile, getProfileByIdentifier } from '../controllers/profile.controller.js';

const router = Router();

router.post('/', createOrFetchProfile);
router.get('/:publicIdentifier', getProfileByIdentifier);

export default router;

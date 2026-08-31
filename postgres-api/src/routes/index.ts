import { Router } from 'express';
import healthRoute from './health.route.js';
import profileRoute from './profile.route.js';

const router = Router();

router.use('/health', healthRoute);
router.use('/v1/profiles', profileRoute);

export default router;

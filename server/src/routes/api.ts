import { Router } from 'express';
import * as dashboard from '../controllers/dashboardController.js';

export const apiRouter = Router();

apiRouter.get('/health', dashboard.health);
apiRouter.get('/meta', dashboard.meta);
apiRouter.get('/summary', dashboard.summary);
apiRouter.get('/instruments-performance', dashboard.instrumentsPerformance);
apiRouter.get('/daily-pnl', dashboard.dailyPnl);
apiRouter.get('/instruments', dashboard.instruments);
apiRouter.post('/refresh', dashboard.triggerRefresh);

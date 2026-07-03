import { Router } from 'express'
import creatorRouter from './creator'
import growthRouter from './growth'
import healthRouter from './health'
import marketRouter from './market'
import monitorRouter from './monitor'
import poolsRouter from './pools'

const router = Router()

router.use('/creator', creatorRouter)
router.use('/growth', growthRouter)
router.use('/health', healthRouter)
router.use('/market', marketRouter)
router.use('/monitor', monitorRouter)
router.use('/pools', poolsRouter)

export default router

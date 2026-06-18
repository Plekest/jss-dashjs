import express from 'express'
import cors from 'cors'
import datasetsRouter from './routes/datasets.js'
import dashboardsRouter from './routes/dashboards.js'
import connectionsRouter from './routes/connections.js'

const app = express()

app.use(cors())
app.use(express.json({ limit: '50mb' }))

app.use('/api/datasets', datasetsRouter)
app.use('/api/dashboards', dashboardsRouter)
app.use('/api/connections', connectionsRouter)
app.get('/api/health', (_req, res) => res.json({ ok: true }))

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => {
  console.log(`API running on port ${port}`)
})

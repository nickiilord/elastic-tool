import { app } from 'electron'

export interface MetricsSample {
  rssBytes: number
  cpuPercent: number
}

export class MetricsSampler {
  private timer: NodeJS.Timeout | null = null

  start(onSample: (sample: MetricsSample) => void): void {
    if (this.timer) return
    const tick = async (): Promise<void> => {
      try {
        const memory = await process.getProcessMemoryInfo()
        const metrics = app.getAppMetrics()
        const cpu = metrics.reduce((sum, metric) => sum + (metric.cpu?.percentCPUUsage ?? 0), 0)
        onSample({ rssBytes: memory.residentSet * 1024, cpuPercent: Math.round(cpu) })
      } catch {
        // 采样失败不影响主流程
      }
    }
    void tick()
    this.timer = setInterval(() => void tick(), 2000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}

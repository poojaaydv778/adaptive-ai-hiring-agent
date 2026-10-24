import type { ReactNode } from 'react'

type Props = { label: string; value: string | number; detail: string; icon: ReactNode; tone?: string }
export default function MetricCard({ label, value, detail, icon, tone = 'blue' }: Props) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-detail">{detail}</div></div>
}

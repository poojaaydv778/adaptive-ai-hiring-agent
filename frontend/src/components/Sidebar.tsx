import { Bot, BriefcaseBusiness, ClipboardCheck, LayoutDashboard, Plus, ShieldCheck } from 'lucide-react'
import type { ViewName } from '../types'

interface Props {
  view: ViewName
  onNavigate: (view: ViewName) => void
  interviewCount: number
  completedCount: number
  onCreate: () => void
}

export default function Sidebar({ view, onNavigate, interviewCount, completedCount, onCreate }: Props) {
  const items: { label: string; key: ViewName; icon: typeof LayoutDashboard; count?: number }[] = [
    { label: 'Overview', key: 'overview', icon: LayoutDashboard },
    { label: 'Interviews', key: 'interviews', icon: BriefcaseBusiness, count: interviewCount },
    { label: 'Assessments', key: 'assessment', icon: ClipboardCheck, count: completedCount },
  ]
  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark"><Bot size={22} strokeWidth={2.4} /></div>
        <div><div className="brand-name">TalentLens</div><div className="brand-tag">AI INTERVIEW LAB</div></div>
      </div>
      <button className="sidebar-create" onClick={onCreate}><Plus size={17} /> New interview</button>
      <div className="nav-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        {items.map(item => {
          const Icon = item.icon
          const active = view === item.key || (item.key === 'assessment' && view === 'assessment')
          return <button className={`nav-item ${active ? 'active' : ''}`} key={item.key} onClick={() => onNavigate(item.key)}>
            <Icon size={18} /><span>{item.label}</span>{item.count !== undefined && <span className="nav-count">{item.count}</span>}
          </button>
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="privacy-card"><ShieldCheck size={18} /><div><strong>Evidence first</strong><p>Job-related criteria only. Final decisions stay with people.</p></div></div>
        <div className="workspace-user"><div className="user-avatar">HR</div><div className="user-details"><strong>Recruiter workspace</strong><span>Prototype environment</span></div><span className="online-dot" /></div>
      </div>
    </aside>
  )
}

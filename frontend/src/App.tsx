import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, ChevronDown, CircleHelp, Search, ShieldCheck } from 'lucide-react'
import { api } from './api'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import UploadPanel from './components/UploadPanel'
import InterviewRoom from './components/InterviewRoom'
import AssessmentPanel from './components/AssessmentPanel'
import type { CreateInterviewPayload, Interview, ViewName } from './types'

const pageNames: Record<ViewName, string> = { overview: 'Overview', create: 'Create interview', interview: 'Live interview', assessment: 'Assessment report', interviews: 'Interview library' }

export default function App() {
  const [view, setView] = useState<ViewName>('overview')
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [current, setCurrent] = useState<Interview | null>(null)
  const [loading, setLoading] = useState(false)
  const [answering, setAnswering] = useState(false)
  const [error, setError] = useState('')
  const [backendOnline, setBackendOnline] = useState(false)
  const [llmEnabled, setLlmEnabled] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const completedCount = useMemo(() => interviews.filter(item => item.status === 'completed').length, [interviews])

  const refresh = useCallback(async () => {
    try {
      const list = await api.listInterviews()
      setInterviews(list)
      setBackendOnline(true)
      const health = await api.health().catch(() => null)
      if (health) setLlmEnabled(health.llm_enabled)
    } catch { setBackendOnline(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const createInterview = async (payload: CreateInterviewPayload) => {
    setLoading(true); setError('')
    try {
      const created = await api.createInterview(payload)
      const started = await api.startInterview(created.id)
      setCurrent(started); setView('interview'); await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create interview.') }
    finally { setLoading(false) }
  }

  const openInterview = async (item: Interview) => {
    setError('')
    try {
      const fresh = await api.getInterview(item.id)
      if (fresh.status === 'ready') setCurrent(await api.startInterview(fresh.id))
      else setCurrent(fresh)
      setView(fresh.status === 'completed' ? 'assessment' : 'interview')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open interview.') }
  }

  const submitAnswer = async (answer: string) => {
    if (!current) return
    setAnswering(true); setError('')
    try {
      const updated = await api.submitAnswer(current.id, answer)
      setCurrent(updated)
      await refresh()
      if (updated.status === 'completed') setView('assessment')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save response.') }
    finally { setAnswering(false) }
  }

  const navigate = (target: ViewName) => {
    setError('')
    if (target === 'assessment') {
      const latest = [...interviews].find(item => item.status === 'completed')
      if (!latest) { setView('interviews'); return }
      void api.getInterview(latest.id).then(item => { setCurrent(item); setView('assessment') }).catch(() => setView('interviews'))
      return
    }
    setView(target)
  }

  const removeInterview = async (item: Interview) => {
    if (!window.confirm(`Delete the demo interview for ${item.candidate_name}?`)) return
    try { await api.deleteInterview(item.id); if (current?.id === item.id) setCurrent(null); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete interview.') }
  }

  const filtered = interviews.filter(item => `${item.candidate_name} ${item.job_title} ${item.status}`.toLowerCase().includes(searchQuery.toLowerCase()))

  return <div className="app-shell">
    <Sidebar view={view} onNavigate={navigate} interviewCount={interviews.length} completedCount={completedCount} onCreate={() => { setError(''); setView('create') }} />
    <div className="main-shell">
      <header className="topbar"><div className="topbar-title"><span className="topbar-mobile-mark">TL</span><span>{pageNames[view]}</span><span className={`api-status ${backendOnline ? 'connected' : ''}`}><i />{backendOnline ? 'Backend connected' : 'Backend offline'}</span></div><div className="topbar-actions"><div className="topbar-badge"><span className="topbar-badge-dot" /> DEMO ENVIRONMENT</div><button className="icon-button" title="Help and project information" onClick={() => window.alert('TalentLens prototype: use fictional data, cite answer evidence, and keep hiring decisions with human reviewers.')}><CircleHelp size={18} /></button><button className="icon-button" title="Notifications"><Bell size={18} /></button><div className="topbar-divider" /><button className="profile-button"><span className="profile-avatar">HR</span><span>Recruiter</span><ChevronDown size={14} /></button></div></header>
      {error && view !== 'create' && view !== 'interview' && <div className="global-error">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
      {view === 'overview' && <Dashboard interviews={interviews} onCreate={() => setView('create')} onOpen={openInterview} onNavigate={navigate} backendOnline={backendOnline} llmEnabled={llmEnabled} />}
      {view === 'create' && <UploadPanel onSubmit={createInterview} onCancel={() => setView('overview')} busy={loading} error={error} />}
      {view === 'interview' && current && <InterviewRoom interview={current} onAnswer={submitAnswer} onExit={() => { setError(''); setView('overview'); void refresh() }} busy={answering} error={error} />}
      {view === 'interview' && !current && <div className="page-content"><div className="surface empty-state"><h2>No active interview</h2><p>Create a new session from a fictional résumé and job description.</p><button className="primary-button" onClick={() => setView('create')}>Create interview</button></div></div>}
      {view === 'assessment' && current && <AssessmentPanel interview={current} onBack={() => { setView('interviews'); void refresh() }} onDecisionSaved={(updated) => { setCurrent(updated); setInterviews(previous => previous.map(item => item.id === updated.id ? updated : item)) }} />}
      {view === 'assessment' && !current && <div className="page-content"><div className="surface empty-state"><h2>No assessment selected</h2><p>Complete an interview to generate an evidence-linked report.</p><button className="primary-button" onClick={() => setView('interviews')}>Browse interviews</button></div></div>}
      {view === 'interviews' && <div className="page-content library-page"><div className="library-heading"><div><div className="eyebrow">WORKSPACE LIBRARY</div><h1>Interview sessions</h1><p className="page-intro">Open a session, review the report, or remove demo data.</p></div><button className="primary-button" onClick={() => setView('create')}>+ New interview</button></div><div className="surface library-surface"><div className="library-toolbar"><div className="search-field"><Search size={16} /><input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search candidate, role, or status" /></div><span>{filtered.length} sessions</span></div>{filtered.length === 0 ? <div className="empty-state"><div className="empty-icon"><Search size={22} /></div><h3>No matching sessions</h3><p>Create an interview to populate this library.</p><button className="secondary-button" onClick={() => setView('create')}>Create interview</button></div> : <div className="table-scroll"><table className="interview-table"><thead><tr><th>Candidate</th><th>Role</th><th>Status</th><th>Responses</th><th>Created</th><th>Actions</th></tr></thead><tbody>{filtered.map(item => <tr key={item.id}><td><div className="table-candidate"><span className="candidate-avatar small">{item.candidate_name.split(/\s+/).slice(0,2).map(word => word[0]).join('').toUpperCase()}</span><strong>{item.candidate_name}</strong></div></td><td>{item.job_title}</td><td><span className={`status-pill ${item.status}`}>{item.status === 'completed' ? 'Assessment ready' : item.status === 'in_progress' ? 'In progress' : 'Ready to start'}</span></td><td>{item.answers.length}</td><td>{new Date(item.created_at).toLocaleDateString()}</td><td><div className="table-actions"><button className="small-action" onClick={() => void openInterview(item)}>{item.status === 'completed' ? 'Review' : 'Open'}</button><button className="small-action danger" onClick={() => void removeInterview(item)}>Delete</button></div></td></tr>)}</tbody></table></div>}</div></div>}
      <footer className="app-footer"><span>TalentLens Prototype <span className="footer-separator">·</span> Adaptive AI Hiring Interview Agent</span><span><ShieldCheck size={13} /> Human review required</span></footer>
    </div>
  </div>
}

import { ArrowRight, ArrowUpRight, CheckCircle2, Clock3, FileText, MessageSquareText, Plus, Sparkles, Users } from 'lucide-react'
import MetricCard from './MetricCard'
import type { Interview, ViewName } from '../types'

interface Props {
  interviews: Interview[]
  onCreate: () => void
  onOpen: (interview: Interview) => void
  onNavigate: (view: ViewName) => void
  backendOnline: boolean
  llmEnabled: boolean
}
const statusLabel: Record<string, string> = { ready: 'Ready to start', in_progress: 'In progress', completed: 'Assessment ready' }

export default function Dashboard({ interviews, onCreate, onOpen, onNavigate, backendOnline, llmEnabled }: Props) {
  const completed = interviews.filter(item => item.status === 'completed')
  const inProgress = interviews.filter(item => item.status === 'in_progress')
  const recent = [...interviews].slice(0, 5)
  return <div className="page-content dashboard-page">
    <div className="welcome-row">
      <div><div className="eyebrow"><Sparkles size={14} /> RESPONSIBLE AI RECRUITING</div><h1>Interview with evidence.<br /><span>Hire with confidence.</span></h1><p className="page-intro">A structured interview workspace built to surface relevant examples, not assumptions.</p></div>
      <button className="primary-button" onClick={onCreate}><Plus size={17} /> Create interview</button>
    </div>
    <div className="metric-grid">
      <MetricCard label="Total interviews" value={interviews.length} detail="All saved sessions" icon={<Users size={19} />} tone="blue" />
      <MetricCard label="In progress" value={inProgress.length} detail="Awaiting candidate responses" icon={<Clock3 size={19} />} tone="amber" />
      <MetricCard label="Assessments ready" value={completed.length} detail="Evidence-linked summaries" icon={<CheckCircle2 size={19} />} tone="green" />
      <MetricCard label="Question library" value="Adaptive" detail={llmEnabled ? 'LLM-assisted generation on' : 'Transparent rules engine'} icon={<MessageSquareText size={19} />} tone="violet" />
    </div>
    <div className="dashboard-grid">
      <section className="surface recent-surface">
        <div className="section-heading"><div><h2>Recent interviews</h2><p>Continue a session or review finished evidence.</p></div><button className="text-button" onClick={() => onNavigate('interviews')}>View all <ArrowRight size={15} /></button></div>
        {recent.length === 0 ? <div className="empty-state compact"><div className="empty-icon"><FileText size={23} /></div><h3>Your workspace is ready</h3><p>Create an interview with a fictional résumé and role description to see the adaptive flow.</p><button className="secondary-button" onClick={onCreate}><Plus size={15} /> Set up first interview</button></div> : <div className="interview-list">{recent.map(item => <button key={item.id} className="interview-row" onClick={() => onOpen(item)}>
          <div className="candidate-avatar">{item.candidate_name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()}</div>
          <div className="interview-row-main"><strong>{item.candidate_name}</strong><span>{item.job_title}</span></div>
          <span className={`status-pill ${item.status}`}>{statusLabel[item.status]}</span><ArrowUpRight size={16} className="row-arrow" />
        </button>)}</div>}
      </section>
      <section className="surface start-surface">
        <div className="start-art"><div className="art-ring ring-one" /><div className="art-ring ring-two" /><div className="art-core"><Sparkles size={28} /></div><div className="art-chip chip-one"><CheckCircle2 size={14} /> Evidence linked</div><div className="art-chip chip-two"><MessageSquareText size={14} /> Adaptive follow-up</div></div>
        <div className="start-copy"><div className="mini-badge"><span className={`health-dot ${backendOnline ? 'online' : 'offline'}`} /> {backendOnline ? 'API connected' : 'API offline'}</div><h2>Make every question count.</h2><p>Start from the job requirements, explore a candidate's examples, and give reviewers evidence they can verify.</p><button className="primary-button full-width" onClick={onCreate}>Build an interview <ArrowRight size={16} /></button></div>
      </section>
    </div>
    <div className="principles-strip"><div className="principle"><div className="principle-icon blue"><FileText size={17} /></div><div><strong>Role-relevant questions</strong><span>Generated from the JD and résumé</span></div></div><div className="principle"><div className="principle-icon purple"><MessageSquareText size={17} /></div><div><strong>Adaptive follow-ups</strong><span>Ask for specifics when evidence is thin</span></div></div><div className="principle"><div className="principle-icon green"><CheckCircle2 size={17} /></div><div><strong>Human-reviewed outcome</strong><span>Scores support people, not replace them</span></div></div></div>
    {!backendOnline && <div className="inline-warning">Backend not reachable. Start the FastAPI server in the backend folder to load or save interviews.</div>}
  </div>
}

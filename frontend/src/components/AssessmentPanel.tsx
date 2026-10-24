import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowLeft, ArrowUpRight, Camera, CheckCircle2, Download, Eye, FileCheck2, Flag, ShieldCheck, Target, TrendingUp } from 'lucide-react'
import type { Interview, ProctoringSummary } from '../types'
import { api } from '../api'

interface Props { interview: Interview; onBack: () => void; onDecisionSaved?: (updated: Interview) => void }
const CRITERIA: { key: 'relevance' | 'specificity' | 'actions' | 'outcome'; title: string; description: string }[] = [
  { key: 'relevance', title: 'Role relevance', description: 'Addresses the job-related skill or requirement.' },
  { key: 'specificity', title: 'Specificity', description: 'Includes concrete context and details.' },
  { key: 'actions', title: 'Actions and ownership', description: 'Explains steps taken or decisions made.' },
  { key: 'outcome', title: 'Outcome or validation', description: 'Describes results, measurement, or how work was checked.' },
]
function exportJson(interview: Interview) {
  const data = { project: 'Adaptive AI Hiring Interview Agent', candidate: interview.candidate_name, role: interview.job_title, assessment: interview.assessment, responses: interview.answers, disclaimer: 'Decision support only. Human reviewers make all hiring decisions.' }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `assessment-${interview.id.slice(0, 8)}.json`; link.click(); URL.revokeObjectURL(url)
}
export default function AssessmentPanel({ interview, onBack, onDecisionSaved }: Props) {
  const assessment = interview.assessment
  const avg = useMemo(() => assessment?.average_score ?? 0, [assessment])
  const [decision, setDecision] = useState<'hired' | 'not_hired' | null>(assessment?.human_decision?.value ?? null)
  const [decisionBusy, setDecisionBusy] = useState(false)
  const [decisionError, setDecisionError] = useState('')
  const [proctoring, setProctoring] = useState<ProctoringSummary | null>(null)
  const [proctoringError, setProctoringError] = useState('')

  useEffect(() => {
    setDecision(assessment?.human_decision?.value ?? null)
    setDecisionError('')
  }, [interview.id, assessment?.human_decision?.value])


  useEffect(() => {
    let active = true
    api.getProctoringSummary(interview.id)
      .then(summary => { if (active) setProctoring(summary) })
      .catch(error => { if (active) setProctoringError(error instanceof Error ? error.message : 'Camera summary is unavailable.') })
    return () => { active = false }
  }, [interview.id])

  const recordDecision = async (nextDecision: 'hired' | 'not_hired') => {
    const label = nextDecision === 'hired' ? 'Hired' : 'Not hired'
    const confirmed = window.confirm(
      `Record the human hiring decision "${label}" for ${interview.candidate_name}?\n\n` +
      `The evidence coverage score is ${avg.toFixed(1)}/4. The score supports review but does not make the decision. ` +
      'This action records your decision as the human reviewer.'
    )
    if (!confirmed) return
    setDecisionBusy(true)
    setDecisionError('')
    try {
      const updated = await api.recordHumanDecision(interview.id, nextDecision)
      const saved = updated.assessment?.human_decision?.value ?? nextDecision
      setDecision(saved)
      onDecisionSaved?.(updated)
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : 'Could not save the human decision.')
    } finally {
      setDecisionBusy(false)
    }
  }
  if (!assessment) return <div className="page-content"><div className="surface empty-state"><h2>Assessment not ready</h2><p>Complete the mock interview before opening its assessment.</p><button className="primary-button" onClick={onBack}>Return to workspace</button></div></div>
  return <div className="page-content assessment-page">
    <div className="breadcrumb"><button onClick={onBack}><ArrowLeft size={15} /> Workspace</button><span>/</span><span>Assessment report</span></div>
    <div className="assessment-heading"><div><div className="eyebrow"><FileCheck2 size={14} /> EVIDENCE-BASED REPORT</div><h1>Candidate assessment</h1><p className="page-intro">A structured summary of interview responses, tied to job-related criteria.</p></div><button className="secondary-button" onClick={() => exportJson(interview)}><Download size={16} /> Export report</button></div>
    <div className="surface report-candidate"><div className="candidate-avatar large">{interview.candidate_name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()}</div><div className="report-person"><h2>{interview.candidate_name}</h2><p>{interview.job_title}</p><div className="report-meta"><span><CheckCircle2 size={14} /> Interview complete</span><span><FileCheck2 size={14} /> {interview.answers.length} responses evaluated</span></div></div><div className="overall-score"><div className="score-ring" style={{ background: `conic-gradient(#5d68dc ${avg / 4 * 100}%, #edf0f9 0)` }}><div><strong>{avg.toFixed(1)}</strong><span>/ 4</span></div></div><span>Evidence coverage score</span></div></div>
    <div className="report-grid">
      <section className="surface report-section"><div className="section-heading"><div><h2>Assessment summary</h2><p>Scores summarize job-related evidence, not a hiring recommendation.</p></div><div className="section-icon"><Target size={18} /></div></div><p className="assessment-summary">{assessment.summary}</p><div className="criterion-list">{CRITERIA.map(item => { const score = assessment.criterion_averages[item.key] ?? 0; return <div className="criterion-row" key={item.key}><div className="criterion-row-heading"><div><strong>{item.title}</strong><span>{item.description}</span></div><b>{score.toFixed(1)}<small> / 4</small></b></div><div className="criterion-track"><div style={{ width: `${score / 4 * 100}%` }} /></div></div>})}</div></section>
      <section className="surface report-section"><div className="section-heading"><div><h2>Demonstrated skills</h2><p>Only supported by interview evidence shown below.</p></div><div className="section-icon green"><TrendingUp size={18} /></div></div>{assessment.demonstrated_skills.length === 0 ? <div className="soft-empty">No skill met the prototype's threshold for clear evidence. Review the responses individually.</div> : <div className="finding-list">{assessment.demonstrated_skills.map((item, index) => <div className="finding-item" key={`${item.skill}-${index}`}><div className="finding-heading"><span className="finding-check"><CheckCircle2 size={16} /></span><strong>{item.skill}</strong><span className="finding-score">{item.score.toFixed(1)}/4</span></div><p>{item.label}</p><blockquote>“{item.evidence}”</blockquote><span className="evidence-source">From: {item.question}</span></div>)}</div>}</section>
      <section className="surface report-section"><div className="section-heading"><div><h2>Gaps in evidence</h2><p>Areas where the conversation did not yet establish enough detail.</p></div><div className="section-icon amber"><Flag size={18} /></div></div>{assessment.gaps.length === 0 ? <div className="soft-empty">No specific gap was flagged by the prototype's rules. Human validation is still needed.</div> : <div className="review-list">{assessment.gaps.map((item, index) => <div className="review-item" key={`${item.topic}-${index}`}><div className="review-item-title"><Flag size={14} /><strong>{item.topic}</strong></div><p>{item.reason}</p>{item.evidence && <blockquote>“{item.evidence}”</blockquote>}<span>Question: {item.question}</span></div>)}</div>}</section>
      <section className="surface report-section"><div className="section-heading"><div><h2>Human review queue</h2><p>Suggested follow-up topics for a recruiter.</p></div><div className="section-icon violet"><ArrowUpRight size={18} /></div></div>{assessment.review_topics.length === 0 ? <div className="soft-empty">Read all source responses and compare them with the role's actual requirements before making a decision.</div> : <div className="review-list">{assessment.review_topics.map((item, index) => <div className="review-item" key={`${item.topic}-${index}`}><div className="review-item-title"><ArrowUpRight size={14} /><strong>{item.topic}</strong></div><p>{item.reason}</p>{item.evidence && <blockquote>“{item.evidence}”</blockquote>}<span>Source question: {item.question}</span></div>)}</div>}</section>
    </div>
    <section className="surface full-report-section"><div className="section-heading"><div><h2>Response-by-response evidence</h2><p>Each rubric score is linked to the original answer text.</p></div><span className="evidence-count">{interview.answers.length} responses</span></div><div className="answer-evidence-list">{interview.answers.map((answer, index) => <article className="answer-evidence" key={`${answer.question_id}-${index}`}><div className="answer-evidence-top"><span className="answer-number">{String(index + 1).padStart(2, '0')}</span><div className="answer-q"><strong>{answer.question}</strong><span>{answer.skill}{answer.is_follow_up ? ' · Adaptive follow-up' : ''}</span></div><div className="answer-total"><strong>{answer.scores.total.toFixed(1)}</strong><small>/ 4</small></div></div><div className="answer-text"><span>Candidate response</span><p>{answer.answer || 'No response text saved.'}</p></div><div className="answer-rubric-mini">{CRITERIA.map(item => <div key={item.key}><span>{item.title}</span><strong>{answer.scores[item.key]}/4</strong></div>)}</div><div className="score-feedback"><ShieldCheck size={15} /><span>{answer.feedback}</span><em>{answer.scoring_mode === 'openai' ? 'LLM-assisted rubric' : 'Local rubric'}</em></div></article>)}</div></section>
    <section className="surface proctoring-report-section">
      <div className="section-heading">
        <div><h2><Camera size={17} /> Camera and YOLO technical observations</h2><p>Summarized object labels and frame-change signals from sampled camera frames.</p></div>
        <div className="section-icon violet"><Eye size={18} /></div>
      </div>
      {proctoringError ? <div className="soft-empty">No camera summary is available for this interview. {proctoringError}</div> : proctoring ? <>
        <div className="proctoring-metric-grid">
          <div className="proctoring-metric"><span>Frames analyzed</span><strong>{proctoring.frames_analyzed}</strong></div>
          <div className="proctoring-metric"><span>Frames with a person detected</span><strong>{proctoring.frames_with_person}</strong></div>
          <div className="proctoring-metric"><span>Frames with multiple people detected</span><strong>{proctoring.frames_with_multiple_people}</strong></div>
          <div className="proctoring-metric"><span>Frame-change events</span><strong>{proctoring.motion_events}</strong></div>
        </div>
        <div className="proctoring-object-row"><strong><Activity size={14} /> Object labels seen across sampled frames</strong>
          {proctoring.object_counts.length ? <div className="object-tags">{proctoring.object_counts.map(obj => <span key={obj.label}>{obj.label} <b>×{obj.count}</b></span>)}</div> : <p className="detection-empty">No object labels have been recorded for this interview.</p>}
        </div>
        <p className="proctoring-disclaimer">Privacy and fairness note: raw camera images are not saved. YOLO labels and frame-change counts are imperfect technical signals; they can be wrong and must not be treated as evidence of honesty, personality, cheating, job capability, or suitability. These observations are not included in the rubric score and must not determine the hiring outcome.</p>
      </> : <div className="soft-empty">Loading camera summary…</div>}
    </section>
    <section className="surface final-decision-section">
      <div className="final-decision-icon"><ShieldCheck size={24} /></div>
      <div className="final-decision-content">
        <div className="eyebrow">HUMAN OVERSIGHT</div>
        <h2>Final Hiring Decision — Human Review Required</h2>
        <p><strong>The AI agent does not make the final hiring decision.</strong>{' '}It provides job-related interview questions, rubric-based scores, response evidence, demonstrated skills, and areas requiring further review.</p>
        <p>Review the score alongside the original answers and job requirements. A human recruiter or authorized hiring-panel member must select and own the final outcome; the score never chooses automatically.</p>
        <div className="human-decision-actions" role="group" aria-label="Record human hiring decision">
          <button type="button" className={`human-choice-btn hire ${decision === 'hired' ? 'selected' : ''}`} onClick={() => void recordDecision('hired')} disabled={decisionBusy} aria-pressed={decision === 'hired'}>
            <CheckCircle2 size={17} /> {decisionBusy && decision === 'hired' ? 'Saving...' : 'Hired'}
          </button>
          <button type="button" className={`human-choice-btn not-hire ${decision === 'not_hired' ? 'selected' : ''}`} onClick={() => void recordDecision('not_hired')} disabled={decisionBusy} aria-pressed={decision === 'not_hired'}>
            <Flag size={17} /> {decisionBusy && decision === 'not_hired' ? 'Saving...' : 'Not hired'}
          </button>
        </div>
        {decision ? <div className={`final-decision-status ${decision === 'hired' ? 'is-hired' : 'is-not-hired'}`} role="status">
          <ShieldCheck size={15} /> Human decision recorded: <strong>{decision === 'hired' ? 'Hired' : 'Not hired'}</strong>
          {assessment?.human_decision?.recorded_at ? <span> · {new Date(assessment.human_decision.recorded_at).toLocaleString()}</span> : null}
        </div> : <p className="decision-pending-note">No final decision recorded yet. Review the evidence and select one option as the human reviewer.</p>}
        {decisionError && <p className="decision-error" role="alert">{decisionError}</p>}
      </div>
    </section>
  </div>
}

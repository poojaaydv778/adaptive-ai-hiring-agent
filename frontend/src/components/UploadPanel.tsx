import { useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, FileText, Info, Sparkles, UploadCloud, X } from 'lucide-react'
import type { CreateInterviewPayload } from '../types'

interface Props { onSubmit: (payload: CreateInterviewPayload) => Promise<void>; onCancel: () => void; busy: boolean; error: string }
const SAMPLE_JD = `Junior AI / ML Engineer\n\nWe are building web tools that help teams make decisions from structured data. The role involves writing Python services, building React interfaces, integrating REST APIs, and querying SQL databases. You will support machine-learning experiments, evaluate model output with clear metrics, validate data quality, and write tests.\n\nResponsibilities: implement maintainable Python APIs; build React and TypeScript components; work with SQL and relational data; use Git for review; document assumptions; measure results with repeatable tests. Experience with FastAPI, pandas, scikit-learn, and responsible AI practices is useful.`
const SAMPLE_RESUME = `Jordan Lee (fictional candidate)\n\nProject: Support Ticket Insights Dashboard\nBuilt a React and TypeScript dashboard that displayed ticket trends from a Python REST API. Added filters, loading and error states, and reusable components. Used SQL queries to group tickets by category and wrote basic API tests.\n\nProject: Review Topic Classifier (course project)\nUsed Python and pandas to clean a small labelled dataset, tried a scikit-learn baseline, and compared precision and recall on a held-out sample. Documented data limitations and common classification errors.\n\nTools: Python, React, TypeScript, SQL, REST APIs, Git, pandas, scikit-learn.\n\nNote: This is fictional sample data created for a demo.`

function FilePicker({ label, file, onChange }: { label: string; file: File | null; onChange: (file: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return <div className="file-picker-wrap"><input ref={ref} type="file" accept=".txt,.md,.pdf,.docx" hidden onChange={event => onChange(event.target.files?.[0] ?? null)} /><button type="button" className={`file-picker ${file ? 'has-file' : ''}`} onClick={() => ref.current?.click()}><div className="file-picker-icon"><UploadCloud size={18} /></div><div className="file-picker-copy"><strong>{file ? file.name : label}</strong><span>{file ? `${(file.size / 1024).toFixed(0)} KB · Click to replace` : 'PDF, DOCX, TXT or MD · max 5 MB'}</span></div>{file && <span role="button" tabIndex={0} className="remove-file" onClick={event => { event.stopPropagation(); onChange(null); if (ref.current) ref.current.value = '' }}><X size={15} /></span>}</button></div>
}

export default function UploadPanel({ onSubmit, onCancel, busy, error }: Props) {
  const [candidateName, setCandidateName] = useState('Jordan Lee (Fictional)')
  const [jobTitle, setJobTitle] = useState('Junior AI / ML Engineer')
  const [jobDescription, setJobDescription] = useState('')
  const [resumeText, setResumeText] = useState('')
  const [jdFile, setJdFile] = useState<File | null>(null)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [fictional, setFictional] = useState(true)
  const [localError, setLocalError] = useState('')

  const useSample = () => { setJobTitle('Junior AI / ML Engineer'); setJobDescription(SAMPLE_JD); setResumeText(SAMPLE_RESUME); setCandidateName('Jordan Lee (Fictional)'); setJdFile(null); setResumeFile(null); setLocalError('') }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLocalError('')
    if (!fictional) { setLocalError('For this prototype, confirm that the candidate data is fictional.'); return }
    if (!jobDescription.trim() && !jdFile) { setLocalError('Paste a job description or upload a JD file.'); return }
    if (!resumeText.trim() && !resumeFile) { setLocalError('Paste a résumé or upload a résumé file.'); return }
    if (!candidateName.trim() || !jobTitle.trim()) { setLocalError('Candidate label and job title are required.'); return }
    await onSubmit({ candidateName, jobTitle, jobDescription, resumeText, jobDescriptionFile: jdFile, resumeFile })
  }

  return <div className="page-content create-page">
    <div className="breadcrumb"><button onClick={onCancel}><ArrowLeft size={15} /> Workspace</button><span>/</span><span>New interview</span></div>
    <div className="create-heading"><div><div className="eyebrow"><Sparkles size={14} /> INTERVIEW SETUP</div><h1>Build a role-specific interview</h1><p className="page-intro">Start with the job criteria and a fictional résumé. The agent will use both to shape its questions.</p></div><button className="sample-button" type="button" onClick={useSample}><Sparkles size={15} /> Fill with sample data</button></div>
    <form onSubmit={submit} className="setup-layout">
      <div className="setup-main">
        <section className="surface form-section"><div className="form-section-title"><div className="step-number">01</div><div><h2>Role details</h2><p>Define what this interview should explore.</p></div></div>
          <div className="field-grid"><label className="field"><span>Job title <b>*</b></span><input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g. Junior Python Developer" /></label><label className="field"><span>Candidate label <b>*</b></span><input value={candidateName} onChange={e => setCandidateName(e.target.value)} placeholder="Fictional candidate name" /></label></div>
          <label className="field"><span>Job description <b>*</b></span><textarea value={jobDescription} onChange={e => setJobDescription(e.target.value)} placeholder="Paste the responsibilities, required skills, and role outcomes..." rows={8} /><small>Include the skills and outcomes the role actually requires.</small></label>
          <FilePicker label="Upload job description instead" file={jdFile} onChange={setJdFile} />
        </section>
        <section className="surface form-section"><div className="form-section-title"><div className="step-number">02</div><div><h2>Candidate résumé</h2><p>Use a fictional profile for the hackathon prototype.</p></div></div>
          <label className="field"><span>Résumé content <b>*</b></span><textarea value={resumeText} onChange={e => setResumeText(e.target.value)} placeholder="Paste fictional résumé text, relevant projects, tools, and contributions..." rows={8} /><small>Only use job-related facts. Do not assess unrelated or sensitive characteristics.</small></label>
          <FilePicker label="Upload résumé file" file={resumeFile} onChange={setResumeFile} />
        </section>
        <div className="fictional-confirm"><label><input type="checkbox" checked={fictional} onChange={e => setFictional(e.target.checked)} /><span>I confirm this demo uses fictional candidate data.</span></label><span className="required-label">Required for prototype</span></div>
        {(localError || error) && <div className="form-error"><Info size={16} /> {localError || error}</div>}
        <div className="form-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>{busy ? <span className="spinner" /> : <ArrowRight size={16} />}{busy ? 'Preparing interview…' : 'Generate interview'}</button></div>
      </div>
      <aside className="setup-aside"><div className="surface setup-preview"><div className="preview-icon"><FileText size={21} /></div><h3>What happens next?</h3><div className="preview-step"><span>1</span><div><strong>Read context</strong><p>Identify role requirements and résumé examples.</p></div></div><div className="preview-step"><span>2</span><div><strong>Prepare questions</strong><p>Create a short interview with job-related criteria.</p></div></div><div className="preview-step"><span>3</span><div><strong>Adapt as you go</strong><p>Ask for a concrete example when a response lacks detail.</p></div></div><div className="preview-step"><span>4</span><div><strong>Produce evidence</strong><p>Link rubric observations to exact answers for a person to review.</p></div></div></div>
        <div className="info-note"><Info size={17} /><div><strong>Responsible use</strong><p>AI-assisted output can be incomplete. A human reviewer must verify evidence and make all hiring decisions.</p></div></div>
      </aside>
    </form>
  </div>
}

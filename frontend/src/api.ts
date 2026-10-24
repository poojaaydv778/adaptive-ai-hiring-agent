import type { CreateInterviewPayload, Interview, ProctoringFrameResult, ProctoringSummary } from './types'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || 'http://127.0.0.1:8001'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, options)
  } catch {
    throw new Error('Cannot connect to the backend. Start FastAPI on http://127.0.0.1:8001 and try again.')
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    const detail = data?.detail
    const message = typeof detail === 'string' ? detail : `Request failed (${response.status})`
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

export const api = {
  health: () => request<{ status: string; llm_enabled: boolean }>('/api/health'),
  listInterviews: () => request<Interview[]>('/api/interviews'),
  getInterview: (id: string) => request<Interview>(`/api/interviews/${id}`),
  startInterview: (id: string) => request<Interview>(`/api/interviews/${id}/start`, { method: 'POST' }),
  deleteInterview: (id: string) => request<{ deleted: boolean }>(`/api/interviews/${id}`, { method: 'DELETE' }),
  recordHumanDecision: (id: string, decision: 'hired' | 'not_hired') => request<Interview>(`/api/interviews/${id}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  }),
  createInterview: (payload: CreateInterviewPayload) => {
    const form = new FormData()
    form.append('candidate_name', payload.candidateName)
    form.append('job_title', payload.jobTitle)
    form.append('job_description_text', payload.jobDescription)
    form.append('resume_text', payload.resumeText)
    if (payload.jobDescriptionFile) form.append('job_description_file', payload.jobDescriptionFile)
    if (payload.resumeFile) form.append('resume_file', payload.resumeFile)
    return request<Interview>('/api/interviews', { method: 'POST', body: form })
  },
  submitAnswer: (id: string, answer: string) => request<Interview>(`/api/interviews/${id}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
  }),
  analyzeProctoringFrame: (id: string, frame: Blob) => {
    const form = new FormData()
    form.append('frame', frame, 'candidate-camera.jpg')
    return request<ProctoringFrameResult>(`/api/interviews/${id}/proctoring/frame`, {
      method: 'POST',
      body: form,
    })
  },
  getProctoringSummary: (id: string) => request<ProctoringSummary>(`/api/interviews/${id}/proctoring/summary`),
}

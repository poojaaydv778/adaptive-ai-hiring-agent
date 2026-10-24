export type ViewName = 'overview' | 'create' | 'interview' | 'assessment' | 'interviews'

export type Scores = {
  relevance: number
  specificity: number
  actions: number
  outcome: number
  total: number
}

export interface Question {
  id: string
  text: string
  skill: string
  intent: string
  is_follow_up: boolean
  parent_id?: string | null
  adaptation_reason?: string | null
  follow_up_used?: boolean
}

export interface AnswerEvidence {
  question_id: string
  question: string
  answer: string
  skill: string
  is_follow_up: boolean
  scores: Scores
  evidence_quote: string
  feedback: string
  scoring_mode: string
  submitted_at?: string
}

export interface SkillFinding {
  skill: string
  score: number
  label: string
  evidence: string
  question: string
}

export interface ReviewTopic {
  topic: string
  reason: string
  evidence: string
  question: string
}

export interface HumanDecision {
  value: 'hired' | 'not_hired'
  label: 'Hired' | 'Not hired'
  recorded_at: string
}

export interface Assessment {
  summary: string
  human_decision?: HumanDecision | null
  average_score: number
  demonstrated_skills: SkillFinding[]
  gaps: ReviewTopic[]
  review_topics: ReviewTopic[]
  criterion_averages: Record<string, number>
  human_review_required: boolean
  decision_note: string
  scoring_note: string
}

export interface Interview {
  id: string
  candidate_name: string
  job_title: string
  status: 'ready' | 'in_progress' | 'completed'
  job_description: string
  resume_text: string
  questions: Question[]
  answers: AnswerEvidence[]
  assessment: Assessment | null
  current_index: number
  current_question: Question | null
  progress: number
  engine_mode: string
  created_at: string
}

export interface CreateInterviewPayload {
  candidateName: string
  jobTitle: string
  jobDescription: string
  resumeText: string
  jobDescriptionFile: File | null
  resumeFile: File | null
}

export interface ProctoringObjectCount {
  label: string
  count: number
  confidence?: number
}

export interface ProctoringSummary {
  interview_id: string
  frames_analyzed: number
  frames_with_person: number
  frames_with_multiple_people: number
  motion_events: number
  object_counts: ProctoringObjectCount[]
  last_observed_at: string | null
  raw_frames_saved: boolean
  decision_use: string
}

export interface ProctoringFrameResult {
  status: string
  detector: string
  objects: ProctoringObjectCount[]
  person_count: number
  motion_detected: boolean | null
  motion_score: number | null
  analyzed_at: string
  note: string
  summary: ProctoringSummary
}

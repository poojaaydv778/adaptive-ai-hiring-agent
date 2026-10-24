import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, AlertCircle, ArrowLeft, ArrowRight, AudioLines, Camera, CameraOff,
  Check, CircleHelp, Clock3, Eye, Mic, Send, ShieldCheck, Sparkles, Volume2,
} from 'lucide-react'
import type { Interview, ProctoringFrameResult } from '../types'
import { api } from '../api'

interface Props {
  interview: Interview
  onAnswer: (answer: string) => Promise<void>
  onExit: () => void
  busy: boolean
  error: string
}

type CameraState = 'idle' | 'active' | 'error' | 'skipped'

const VOICE_INTRO = 'Hello. I am the AI interview agent. I will read the interview questions aloud, and you can answer by speaking or typing. With your permission, the camera preview will remain on during the interview. A local Python YOLO detector will periodically identify broad visible object labels and compare frames for visible changes. Camera images are processed for detection and are not saved. These technical signals are not used to score you or make a hiring decision. A human reviewer makes every final hiring decision.'

export default function InterviewRoom({ interview, onAnswer, onExit, busy, error }: Props) {
  const [draft, setDraft] = useState('')
  const [listening, setListening] = useState(false)
  const [voiceNotice, setVoiceNotice] = useState('Enable your camera to begin the spoken AI interview.')
  const [cameraState, setCameraState] = useState<CameraState>('idle')
  const [cameraError, setCameraError] = useState('')
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [voiceReady, setVoiceReady] = useState(false)
  const [detection, setDetection] = useState<ProctoringFrameResult | null>(null)
  const [detectionError, setDetectionError] = useState('')
  const [detecting, setDetecting] = useState(false)

  const recognitionRef = useRef<any>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameBusyRef = useRef(false)
  const lastSpokenQuestionRef = useRef<string>('')
  const question = interview.current_question
  const questions = interview.questions
  const answered = interview.answers.length
  const percent = Math.min(100, Math.round((answered / Math.max(questions.length, 1)) * 100))
  const visibleAnswers = useMemo(() => interview.answers.slice(-3), [interview.answers])

  useEffect(() => { setDraft('') }, [question?.id])

  useEffect(() => {
    if (!videoRef.current || !cameraStream) return
    videoRef.current.srcObject = cameraStream
    void videoRef.current.play().catch(() => setCameraError('Camera is enabled, but the preview could not start. Check browser camera permissions.'))
  }, [cameraStream])

  useEffect(() => {
    if (!voiceReady || !question?.id || lastSpokenQuestionRef.current === question.id) return
    const timer = window.setTimeout(() => {
      lastSpokenQuestionRef.current = question.id
      speakText(`Next question. ${question.text}`)
      setVoiceNotice('The AI interviewer is reading the next question aloud.')
    }, 350)
    return () => window.clearTimeout(timer)
    // The question ID deliberately controls playback so each new/adaptive question is spoken once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id, voiceReady])

  useEffect(() => {
    if (!cameraStream || cameraState !== 'active' || interview.status !== 'in_progress') return
    let disposed = false
    const analyzeCurrentFrame = async () => {
      if (disposed || frameBusyRef.current) return
      const video = videoRef.current
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (!video || !canvas || !context || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return
      frameBusyRef.current = true
      setDetecting(true)
      try {
        const maxWidth = 640
        const scale = Math.min(1, maxWidth / video.videoWidth)
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const frame = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.68))
        if (!frame) throw new Error('Could not capture a camera frame.')
        const result = await api.analyzeProctoringFrame(interview.id, frame)
        if (!disposed) {
          setDetection(result)
          setDetectionError('')
        }
      } catch (caught) {
        if (!disposed) setDetectionError(caught instanceof Error ? caught.message : 'YOLO analysis is temporarily unavailable.')
      } finally {
        frameBusyRef.current = false
        if (!disposed) setDetecting(false)
      }
    }
    void analyzeCurrentFrame()
    const timer = window.setInterval(() => { void analyzeCurrentFrame() }, 5000)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [cameraStream, cameraState, interview.id, interview.status])

  useEffect(() => () => {
    try { recognitionRef.current?.stop(); window.speechSynthesis?.cancel() } catch { /* browser voice APIs vary */ }
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }, [])

  function speakText(text: string) {
    if (!('speechSynthesis' in window)) {
      setVoiceNotice('This browser does not support speech playback. Questions remain visible on screen.')
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-IN'
    utterance.rate = 0.94
    utterance.pitch = 1
    const voices = window.speechSynthesis.getVoices()
    const preferredVoice = voices.find(voice => voice.lang.toLowerCase() === 'en-in')
      ?? voices.find(voice => voice.lang.toLowerCase().startsWith('en'))
    if (preferredVoice) utterance.voice = preferredVoice
    utterance.onerror = () => setVoiceNotice('Speech playback had a problem. You can still read the question and type an answer.')
    window.speechSynthesis.speak(utterance)
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    setCameraStream(null)
    setCameraState('idle')
    setVoiceReady(false)
    setDetection(null)
    setVoiceNotice('Camera stopped. Re-enable the camera to resume the spoken interview, or choose the camera-off fallback.')
    try { window.speechSynthesis?.cancel(); recognitionRef.current?.stop() } catch { /* browser voice APIs vary */ }
    setListening(false)
  }

  const startSpokenSession = (withCamera: boolean) => {
    setVoiceReady(true)
    setVoiceNotice(withCamera
      ? 'Camera is on. The AI interviewer will speak each question; the YOLO detector analyzes periodic frames.'
      : 'Camera-off demo mode selected. The AI interviewer will still read questions aloud, but no camera checks will run.')
    if (question?.id) lastSpokenQuestionRef.current = question.id
    speakText(`${VOICE_INTRO} ${withCamera ? '' : 'The camera is not active in this demo session. '}First question. ${question?.text ?? 'Please wait while the next question is prepared.'}`)
  }

  const enableCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('error')
      setCameraError('Camera access is unavailable in this browser or context. Open the site on localhost in Chrome or Edge and check camera permissions.')
      return
    }
    try {
      setCameraError('')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream
      setCameraStream(stream)
      setCameraState('active')
      startSpokenSession(true)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Camera permission was not granted.'
      setCameraState('error')
      setCameraError(`Could not start the camera (${message}). Allow camera access in your browser settings, or use the optional camera-off demo fallback.`)
    }
  }

  const continueWithoutCamera = () => {
    setCameraState('skipped')
    startSpokenSession(false)
  }

  const speakQuestionAgain = () => {
    if (!question?.text) return
    if (!voiceReady) {
      setVoiceNotice('Enable the camera or explicitly select the camera-off demo before starting the AI voice interviewer.')
      return
    }
    lastSpokenQuestionRef.current = question.id
    speakText(question.text)
    setVoiceNotice('Reading the current question aloud.')
  }

  const startListening = () => {
    if (!voiceReady) { setVoiceNotice('Start the AI interviewer first.'); return }
    const w = window as Window & { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Recognition) { setVoiceNotice('Voice input is not supported in this browser. Type the answer below instead.'); return }
    try {
      const recognition = new Recognition()
      recognition.lang = 'en-IN'; recognition.interimResults = true; recognition.continuous = false
      recognitionRef.current = recognition
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results as ArrayLike<any>).map((result: any) => result[0].transcript).join(' ')
        setDraft(transcript)
      }
      recognition.onerror = (event: any) => { setListening(false); setVoiceNotice(`Voice input could not start (${event.error || 'unknown error'}). Type your answer instead.`) }
      recognition.onend = () => setListening(false)
      recognition.start(); setListening(true); setVoiceNotice('Listening to the candidate response… review the transcript before submitting.')
    } catch { setListening(false); setVoiceNotice('Voice input could not start. Type your answer instead.') }
  }

  const submit = async () => {
    if (!draft.trim() || busy || !voiceReady) return
    try { recognitionRef.current?.stop() } catch { /* no-op */ }
    setListening(false)
    await onAnswer(draft.trim())
  }

  if (!question && interview.status === 'completed') return <div className="page-content interview-page"><div className="surface complete-state"><div className="complete-icon"><Check size={28} /></div><h1>Interview complete</h1><p>Your evidence-linked assessment is ready for a human reviewer.</p><button className="primary-button" onClick={onExit}>Review assessment <ArrowRight size={16} /></button></div></div>

  return <div className="page-content interview-page">
    <canvas ref={canvasRef} className="camera-capture-canvas" aria-hidden="true" />
    <div className="breadcrumb"><button onClick={onExit}><ArrowLeft size={15} /> Workspace</button><span>/</span><span>Live interview</span></div>
    <div className="interview-header"><div><div className="live-indicator"><span /> LIVE AI VOICE INTERVIEW</div><h1>{interview.job_title}</h1><p>{interview.candidate_name} <span className="header-dot">·</span> You are interacting with an AI interview agent. Camera checks are technical signals only.</p></div><div className="session-state"><span className="session-dot" /> {interview.status === 'in_progress' ? 'Session active' : 'Session ready'}<div className="session-time"><Clock3 size={14} /> {answered} responses</div></div></div>
    <div className="interview-progress"><div className="progress-top"><span>Interview progress</span><strong>{answered} of {questions.length} responses</strong></div><div className="progress-track"><div style={{ width: `${percent}%` }} /></div></div>
    <div className="interview-layout">
      <section className="surface active-question-card">
        <div className="question-card-top"><div className="question-index">QUESTION {String(answered + 1).padStart(2, '0')}</div><span className={`question-type ${question?.is_follow_up ? 'follow-up' : ''}`}>{question?.is_follow_up ? <><Sparkles size={13} /> Adaptive follow-up</> : <><CircleHelp size={13} /> Core question</>}</span></div>
        {question?.is_follow_up && <div className="adaptive-reason"><Sparkles size={14} /> {question.adaptation_reason || 'A follow-up was selected to clarify the evidence in the previous response.'}</div>}
        <h2 className="question-text">{question?.text ?? 'Preparing your next question…'}</h2>
        <div className="question-skill"><span>Evaluating criterion</span><strong>{question?.skill || 'Job-related evidence'}</strong></div>
        <div className="voice-controls"><button className="voice-button" onClick={speakQuestionAgain} disabled={!voiceReady}><Volume2 size={17} /> Read question</button><button className={`voice-button ${listening ? 'recording' : ''}`} onClick={listening ? () => { recognitionRef.current?.stop(); setListening(false); setVoiceNotice('Voice input stopped. Review the transcript before submitting.') } : startListening} disabled={!voiceReady}><span className="mic-circle">{listening ? <AudioLines size={17} /> : <Mic size={17} />}</span>{listening ? 'Listening…' : 'Answer with voice'}</button></div>
        {!voiceReady && <div className="voice-start-required"><Volume2 size={17} /><div><strong>Start the AI voice interview</strong><p>Enable the candidate camera to start the spoken interview and YOLO checks. The AI will read each question aloud automatically.</p></div></div>}
        <label className="answer-field"><span>Your response</span><textarea rows={6} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Describe what you did, the decisions you made, and what happened…" disabled={busy || !question || !voiceReady} /><div className="answer-meta"><span>{draft.trim() ? `${draft.trim().split(/\s+/).length} words` : 'Aim for a specific example with actions and outcomes'}</span><span>{draft.length}/10,000</span></div></label>
        {(voiceNotice || error) && <div className={error ? 'inline-error' : 'voice-notice'}>{error || voiceNotice}</div>}
        <div className="question-actions"><div className="privacy-inline"><ShieldCheck size={16} /> Job-related evidence only</div><button className="primary-button" onClick={submit} disabled={!draft.trim() || busy || !question || !voiceReady}>{busy ? <span className="spinner" /> : <Send size={16} />}{busy ? 'Reviewing response…' : 'Submit answer'} <ArrowRight size={15} /></button></div>
        <p className="voice-disclaimer">AI questions are spoken by your browser's voice synthesizer. Voice recognition may use a browser/vendor service. The YOLO output and frame-change indicators are not interpreted as evidence of honesty, personality, or suitability. Typing remains available after starting the session.</p>
      </section>
      <aside className="interview-aside">
        <section className="surface camera-panel">
          <div className="camera-panel-heading"><div className="panel-icon purple"><Camera size={17} /></div><div><h3>Candidate camera</h3><p>Live preview · objective technical checks</p></div></div>
          {cameraState !== 'active' && <p className="camera-preconsent">Before starting: the live camera will be shown and sampled frames will be sent to this local Python service for YOLO object and frame-change analysis. Raw frames are not saved. These signals never affect rubric scores or hiring decisions.</p>}
          <div className={`camera-preview ${cameraState === 'active' ? 'camera-live' : ''}`}>
            {cameraState === 'active' ? <video ref={videoRef} autoPlay muted playsInline aria-label="Candidate live camera preview" /> : <div className="camera-placeholder">{cameraState === 'error' ? <AlertCircle size={27} /> : <CameraOff size={27} />}<span>{cameraState === 'error' ? 'Camera permission needed' : cameraState === 'skipped' ? 'Camera-off demo mode' : 'Camera is not on'}</span></div>}
            {cameraState === 'active' && <span className="camera-live-badge"><i /> LIVE</span>}
          </div>
          {cameraState === 'active' ? <div className="camera-actions"><span className="camera-status-pill active"><i /> Camera on</span><button className="small-action danger" onClick={stopCamera}>Stop camera</button></div> : <div className="camera-actions camera-actions-stacked"><button className="primary-button camera-start-button" onClick={() => void enableCamera()}><Camera size={15} /> {cameraState === 'skipped' ? 'Enable camera' : 'Enable camera & start AI interview'}</button>{cameraState === 'error' && <button className="secondary-button" onClick={continueWithoutCamera}>Continue camera-off demo</button>}{cameraState === 'idle' && <button className="text-action" onClick={continueWithoutCamera}>Continue without camera (demo fallback)</button>}</div>}
          {cameraError && <div className="camera-error"><AlertCircle size={14} />{cameraError}</div>}
          {cameraState === 'skipped' && <div className="camera-notice">Camera analysis is disabled for this session. Enable the camera to use YOLO.</div>}
          <div className="detection-box">
            <div className="detection-heading"><strong><Eye size={14} /> YOLO object detection</strong><span className={detection ? 'detector-live' : 'detector-waiting'}>{detecting ? 'Analyzing…' : detection ? detection.detector : cameraState === 'active' ? 'Starting…' : 'Not active'}</span></div>
            {cameraState !== 'active' ? <p className="detection-empty">Turn on the camera to analyze periodic frames locally in Python.</p> : detection ? <>
              <div className="detection-metrics"><span><strong>{detection.person_count}</strong> person count</span><span><strong>{detection.motion_detected === null ? 'Calibrating' : detection.motion_detected ? 'Detected' : 'Low'}</strong> frame change</span></div>
              {detection.objects.length > 0 ? <div className="object-tags">{detection.objects.slice(0, 8).map(obj => <span key={obj.label}>{obj.label} <b>×{obj.count}</b></span>)}</div> : <p className="detection-empty">No objects above the current confidence threshold in this sampled frame.</p>}
              <p className="detection-note">This is an imperfect technical detector. It can miss or mislabel objects; outputs are not a conduct, honesty, or hiring score.</p>
            </> : <p className="detection-empty">{detectionError || (detecting ? 'The first run may download YOLO weights; please allow a little time.' : 'Waiting for the first camera frame.')}</p>}
            {detectionError && cameraState === 'active' && <button className="text-action" onClick={() => setDetectionError('')}>Dismiss detector message</button>}
          </div>
        </section>
        <div className="surface session-panel"><div className="session-panel-heading"><div className="panel-icon purple"><AudioLines size={17} /></div><div><h3>Interview flow</h3><p>Questions adapt to response evidence.</p></div></div><div className="flow-steps"><div className="flow-step done"><span><Check size={13} /></span><div><strong>Role context read</strong><small>Job description + résumé</small></div></div><div className="flow-line" /><div className={`flow-step ${answered > 0 ? 'done' : 'active'}`}><span>{answered > 0 ? <Check size={13} /> : '2'}</span><div><strong>Explore an example</strong><small>Specific actions and results</small></div></div><div className="flow-line" /><div className="flow-step"><span>3</span><div><strong>Probe gaps if needed</strong><small>Short adaptive follow-up</small></div></div><div className="flow-line" /><div className="flow-step"><span>4</span><div><strong>Build evidence report</strong><small>Human reviewer summary</small></div></div></div></div>
        <div className="surface recent-response-panel"><div className="section-heading small"><div><h3>Recent responses</h3><p>Visible only within this session.</p></div></div>{visibleAnswers.length === 0 ? <div className="response-empty">Candidate responses and linked evidence will appear here.</div> : visibleAnswers.map((answer, index) => <div className="response-snippet" key={`${answer.question_id}-${index}`}><span className="response-score">{answer.scores.total.toFixed(1)}<small>/4</small></span><div><strong>{answer.skill || 'Role evidence'}</strong><p>“{answer.answer.slice(0, 110)}{answer.answer.length > 110 ? '…' : ''}”</p></div></div>)}</div>
        <div className="human-review-note"><ShieldCheck size={17} /><p><strong>Human decision required.</strong> The agent organizes evidence. It does not determine whether someone should be hired.</p></div>
      </aside>
    </div>
  </div>
}

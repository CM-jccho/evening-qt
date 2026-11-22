import { useEffect, useRef, useState } from 'react'
import { Flame, Pause, Play, RotateCcw } from 'lucide-react'
import type { Lang } from '../lib/types'
import { translate } from '../i18n'
import { playChime, primeAudio } from '../lib/chime'

interface Props {
  lang: Lang
  chime: boolean
}

const DURATIONS = [60, 180, 300]
const RADIUS = 56
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function PrayerTimer({ lang, chime }: Props) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
    translate(lang, key, vars)
  const [duration, setDuration] = useState(180)
  const [remaining, setRemaining] = useState(180)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const deadline = useRef(0)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))
      setRemaining(left)
      if (left <= 0) {
        setRunning(false)
        setDone(true)
        if (chime) playChime()
      }
    }, 200)
    return () => window.clearInterval(id)
  }, [running, chime])

  const reset = (next: number) => {
    setRunning(false)
    setDone(false)
    setDuration(next)
    setRemaining(next)
  }

  const start = () => {
    primeAudio()
    if (done) {
      setDone(false)
      setRemaining(duration)
      deadline.current = Date.now() + duration * 1000
      setRunning(true)
      return
    }
    deadline.current = Date.now() + remaining * 1000
    setRunning((value) => !value)
  }

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const clock = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  const elapsed = duration === 0 ? 0 : 1 - remaining / duration

  return (
    <section className="timer" aria-labelledby="timer-title">
      <div className="timer-copy">
        <h2 id="timer-title" className="timer-title">
          {t('timer.kicker')}
        </h2>
        <p className="timer-lead">{t('timer.title')}</p>

        <div className="timer-durations" role="group" aria-label={t('timer.kicker')}>
          {DURATIONS.map((value) => (
            <button
              key={value}
              type="button"
              className="duration"
              aria-pressed={duration === value && !running}
              onClick={() => reset(value)}
            >
              {t('timer.min', { n: value / 60 })}
            </button>
          ))}
        </div>
      </div>

      <div className="timer-dial">
        <svg viewBox="0 0 136 136" className="timer-ring" aria-hidden="true">
          <circle className="timer-track" cx="68" cy="68" r={RADIUS} />
          <circle
            className="timer-progress"
            cx="68"
            cy="68"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={done ? 0 : CIRCUMFERENCE * elapsed}
          />
        </svg>
        <div className="timer-face">
          <Flame size={18} className={done ? 'timer-flame timer-flame-done' : 'timer-flame'} aria-hidden="true" />
          <p className="timer-clock" aria-live="off">
            {clock}
          </p>
        </div>
      </div>

      <div className="timer-controls">
        <button type="button" className="button-primary timer-start" onClick={start}>
          {running ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {running ? t('timer.pause') : done ? t('timer.again') : remaining < duration ? t('timer.resume') : t('timer.start')}
        </button>
        {done ? null : (
          <button
            type="button"
            className="button-quiet"
            onClick={() => reset(duration)}
            aria-label={t('timer.reset')}
          >
            <RotateCcw size={15} aria-hidden="true" />
            {t('timer.reset')}
          </button>
        )}
      </div>

      <p className={done ? 'timer-done timer-done-visible' : 'timer-done'} role="status">
        <span className="timer-done-title">{t('timer.doneTitle')}</span>
        <span className="timer-done-body">{t('timer.doneBody')}</span>
      </p>
    </section>
  )
}

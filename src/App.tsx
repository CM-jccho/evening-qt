import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Moon, Settings, Sun } from 'lucide-react'
import rawPassages from './data/passages.json'
import type { DayRecord, PersonKey, Reflection, Store, Theme } from './lib/types'
import { emptyRecord } from './lib/types'
import { dateKey, formatDate, todayKey, passageIndexFor } from './lib/date'
import {
  defaultStore,
  exportPayload,
  importPayload,
  loadStore,
  saveStore,
} from './lib/storage'
import { buildShareCode, buildShareLink, parseShareInput, type SharePayload } from './lib/share'
import { demoRecord } from './lib/demo'
import { sameDayInPast, sampleSameDayInPast } from './lib/past'
import { translate } from './i18n'
import { PassagePanel, type PassageView } from './components/PassagePanel'
import { ReflectionSpread } from './components/ReflectionSpread'
import { PrayerTimer } from './components/PrayerTimer'
import { Archive } from './components/Archive'
import { PastYears } from './components/PastYears'
import { ShareDialog } from './components/ShareDialog'
import { PassagePicker } from './components/PassagePicker'
import { SettingsDialog } from './components/SettingsDialog'
import { Toast, type ToastMessage } from './components/Toast'

const passages = rawPassages as (PassageView & { day: number })[]

type DialogKind = 'share' | 'import' | 'passage' | 'settings' | null

export default function App() {
  const [store, setStore] = useState<Store>(() => loadStore())
  const [viewDate, setViewDate] = useState<string>(() => todayKey())
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [shareWho, setShareWho] = useState<PersonKey>('a')
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const [importValue, setImportValue] = useState('')
  const [importPreview, setImportPreview] = useState<SharePayload | null>(null)
  const [importError, setImportError] = useState(false)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [demoOn, setDemoOn] = useState(false)
  const [demoDraft, setDemoDraft] = useState<DayRecord | null>(null)
  const [showSamplePrompt, setShowSamplePrompt] = useState(() => !loadStore().settings.demoSeen)
  const [, setMinuteTick] = useState(0)

  const storeRef = useRef(store)
  storeRef.current = store
  const lang = store.settings.lang
  const t = useMemo(
    () => (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
      translate(lang, key, vars),
    [lang],
  )

  const names: [string, string] = [
    store.settings.names[0].trim() || t('name.defaultA'),
    store.settings.names[1].trim() || t('name.defaultB'),
  ]

  const storedRecord = store.records[viewDate]
  const demoBase = demoOn ? demoRecord(viewDate, lang) : null
  const record: DayRecord = demoOn ? demoDraft ?? demoBase ?? emptyRecord() : storedRecord ?? emptyRecord()

  const chosenIndex = record.index ?? passageIndexFor(viewDate)
  const passage: PassageView = useMemo(
    () => record.custom ?? passages[chosenIndex] ?? passages[0],
    [record.custom, chosenIndex],
  )

  /* the same month and day in earlier years: from the sample layer while the
     sample is on, from the saved record otherwise, never both */
  const pastEntries = useMemo(
    () => (demoOn ? sampleSameDayInPast(viewDate, lang) : sameDayInPast(store.records, viewDate)),
    [demoOn, viewDate, lang, store.records],
  )

  /* theme and language on the document */
  useEffect(() => {
    document.documentElement.dataset.theme = store.settings.theme
    document.documentElement.lang = lang
    document.title = lang === 'ko' ? '밤의 묵상, Selah' : 'Selah, evening QT'
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', store.settings.theme === 'paper' ? '#fbf7f0' : '#141311')
  }, [store.settings.theme, lang])

  /* persistence, debounced so typing stays quiet */
  useEffect(() => {
    setSaveState('saving')
    const id = window.setTimeout(() => {
      setSaveState(saveStore(store) ? 'saved' : 'error')
    }, 420)
    return () => window.clearTimeout(id)
  }, [store])

  useEffect(() => {
    setDemoDraft(null)
  }, [viewDate, lang])

  /* the page notices midnight without moving the writer's page */
  useEffect(() => {
    const id = window.setInterval(() => setMinuteTick((tick) => tick + 1), 30000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), toast.undo ? 9000 : 5200)
    return () => window.clearTimeout(id)
  }, [toast])

  const mutate = (fn: (rec: DayRecord) => DayRecord) => {
    if (demoOn) {
      setDemoDraft(fn(demoDraft ?? demoBase ?? emptyRecord()))
      return
    }
    setStore((prev) => {
      const next = fn(prev.records[viewDate] ?? emptyRecord())
      return { ...prev, records: { ...prev.records, [viewDate]: next } }
    })
  }

  const updateField = (who: PersonKey, field: keyof Reflection, value: string) => {
    mutate((rec) => ({ ...rec, [who]: { ...rec[who], [field]: value } }))
  }

  const setName = (index: 0 | 1, value: string) => {
    setStore((prev) => {
      const nextNames: [string, string] = [...prev.settings.names]
      nextNames[index] = value.slice(0, 16)
      return { ...prev, settings: { ...prev.settings, names: nextNames } }
    })
  }

  const setTheme = (theme: Theme) => setStore((prev) => ({ ...prev, settings: { ...prev.settings, theme } }))
  const toggleLang = () =>
    setStore((prev) => ({ ...prev, settings: { ...prev.settings, lang: prev.settings.lang === 'ko' ? 'en' : 'ko' } }))
  const setChime = (chime: boolean) => setStore((prev) => ({ ...prev, settings: { ...prev.settings, chime } }))

  const dismissSample = (seen: boolean) => {
    setShowSamplePrompt(false)
    setStore((prev) => ({ ...prev, settings: { ...prev.settings, demoSeen: seen } }))
  }

  /* passage actions */
  const pickPassage = (index: number) => {
    mutate((rec) => ({ ...rec, custom: null, index }))
    setDialog(null)
    flash(t('passage.changed'))
  }

  const saveCustomPassage = (custom: PassageView) => {
    mutate((rec) => ({ ...rec, custom }))
    setDialog(null)
    flash(t('editor.save'))
  }

  const clearCustomPassage = () => {
    mutate((rec) => ({ ...rec, custom: null }))
    setDialog(null)
  }

  /* share */
  const openShare = (who: PersonKey) => {
    const side = record[who]
    if (!side.gratitude.trim() && !side.meditation.trim() && !side.prayer.trim()) {
      flash(t('share.emptyColumn'))
      return
    }
    setShareWho(who)
    setCopied(null)
    setDialog('share')
  }

  const shareCode = useMemo(
    () => (dialog === 'share' ? buildShareCode(record, shareWho, names[shareWho === 'a' ? 0 : 1], viewDate) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dialog, shareWho, viewDate, record],
  )

  const copyText = async (text: string, kind: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    setCopied(kind)
    flash(t('share.copied'))
  }

  const openImport = () => {
    setImportValue('')
    setImportPreview(null)
    setImportError(false)
    setDialog('import')
  }

  const onImportChange = (value: string) => {
    setImportValue(value)
    if (!value.trim()) {
      setImportPreview(null)
      setImportError(false)
      return
    }
    const payload = parseShareInput(value)
    setImportPreview(payload)
    setImportError(!payload)
  }

  const applyShare = (payload: SharePayload, live: boolean) => {
    const currentNames = [
      storeRef.current.settings.names[0].trim() || translate(storeRef.current.settings.lang, 'name.defaultA'),
      storeRef.current.settings.names[1].trim() || translate(storeRef.current.settings.lang, 'name.defaultB'),
    ]
    const nameMatch = currentNames.findIndex((n) => n.trim() === payload.n.trim() && n.trim().length > 0)
    const who: PersonKey = nameMatch === 0 ? 'a' : nameMatch === 1 ? 'b' : payload.s === 0 ? 'a' : 'b'
    const previous = storeRef.current.records[payload.d]
    setStore((prev) => {
      const base = prev.records[payload.d] ?? emptyRecord()
      const next: DayRecord = { ...base, [who]: { ...payload.r } }
      return { ...prev, records: { ...prev.records, [payload.d]: next } }
    })
    setDemoOn(false)
    setDemoDraft(null)
    setViewDate(payload.d)
    if (!live) setDialog(null)
    flash(t('share.imported', { name: payload.n || currentNames[who === 'a' ? 0 : 1] }), () => {
      setStore((prev) => {
        const records = { ...prev.records }
        if (previous) records[payload.d] = previous
        else delete records[payload.d]
        return { ...prev, records }
      })
      setToast(null)
    })
  }

  /* the link someone sent opens tonight's page already joined; a link pasted
     into an already open tab arrives as a hash change, so watch for both */
  useEffect(() => {
    const readLink = () => {
      if (!window.location.hash.includes('selah=')) return
      const payload = parseShareInput(window.location.hash)
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      if (payload) applyShare(payload, true)
    }
    readLink()
    window.addEventListener('hashchange', readLink)
    return () => window.removeEventListener('hashchange', readLink)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* backup */
  const exportRecord = () => {
    const blob = new Blob([exportPayload(store)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `evening-qt-${dateKey(new Date())}.json`
    a.click()
    URL.revokeObjectURL(url)
    flash(t('archive.exported'))
  }

  const importFile = async (file: File) => {
    const text = await file.text()
    const loaded = importPayload(text)
    if (!loaded) {
      flash(t('archive.importFailed'))
      return
    }
    setStore((prev) => ({ ...prev, records: { ...prev.records, ...loaded.records } }))
    flash(t('archive.imported'))
  }

  const resetAll = () => {
    const fresh = defaultStore()
    fresh.settings = { ...fresh.settings, demoSeen: true, lang, theme: store.settings.theme }
    setStore(fresh)
    setViewDate(todayKey())
    setDemoOn(false)
    setDialog(null)
    flash(t('settings.resetDone'))
  }

  const flash = (text: string, undo?: () => void) => {
    setToast({ id: Date.now(), text, undo })
  }

  const goToday = () => {
    setViewDate(todayKey())
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openDate = (key: string) => {
    setDemoOn(false)
    setDemoDraft(null)
    setViewDate(key)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const startWriting = () => {
    document.getElementById('reflection')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const isToday = viewDate === todayKey()
  const saveLabel = saveState === 'saving' ? t('save.saving') : saveState === 'error' ? t('save.error') : t('save.saved')

  return (
    <div className="page" id="top">
      <header className="masthead">
        <div className="shell masthead-inner">
          <a className="wordmark" href="#top">
            <span className="wordmark-ko">{t('brand.name')}</span>
            <span className="wordmark-sub">{t('brand.sub')}</span>
          </a>
          <div className="masthead-tools">
            <span className={saveState === 'error' ? 'save-state save-state-error' : 'save-state'} role="status">
              {saveState === 'saved' ? <Check size={13} aria-hidden="true" /> : null}
              {saveLabel}
            </span>
            <button type="button" className="tool-button" onClick={toggleLang} lang={lang === 'ko' ? 'en' : 'ko'}>
              {t('nav.language')}
            </button>
            <button
              type="button"
              className="tool-button tool-button-theme"
              onClick={() => setTheme(store.settings.theme === 'lamp' ? 'paper' : 'lamp')}
              aria-label={`${t('nav.theme')}: ${store.settings.theme === 'lamp' ? t('theme.lamp') : t('theme.paper')}`}
            >
              {store.settings.theme === 'lamp' ? (
                <Moon size={15} aria-hidden="true" />
              ) : (
                <Sun size={15} aria-hidden="true" />
              )}
              <span>{store.settings.theme === 'lamp' ? t('theme.lamp') : t('theme.paper')}</span>
            </button>
            <button
              type="button"
              className="tool-button tool-button-icon"
              onClick={() => setDialog('settings')}
              aria-label={t('nav.settings')}
            >
              <Settings size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="shell main">
        {showSamplePrompt ? (
          <div className="sample-bar">
            <p>{t('demo.banner')}</p>
            <div className="sample-actions">
              <button
                type="button"
                className="button-quiet"
                onClick={() => {
                  setDemoOn(true)
                  setDemoDraft(null)
                  dismissSample(true)
                }}
              >
                {t('demo.try')}
              </button>
              <button type="button" className="button-quiet" onClick={() => dismissSample(true)}>
                {t('demo.dismiss')}
              </button>
            </div>
          </div>
        ) : null}

        {demoOn ? (
          <div className="sample-bar sample-bar-live">
            <p>{t('demo.on')}</p>
            <button type="button" className="button-quiet" onClick={() => { setDemoOn(false); setDemoDraft(null) }}>
              {t('demo.off')}
            </button>
          </div>
        ) : null}

        <div className="dateline">
          <h1 className="visually-hidden">{t('brand.name')}</h1>
          <p className="date-main">{formatDate(viewDate, lang)}</p>
          <p className="date-note">{t('date.evening')}</p>
          {!isToday ? (
            <button type="button" className="button-quiet date-return" onClick={goToday}>
              {t('archive.today')}
            </button>
          ) : null}
        </div>

        <PassagePanel
          passage={passage}
          lang={lang}
          custom={Boolean(record.custom)}
          labels={{
            switchPassage: t('passage.switch'),
            start: t('passage.start'),
            fromYou: t('passage.fromYou'),
            rhythm: t('passage.rhythm'),
            flow: t('passage.flow'),
          }}
          onSwitch={() => setDialog('passage')}
          onStart={startWriting}
        />

        <ReflectionSpread
          record={record}
          names={names}
          lang={lang}
          onNameChange={setName}
          onField={updateField}
          onShare={openShare}
          onImport={openImport}
        />

        <PrayerTimer lang={lang} chime={store.settings.chime} />

        <PastYears
          entries={pastEntries}
          lang={lang}
          names={names}
          viewDate={viewDate}
          sample={demoOn}
          passages={passages}
          onOpen={openDate}
        />

        <Archive lang={lang} records={store.records} selected={viewDate} onOpenDate={openDate} />

        <footer className="footer">
          <p className="fine-print">{t('footer.note')}</p>
          <p className="fine-print">{t('footer.translation')}</p>
        </footer>
      </main>

      <ShareDialog
        open={dialog === 'share' || dialog === 'import'}
        mode={dialog === 'import' ? 'import' : 'share'}
        lang={lang}
        code={shareCode}
        copied={copied}
        importValue={importValue}
        importError={importError}
        importPreview={importPreview}
        onCopy={(target) => copyText(target === 'link' ? buildShareLink(shareCode) : shareCode, target)}
        onImportChange={onImportChange}
        onApply={() => {
          if (importPreview) applyShare(importPreview, false)
        }}
        onClose={() => setDialog(null)}
      />

      <PassagePicker
        open={dialog === 'passage'}
        lang={lang}
        passages={passages}
        currentIndex={chosenIndex}
        custom={Boolean(record.custom)}
        fallback={passage}
        onPick={pickPassage}
        onSaveCustom={saveCustomPassage}
        onClearCustom={clearCustomPassage}
        onClose={() => setDialog(null)}
      />

      <SettingsDialog
        open={dialog === 'settings'}
        lang={lang}
        theme={store.settings.theme}
        names={store.settings.names}
        chime={store.settings.chime}
        onNameChange={setName}
        onTheme={setTheme}
        onChime={setChime}
        onExport={exportRecord}
        onImportFile={importFile}
        onReset={resetAll}
        onClose={() => setDialog(null)}
      />

      <Toast
        message={toast}
        undoLabel={t('share.undo')}
        closeLabel={t('common.close')}
        onDismiss={() => setToast(null)}
      />
    </div>
  )
}

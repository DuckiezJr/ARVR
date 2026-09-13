import { useEffect, useRef, useState } from 'react'
import {
  Archive, ArrowDownToLine, BookOpen, Box, Camera, ChevronRight, CircleHelp, DoorOpen,
  FileText, Gamepad2, Headset, Library, MapPin, Maximize2, Mic, Move3d, Pause, Play,
  Plus, Radio, ScanLine, Settings2, Sparkles, Trash2, Upload, Video, X,
} from 'lucide-react'
import { startImmersiveSession, supportsRoomScan, type PlacedVolume } from './xr'

type AnchorKind = 'scene' | 'media' | 'reading' | 'instrument' | 'furniture' | 'door' | 'display'
type Anchor = { id: number; label: string; kind: AnchorKind; x: number; y: number; detail: string; asset?: string }

const starterAnchors: Anchor[] = [
  { id: 1, label: 'Front door', kind: 'scene', x: 17, y: 37, detail: 'Doorway · 2.1 m wide' },
  { id: 2, label: 'Cinema wall', kind: 'media', x: 53, y: 32, detail: 'Media surface · 4K ready', asset: 'Interstellar.mp4' },
  { id: 3, label: 'Reading nook', kind: 'reading', x: 75, y: 65, detail: 'Document shelf · 12 items', asset: 'Welcome to Roomscape.pdf' },
  { id: 4, label: 'Coffee table', kind: 'scene', x: 50, y: 70, detail: 'Surface · 0.42 m high' },
]

const anchorIcon = (kind: AnchorKind) => kind === 'media' || kind === 'display' ? <Video size={15} /> : kind === 'reading' ? <BookOpen size={15} /> : kind === 'instrument' ? <Mic size={15} /> : kind === 'door' ? <DoorOpen size={15} /> : <Box size={15} />

function App() {
  const [anchors, setAnchors] = useState<Anchor[]>(() => {
    const stored = localStorage.getItem('roomscape-anchors')
    return stored ? JSON.parse(stored) : starterAnchors
  })
  const [selectedId, setSelectedId] = useState(2)
  const [isScanning, setIsScanning] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [connected, setConnected] = useState(false)
  const [vrSupported, setVrSupported] = useState(false)
  const [xrActive, setXrActive] = useState(false)
  const [scanStatus, setScanStatus] = useState('Ready for a real room scan')
  const [toast, setToast] = useState('')
  const [volumes, setVolumes] = useState<PlacedVolume[]>(() => {
    const stored = localStorage.getItem('roomscape-volumes')
    return stored ? JSON.parse(stored) : []
  })
  const videoRef = useRef<HTMLVideoElement>(null)
  const xrCanvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const gazeTargetRef = useRef<Element | null>(null)
  const gazeTimerRef = useRef<number | null>(null)
  const selected = anchors.find((anchor) => anchor.id === selectedId) ?? anchors[0]

  useEffect(() => localStorage.setItem('roomscape-anchors', JSON.stringify(anchors)), [anchors])
  useEffect(() => localStorage.setItem('roomscape-volumes', JSON.stringify(volumes)), [volumes])
  useEffect(() => {
    const onGamepad = () => { setConnected(true); setToast('Xbox controller connected') }
    window.addEventListener('gamepadconnected', onGamepad)
    return () => window.removeEventListener('gamepadconnected', onGamepad)
  }, [])
  useEffect(() => {
    supportsRoomScan().then((supported) => { setVrSupported(supported); if (!supported) toggleCamera() })
  }, [])
  useEffect(() => {
    enterImmersive('immersive-ar')
  }, [])
  useEffect(() => {
    let frame = 0
    let lastAction = 0
    const pollController = (time: number) => {
      const gamepad = navigator.getGamepads?.().find((item): item is Gamepad => Boolean(item?.connected))
      if (gamepad) {
        setConnected(true)
        const [horizontal, vertical] = gamepad.axes
        if (time - lastAction > 220 && (Math.abs(horizontal) > .6 || Math.abs(vertical) > .6) && anchors.length) {
          const direction = Math.abs(horizontal) > Math.abs(vertical) ? (horizontal > 0 ? 1 : -1) : (vertical > 0 ? 1 : -1)
          const index = anchors.findIndex((anchor) => anchor.id === selectedId)
          const next = anchors[(index + direction + anchors.length) % anchors.length]
          if (next) setSelectedId(next.id)
          lastAction = time
        }
        if (time - lastAction > 500 && gamepad.buttons[0]?.pressed) { setToast(`${selected?.label ?? 'Object'} opened 7 m ahead`); lastAction = time }
        else if (time - lastAction > 500 && gamepad.buttons[1]?.pressed) { addAnchor(); lastAction = time }
        else if (time - lastAction > 500 && gamepad.buttons[2]?.pressed) { setLibraryOpen(true); lastAction = time }
        else if (time - lastAction > 500 && gamepad.buttons[3]?.pressed) { setToast('View recentered'); lastAction = time }
      }
      frame = requestAnimationFrame(pollController)
    }
    frame = requestAnimationFrame(pollController)
    return () => cancelAnimationFrame(frame)
  }, [anchors, selected, selectedId])
  useEffect(() => {
    if (!xrActive && !cameraOn) return
    let frame = 0
    let startedAt = 0
    const updateGaze = (time: number) => {
      const target = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.closest('button, input, select') ?? null
      if (target !== gazeTargetRef.current) { gazeTargetRef.current = target; startedAt = target ? time : 0 }
      const dwell = target && startedAt ? Math.min(1, (time - startedAt) / 1000) : 0
      document.documentElement.style.setProperty('--gaze-progress', `${dwell * 360}deg`)
      if (dwell >= 1 && gazeTimerRef.current === null) {
        gazeTimerRef.current = window.setTimeout(() => { (target as HTMLElement)?.click(); gazeTimerRef.current = null; startedAt = time + 800 }, 0)
      }
      frame = requestAnimationFrame(updateGaze)
    }
    frame = requestAnimationFrame(updateGaze)
    return () => { cancelAnimationFrame(frame); if (gazeTimerRef.current) window.clearTimeout(gazeTimerRef.current); document.documentElement.style.setProperty('--gaze-progress', '0deg') }
  }, [xrActive, cameraOn])
  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const toggleCamera = async () => {
    if (cameraOn) {
      videoRef.current?.srcObject && (videoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop())
      setCameraOn(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      setCameraOn(true)
      setToast('Camera layer active')
    } catch { setToast('Camera permission is needed for live room view') }
  }

  const enterImmersive = async (mode: 'immersive-vr' | 'immersive-ar' = 'immersive-vr') => {
    if (!xrCanvasRef.current) return
    setIsScanning(true)
    try {
      await startImmersiveSession(xrCanvasRef.current, mode, setScanStatus, (volume) => {
        if (volume) setVolumes((current) => [...current, volume])
        setToast('3D volume placed. Open the centered library to attach content.')
      }, volumes)
      setXrActive(true)
    } catch (error) {
      setIsScanning(false)
      setToast('XR is unavailable here; using live camera mode')
      toggleCamera()
    }
  }

  const beginScan = () => enterImmersive('immersive-ar')

  const addAnchor = () => {
    const next: Anchor = { id: Date.now(), label: 'New anchor', kind: 'scene', x: 35 + Math.random() * 32, y: 35 + Math.random() * 28, detail: 'Unassigned room object' }
    setAnchors((current) => [...current, next]); setSelectedId(next.id); setToast('Anchor placed')
  }

  const removeSelected = () => {
    if (!selected) return
    setAnchors((current) => current.filter((anchor) => anchor.id !== selected.id)); setSelectedId(anchors.find((anchor) => anchor.id !== selected.id)?.id ?? 0); setToast('Anchor removed')
  }

  const updateSelected = (changes: Partial<Anchor>) => {
    if (!selected) return
    setAnchors((current) => current.map((anchor) => anchor.id === selected.id ? { ...anchor, ...changes } : anchor))
  }

  const importFile = (file: File) => {
    if (!selected) return
    const kind: AnchorKind = file.type.startsWith('video/') ? 'media' : file.type === 'application/pdf' ? 'reading' : file.type.startsWith('audio/') ? 'instrument' : 'display'
    updateSelected({ asset: file.name, kind, detail: `${file.type || 'Local file'} · ${Math.round(file.size / 1024)} KB` })
    setToast(`${file.name} linked to ${selected.label}`)
  }

  const exportRoom = () => {
    const blob = new Blob([JSON.stringify({ version: 1, name: 'Living room', anchors }, null, 2)], { type: 'application/json' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'roomscape-living-room.json'; link.click(); URL.revokeObjectURL(link.href); setToast('Room file exported')
  }

  const enterVr = () => beginScan()

  return (
    <main className={`app-shell ${xrActive ? 'immersive-shell' : ''}`}>
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Sparkles size={19} /></div><span>roomscape</span><span className="beta">BETA</span></div>
        <nav className="nav-stack"><button className="nav-item active"><MapPin size={18} /> Room view</button><button className="nav-item" onClick={() => setLibraryOpen(true)}><Library size={18} /> My library <span className="nav-count">12</span></button><button className="nav-item"><Archive size={18} /> Saved rooms</button></nav>
        <div className="sidebar-bottom"><div className="connection-card"><div className="connection-icon"><Gamepad2 size={18} /></div><div><strong>{connected ? 'Xbox connected' : 'Connect controller'}</strong><small>{connected ? 'Ready for room control' : 'Use your controller'}</small></div><ChevronRight size={16} /></div><button className="nav-item"><Settings2 size={18} /> Settings</button><button className="nav-item"><CircleHelp size={18} /> Help & shortcuts</button><div className="profile"><div className="avatar">HS</div><div><strong>Heather Smith</strong><small>Local workspace</small></div><button className="icon-button"><ChevronRight size={16} /></button></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div><p className="eyebrow">ROOMSCAPE / SPATIAL WORKSPACE</p><h1>Everything in your space.</h1></div><div className="top-actions"><button className="outline-button" onClick={exportRoom}><ArrowDownToLine size={16} /> Export room</button></div></header>
        <div className="view-toolbar"><div className="mode-switch"><button className="mode active"><Move3d size={15} /> Room map</button><button className="mode" onClick={toggleCamera}><Camera size={15} /> Live camera</button></div><div className="view-tools"><button className="icon-button" title="Add anchor" onClick={addAnchor}><Plus size={18} /></button><button className="icon-button" title="Fullscreen"><Maximize2 size={17} /></button><span className={`status-pill ${connected ? 'connected' : ''}`}><span className="status-dot" /> {connected ? 'Controller ready' : 'Local mode'}</span></div></div>
        <section className="map-layout">
          <div className={`room-map ${isScanning ? 'scanning' : ''} ${xrActive ? 'xr-ready' : ''}`}>
            <canvas ref={xrCanvasRef} className="xr-canvas" />
            <video ref={videoRef} className={`camera-feed ${cameraOn ? 'visible' : ''}`} muted playsInline />
            <div className="map-grid" /><div className="room-label room-label-a">NORTH WALL <span>4.8 m</span></div><div className="room-label room-label-b">WINDOW <span>1.6 m</span></div><div className="room-label room-label-c">SOUTH WALL <span>4.8 m</span></div>
            <div className="room-shape"><div className="door-shape" /><div className="window-shape" /><div className="rug-shape" /><div className="table-shape"><span /></div><div className="chair-shape chair-one" /><div className="chair-shape chair-two" /></div>
            {anchors.map((anchor) => <button key={anchor.id} className={`anchor anchor-${anchor.kind} ${selected?.id === anchor.id ? 'selected' : ''}`} style={{ left: `${anchor.x}%`, top: `${anchor.y}%` }} onClick={() => setSelectedId(anchor.id)}><span className="anchor-pulse" /><span className="anchor-pin">{anchorIcon(anchor.kind)}</span><span className="anchor-label">{anchor.label}</span></button>)}
            {isScanning && <div className="scan-line"><ScanLine size={18} /> {scanStatus}</div>}
            <div className="map-footer"><span><Radio size={14} /> {xrActive ? 'Live XR session' : 'Desktop preview only'}</span><span>{xrActive ? 'Depth / hit-test active' : 'Start scan to use real surroundings'}</span></div>
          </div>
          <aside className="inspector"><div className="inspector-heading"><div><p className="eyebrow">SELECTED OBJECT</p><h2>{selected?.label ?? 'No object selected'}</h2></div><button className="icon-button" onClick={removeSelected}><Trash2 size={17} /></button></div>{selected && <><div className={`preview ${selected.kind}`}><div className="preview-glow" />{selected.kind === 'media' ? <Play size={26} fill="currentColor" /> : selected.kind === 'reading' ? <BookOpen size={26} /> : <Box size={26} />}<span>{selected.kind.toUpperCase()} OBJECT</span></div><div className="detail-block"><label className="field-label">Object name<input value={selected.label} onChange={(event) => updateSelected({ label: event.target.value })} /></label><label className="field-label">Object type<select value={selected.kind} onChange={(event) => updateSelected({ kind: event.target.value as AnchorKind })}><option value="scene">Object</option><option value="door">Door / doorway</option><option value="furniture">Furniture</option><option value="instrument">Instrument</option><option value="display">Display</option><option value="media">Movie player</option><option value="reading">Book / PDF</option></select></label><div className="detail-row"><span>Position</span><strong>{selected.detail}</strong></div>{selected.asset && <div className="asset-row"><div className="asset-icon">{selected.kind === 'media' ? <Video size={17} /> : <FileText size={17} />}</div><div><strong>{selected.asset}</strong><small>Linked locally on this device</small></div><ChevronRight size={16} /></div>}</div><div className="inspector-actions"><button className="outline-button wide" onClick={() => fileInputRef.current?.click()}><Upload size={16} /> Link file to object</button><button className="outline-button wide" onClick={() => setToast('A: select · B: place · Y: recenter')}><Gamepad2 size={16} /> Controller mapping</button></div></>}</aside>
        </section>
        <footer className="workspace-footer"><div className="tip"><Gamepad2 size={17} /><span><strong>Controller ready.</strong> Move with the left stick, select with A, and recenter with Y.</span></div><button className="mic-button"><Mic size={17} /></button></footer>
      </section>
      {(xrActive || cameraOn) && <><div className="gaze-reticle" aria-hidden="true"><span /></div><div className="spatial-dock"><div className="dock-status"><span className="status-dot" /> {xrActive ? scanStatus : 'Live camera workspace'}</div><div className="dock-hint"><Gamepad2 size={14} /> A open · B place · X library · Y recenter</div></div><div className="immersive-hud"><div className="immersive-hud-top"><span className="xr-badge"><span className="status-dot" /> {xrActive ? 'PASSTHROUGH XR' : 'CAMERA MODE'}</span><span>{scanStatus}</span></div><div className="immersive-hud-center"><div className="reticle" /><p>{xrActive ? 'Point at a surface, then use the controller' : 'Move your phone to look around'}</p></div></div></>}
      {libraryOpen && <div className="modal-backdrop" onClick={() => setLibraryOpen(false)}><section className="library-modal" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">LOCAL LIBRARY</p><h2>Your room content</h2></div><button className="icon-button" onClick={() => setLibraryOpen(false)}><X size={18} /></button></div><div className="library-list"><div className="library-item"><div className="file-kind video-kind"><Video size={19} /></div><div><strong>Interstellar.mp4</strong><small>Movie · 248 MB</small></div><button className="icon-button"><Play size={16} /></button></div><div className="library-item"><div className="file-kind pdf-kind"><FileText size={19} /></div><div><strong>Welcome to Roomscape.pdf</strong><small>Book · 4.2 MB</small></div><button className="icon-button"><BookOpen size={16} /></button></div></div><input ref={fileInputRef} className="file-input" type="file" accept="video/*,audio/*,application/pdf,image/*" onChange={(event) => event.target.files?.[0] && importFile(event.target.files[0])} /><button className="outline-button wide" onClick={() => fileInputRef.current?.click()}><Upload size={16} /> Import and link file</button></section></div>}
      {toast && <div className="toast"><Sparkles size={16} /> {toast}</div>}
    </main>
  )
}

export default App
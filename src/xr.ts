type XRLike = {
  requestSession: (mode: string, options?: Record<string, unknown>) => Promise<XRSessionLike>
  isSessionSupported?: (mode: string) => Promise<boolean>
}

type XRSessionLike = {
  renderState: { baseLayer?: XRWebGLLayerLike }
  updateRenderState: (state: { baseLayer: XRWebGLLayerLike }) => void
  requestReferenceSpace: (type: string) => Promise<XRReferenceSpaceLike>
  requestAnimationFrame: (callback: (time: number, frame: XRFrameLike) => void) => number
  addEventListener: (event: string, callback: () => void) => void
  end: () => Promise<void>
}

type XRWebGLLayerLike = { framebuffer: WebGLFramebuffer; getViewport: (view: XRViewLike) => { x: number; y: number; width: number; height: number } }
type XRReferenceSpaceLike = unknown
type XRViewLike = { viewport?: { x: number; y: number; width: number; height: number } }
type XRFrameLike = {
  session: XRSessionLike
  getViewerPose: (space: XRReferenceSpaceLike) => { views: XRViewLike[] } | null
  getHitTestResults?: (source: unknown) => Array<{ getPose: (space: XRReferenceSpaceLike) => { transform: { matrix: Float32Array } } | null }>
}

const getXR = () => (navigator as Navigator & { xr?: XRLike }).xr

export const supportsRoomScan = async () => {
  const xr = getXR()
  if (!xr?.isSessionSupported) return false
  const [ar, vr] = await Promise.all([
    xr.isSessionSupported('immersive-ar').catch(() => false),
    xr.isSessionSupported('immersive-vr').catch(() => false),
  ])
  return ar || vr
}

export const startImmersiveSession = async (canvas: HTMLCanvasElement, mode: 'immersive-vr' | 'immersive-ar', onStatus: (message: string) => void, onSelect: () => void) => {
  const xr = getXR()
  if (!xr) throw new Error('This browser does not expose WebXR.')

  const gl = canvas.getContext('webgl', { alpha: true, antialias: true })
  if (!gl) throw new Error('WebGL is unavailable on this device.')
  const xrGl = gl as WebGLRenderingContext & { makeXRCompatible?: () => Promise<void> }
  if (xrGl.makeXRCompatible) await xrGl.makeXRCompatible()

  const session = await xr.requestSession(mode, {
    requiredFeatures: ['local-floor'],
    optionalFeatures: mode === 'immersive-ar' ? ['hit-test', 'dom-overlay', 'depth-sensing', 'anchors'] : ['bounded-floor', 'dom-overlay', 'hand-tracking'],
    domOverlay: { root: document.body },
    depthSensing: { usagePreference: ['gpu-optimized'], dataFormatPreference: ['luminance-alpha'] },
  })
  const Layer = (globalThis as typeof globalThis & { XRWebGLLayer?: new (session: XRSessionLike, context: WebGLRenderingContext) => XRWebGLLayerLike }).XRWebGLLayer
  if (!Layer) throw new Error('This browser does not expose an XR rendering layer.')

  const layer = new Layer(session, gl)
  session.updateRenderState({ baseLayer: layer })
  const localSpace = await session.requestReferenceSpace('local-floor')
  const viewerSpace = await session.requestReferenceSpace('viewer')
  const hitSource = mode === 'immersive-ar'
    ? await (session as XRSessionLike & { requestHitTestSource?: (options: { space: XRReferenceSpaceLike }) => Promise<unknown> }).requestHitTestSource?.({ space: viewerSpace })
    : undefined
  let lastHit = false

  session.addEventListener('end', () => onStatus('Room scan ended'))
  const frame = (_time: number, xrFrame: XRFrameLike) => {
    const pose = xrFrame.getViewerPose(localSpace)
    if (pose) {
      onStatus(mode === 'immersive-ar'
        ? (lastHit ? 'Surface found · press A to place' : 'Move slowly to find floors and walls')
        : 'VR workspace active · press A to select')
      lastHit = mode === 'immersive-ar' && Boolean(hitSource && xrFrame.getHitTestResults?.(hitSource).some((result) => result.getPose(localSpace)))
      gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      pose.views.forEach((view) => {
        const viewport = layer.getViewport(view)
        gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height)
      })
    }
    session.requestAnimationFrame(frame)
  }
  session.requestAnimationFrame(frame)
  session.addEventListener('select', () => { if (mode === 'immersive-vr' || lastHit) onSelect() })
  onStatus(mode === 'immersive-ar' ? 'Scanning real surfaces...' : 'Entering VR workspace...')
  return session
}
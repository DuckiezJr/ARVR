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
  return xr.isSessionSupported('immersive-ar').catch(() => false)
}

export const startRoomScan = async (canvas: HTMLCanvasElement, onStatus: (message: string) => void, onPlaced: () => void) => {
  const xr = getXR()
  if (!xr) throw new Error('This browser does not expose WebXR.')

  const gl = canvas.getContext('webgl', { alpha: true, antialias: true })
  if (!gl) throw new Error('WebGL is unavailable on this device.')

  const session = await xr.requestSession('immersive-ar', {
    requiredFeatures: ['local-floor', 'hit-test'],
    optionalFeatures: ['dom-overlay', 'depth-sensing', 'anchors'],
    domOverlay: { root: document.body },
    depthSensing: { usagePreference: ['gpu-optimized'], dataFormatPreference: ['luminance-alpha'] },
  })
  const Layer = (globalThis as typeof globalThis & { XRWebGLLayer?: new (session: XRSessionLike, context: WebGLRenderingContext) => XRWebGLLayerLike }).XRWebGLLayer
  if (!Layer) throw new Error('This browser does not expose an XR rendering layer.')

  const layer = new Layer(session, gl)
  session.updateRenderState({ baseLayer: layer })
  const localSpace = await session.requestReferenceSpace('local-floor')
  const viewerSpace = await session.requestReferenceSpace('viewer')
  const hitSource = await (session as XRSessionLike & { requestHitTestSource?: (options: { space: XRReferenceSpaceLike }) => Promise<unknown> }).requestHitTestSource?.({ space: viewerSpace })
  let lastHit = false

  session.addEventListener('end', () => onStatus('Room scan ended'))
  const frame = (_time: number, xrFrame: XRFrameLike) => {
    const pose = xrFrame.getViewerPose(localSpace)
    if (pose) {
      onStatus(lastHit ? 'Surface found · press A to place' : 'Move slowly to find floors and walls')
      lastHit = Boolean(hitSource && xrFrame.getHitTestResults?.(hitSource).some((result) => result.getPose(localSpace)))
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
  session.addEventListener('select', () => { if (lastHit) onPlaced() })
  onStatus('Scanning real surfaces...')
  return session
}
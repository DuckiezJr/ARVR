import * as THREE from 'three'

type XRMode = 'immersive-vr' | 'immersive-ar'
type XRNavigator = Navigator & { xr?: XRSystem }

export type PlacedVolume = {
  id: number
  label: string
  kind: 'object' | 'media' | 'reading'
  position: [number, number, number]
}

export const supportsImmersiveAr = async () => {
  const xr = getXR()
  return Boolean(xr?.isSessionSupported && await xr.isSessionSupported('immersive-ar').catch(() => false))
}

const getXR = () => (navigator as XRNavigator).xr

export const supportsRoomScan = async () => {
  const xr = getXR()
  if (!xr?.isSessionSupported) return false
  const [ar, vr] = await Promise.all([
    xr.isSessionSupported('immersive-ar').catch(() => false),
    xr.isSessionSupported('immersive-vr').catch(() => false),
  ])
  return ar || vr
}

export const startImmersiveSession = async (
  canvas: HTMLCanvasElement,
  mode: XRMode,
  onStatus: (message: string) => void,
  onSelect: (volume: PlacedVolume | null) => void,
  initialVolumes: PlacedVolume[] = [],
) => {
  const xr = getXR()
  if (!xr) throw new Error('This device does not expose WebXR.')

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.xr.enabled = true
  renderer.xr.setReferenceSpaceType('local')

  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334433, 1.4))
  scene.add(new THREE.DirectionalLight(0xc9f26b, 0.8)).position.set(2, 4, 2)
  if (mode === 'immersive-vr') {
    const floor = new THREE.GridHelper(12, 24, 0x65d5b1, 0x243b35)
    floor.position.y = 0
    floor.material.transparent = true
    floor.material.opacity = 0.28
    scene.add(floor)
  }
  const camera = new THREE.PerspectiveCamera()
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.035, 0.045, 32),
    new THREE.MeshBasicMaterial({ color: 0xc9f26b, transparent: true, opacity: 0.95 }),
  )
  reticle.rotation.x = -Math.PI / 2
  reticle.matrixAutoUpdate = false
  reticle.visible = false
  scene.add(reticle)

  const preview = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.32, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xc9f26b, transparent: true, opacity: 0.2, wireframe: true }),
  )
  preview.visible = false
  scene.add(preview)

  const makeVolume = (volume: PlacedVolume) => {
    const color = volume.kind === 'media' ? 0x65d5b1 : volume.kind === 'reading' ? 0xecc76d : 0xc9f26b
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.24, 0.08),
      new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.72, roughness: 0.45 }),
    )
    mesh.position.set(...volume.position)
    mesh.userData.volume = volume
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0xc9f26b, transparent: true, opacity: 0.9 })))
    mesh.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.02), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2 })))
    scene.add(mesh)
  }
  initialVolumes.forEach(makeVolume)

  const controller = renderer.xr.getController(0)
  controller.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0xc9f26b }),
  ))
  scene.add(controller)

  const session = await xr.requestSession(mode, {
    requiredFeatures: [],
    optionalFeatures: mode === 'immersive-ar' ? ['hit-test', 'anchors', 'depth-sensing', 'dom-overlay', 'local-floor'] : ['bounded-floor', 'hand-tracking', 'dom-overlay', 'local-floor'],
    ...(mode === 'immersive-ar' ? { domOverlay: { root: document.body } } : {}),
  })
  await renderer.xr.setSession(session)

  const viewerSpace = mode === 'immersive-ar' ? await session.requestReferenceSpace('viewer') : null
  const hitSource = mode === 'immersive-ar' && viewerSpace && session.requestHitTestSource ? await session.requestHitTestSource({ space: viewerSpace }) : null
  let reticlePose: THREE.Matrix4 | null = null

  const placeVolume = () => {
    if (mode === 'immersive-ar' && !reticlePose) return
    const matrix = reticlePose ?? new THREE.Matrix4().makeTranslation(0, 1.3, -7)
    const position = new THREE.Vector3().setFromMatrixPosition(matrix)
    const volume: PlacedVolume = { id: Date.now(), label: 'New object', kind: 'object', position: [position.x, position.y, position.z] }
    makeVolume(volume)
    onSelect(volume)
  }
  controller.addEventListener('select', placeVolume)
  session.addEventListener('end', () => { controller.removeEventListener('select', placeVolume); renderer.setAnimationLoop(null); renderer.dispose(); onStatus('XR session ended') })

  renderer.setAnimationLoop((_time, frame) => {
    if (frame && hitSource && viewerSpace) {
      const hit = frame.getHitTestResults(hitSource)[0]
      const referenceSpace = renderer.xr.getReferenceSpace()
      const pose = referenceSpace ? hit?.getPose(referenceSpace) : undefined
      if (pose) { reticlePose = new THREE.Matrix4().fromArray(pose.transform.matrix); reticle.matrix.copy(reticlePose); preview.matrix.copy(reticlePose); reticle.visible = true; preview.visible = true; onStatus('Surface found') }
      else { reticlePose = null; reticle.visible = false; preview.visible = false; onStatus('Searching surfaces') }
    } else { preview.visible = false; onStatus('VR workspace active') }
    renderer.render(scene, camera)
  })
  onStatus(mode === 'immersive-ar' ? 'Scanning real surfaces...' : 'Entering VR workspace...')
  return session
}

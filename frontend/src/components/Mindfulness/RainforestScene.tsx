import {
  Environment,
  Lightformer,
  OrbitControls,
  OrthographicCamera,
  useGLTF,
} from "@react-three/drei"
import { Canvas, useThree } from "@react-three/fiber"
import {
  type ComponentRef,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react"
import {
  Box3,
  type OrthographicCamera as Camera,
  type Group,
  Mesh,
  NeutralToneMapping,
  SRGBColorSpace,
  Vector3,
} from "three"
import {
  createIslandInstance,
  retainIslandResources,
} from "../IslandPreview/island-resources"
import { JellyInteraction } from "./JellyInteraction"
import { applyRainforestLook } from "./rainforest-look"

const MODEL_URL = `${import.meta.env.BASE_URL}models/mindfulness/rainforest.glb`

export const clearRainforestCache = () => useGLTF.clear(MODEL_URL)

// Keep capture children stable when audio progress rerenders the parent page.
const ReflectionLighting = memo(function ReflectionLighting() {
  return (
    <Environment
      frames={1}
      resolution={128}
      background={false}
      environmentIntensity={0.65}
    >
      <color attach="background" args={["#e8efeb"]} />
      <Lightformer
        form="rect"
        position={[-5, 7, -6]}
        scale={[10, 4]}
        target={[0, 0, 0]}
        intensity={3}
        color="#ffffff"
      />
      <Lightformer
        form="rect"
        position={[6, 4, -3]}
        scale={[4, 2]}
        target={[0, 0, 0]}
        intensity={1.5}
        color="#e9ffff"
      />
    </Environment>
  )
})

function Framing({
  box,
  model,
  controls,
}: {
  box: Box3
  model: Group
  controls: React.RefObject<ComponentRef<typeof OrbitControls> | null>
}) {
  const camera = useRef<Camera>(null)
  const { size, camera: active, invalidate } = useThree()
  useLayoutEffect(() => {
    if (!camera.current || camera.current !== active || !controls.current)
      return
    const view = camera.current
    const target = box.getCenter(new Vector3())
    view.position.copy(target).add(new Vector3(11, 10, 14))
    view.lookAt(target)
    view.updateMatrixWorld(true)
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity
    const point = new Vector3()
    model.updateWorldMatrix(true, true)
    // Sparse palm crowns leave large empty bounding-box corners. Fit actual
    // vertices once per resize, rather than shrinking the whole diorama for them.
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return
      const positions = object.geometry.getAttribute("position")
      const matrix = view.matrixWorldInverse
        .clone()
        .multiply(object.matrixWorld)
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(matrix)
        minX = Math.min(minX, point.x)
        maxX = Math.max(maxX, point.x)
        minY = Math.min(minY, point.y)
        maxY = Math.max(maxY, point.y)
      }
    })
    const shift = new Vector3(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      0,
    ).applyQuaternion(view.quaternion)
    view.position.add(shift)
    target.add(shift)
    const aspect = size.width / Math.max(1, size.height)
    const half = Math.max((maxY - minY) / 2, (maxX - minX) / aspect / 2) * 1.16
    view.left = -half * aspect
    view.right = half * aspect
    view.top = half
    view.bottom = -half
    view.zoom = 1
    view.updateProjectionMatrix()
    controls.current.target.copy(target)
    controls.current.update()
    invalidate()
  }, [active, box, controls, invalidate, model, size.height, size.width])
  return (
    <OrthographicCamera ref={camera} makeDefault manual near={0.1} far={150} />
  )
}

function Content({
  playing,
  reducedMotion,
  simplified,
  onReady,
}: {
  playing: boolean
  reducedMotion: boolean
  simplified: boolean
  onReady: () => void
}) {
  const { scene } = useGLTF(MODEL_URL, false, false)
  const instance = useMemo(() => {
    const clone = createIslandInstance(scene)
    applyRainforestLook(clone.materials.values())
    return clone
  }, [scene])
  const box = useMemo(
    () => new Box3().setFromObject(instance.model),
    [instance],
  )
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const onDragChange = useCallback((dragging: boolean) => {
    if (controls.current) controls.current.enabled = !dragging
  }, [])
  useEffect(
    () => retainIslandResources(instance, () => useGLTF.clear(MODEL_URL)),
    [instance],
  )
  useEffect(onReady, [onReady])
  return (
    <>
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        enableDamping={!reducedMotion}
        dampingFactor={0.12}
        minZoom={0.8}
        maxZoom={1.35}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.5}
      />
      <Framing box={box} model={instance.model} controls={controls} />
      <JellyInteraction
        model={instance.model}
        bottom={box.min.y}
        playing={playing}
        reducedMotion={reducedMotion}
        simplified={simplified}
        onDragChange={onDragChange}
      />
    </>
  )
}

export default function RainforestScene({
  playing,
  reducedMotion,
  visible,
  simplified,
  onReady,
}: {
  playing: boolean
  reducedMotion: boolean
  visible: boolean
  simplified: boolean
  onReady: () => void
}) {
  return (
    <Canvas
      dpr={[1, simplified ? 1 : 1.5]}
      frameloop={
        !visible ? "never" : playing && !reducedMotion ? "always" : "demand"
      }
      gl={{ antialias: !simplified, alpha: true, powerPreference: "low-power" }}
      camera={{ position: [11, 10, 14] }}
      onCreated={({ gl }) => {
        gl.toneMapping = NeutralToneMapping
        gl.toneMappingExposure = 1.06
        gl.outputColorSpace = SRGBColorSpace
      }}
      role="img"
      aria-label="可按压回弹的雨林，拖动模型轻轻倾斜，拖动空白处旋转观察"
    >
      <ambientLight intensity={1.1} />
      <hemisphereLight args={["#f5ffff", "#eadcc4", 1]} />
      <directionalLight
        position={[-5, 10, 8]}
        intensity={2.2}
        color="#fff9ef"
      />
      <directionalLight position={[7, 4, -5]} intensity={0.8} color="#e7f6ef" />
      <ReflectionLighting />
      <Suspense fallback={null}>
        <Content
          playing={playing}
          reducedMotion={reducedMotion}
          simplified={simplified}
          onReady={onReady}
        />
      </Suspense>
    </Canvas>
  )
}

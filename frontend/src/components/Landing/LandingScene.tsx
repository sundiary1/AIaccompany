import { useGLTF } from "@react-three/drei"
import { Canvas, useThree } from "@react-three/fiber"
import {
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
} from "react"
import {
  Box3,
  Group,
  Mesh,
  NeutralToneMapping,
  PerspectiveCamera,
  SRGBColorSpace,
  Vector3,
} from "three"
import { applyIslandPalette } from "../IslandPreview/island-look"
import {
  createIslandInstance,
  retainIslandResources,
} from "../IslandPreview/island-resources"
import {
  getLandingView,
  LANDING_MODEL_PATH,
  LANDING_WATER_LEVEL,
  LANDING_WATER_SIZE,
} from "./landing-world"

const MODEL_URL = `${import.meta.env.BASE_URL}${LANDING_MODEL_PATH}`

function FixedCamera() {
  const { camera, size, invalidate } = useThree()
  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const preset = getLandingView(size.width, size.height)
    camera.position.set(...preset.position)
    camera.lookAt(...preset.target)
    camera.fov = preset.fov
    camera.near = 0.1
    camera.far = 180
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, size.width, size.height, invalidate])
  return null
}

function Shore({ onReady }: { onReady: () => void }) {
  const { scene } = useGLTF(MODEL_URL, false, false)
  const instance = useMemo(() => {
    const cloned = createIslandInstance(scene)
    applyIslandPalette("home", cloned.materials.values())
    cloned.model.traverse((node) => {
      if (!(node instanceof Mesh)) return
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material]
      // The original bounded water volume is only hidden in this clone.
      // A continuous surface covers the submerged rectangular foundation.
      if (materials.some((material) => material.name === "water"))
        node.visible = false
    })
    // A few original reeds make near-field scenery; their geometry stays shared.
    cloned.model.updateMatrixWorld(true)
    const reeds: Mesh[] = []
    cloned.model.traverse((node) => {
      if (node instanceof Mesh && !Array.isArray(node.material)) {
        if (node.material.name === "grass") reeds.push(node)
      }
    })
    const foreground = new Group()
    foreground.name = "Landing_ForegroundReeds"
    const patches = [
      [4.6, 4.2, 0.9],
      [5.5, 1.6, 1.05],
    ]
    patches.forEach(([x, z, scale], index) => {
      const template = reeds[index * 3]
      if (!template) return
      const reed = template.clone()
      template.matrixWorld.decompose(reed.position, reed.quaternion, reed.scale)
      const patch = new Group()
      patch.add(reed)
      const bounds = new Box3().setFromObject(patch)
      const center = bounds.getCenter(new Vector3())
      reed.position.sub(new Vector3(center.x, bounds.min.y, center.z))
      patch.scale.setScalar(scale)
      patch.position.set(x, LANDING_WATER_LEVEL - 0.08, z)
      foreground.add(patch)
    })
    cloned.model.add(foreground)
    return cloned
  }, [scene])
  useEffect(
    () => retainIslandResources(instance, () => useGLTF.clear(MODEL_URL)),
    [instance],
  )
  useEffect(onReady, [onReady])
  return <primitive object={instance.model} dispose={null} />
}

function Surface() {
  return (
    <mesh
      name="Landing_ContinuousShallows"
      position={[0, LANDING_WATER_LEVEL, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[LANDING_WATER_SIZE, LANDING_WATER_SIZE]} />
      <meshStandardMaterial color="#65c1d0" roughness={0.48} metalness={0} />
    </mesh>
  )
}

export function LandingScene({
  visible,
  onReady,
  fallback,
}: {
  visible: boolean
  onReady: () => void
  fallback: ReactNode
}) {
  return (
    <Canvas
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      dpr={[1, 1.5]}
      frameloop={visible ? "demand" : "never"}
      shadows="percentage"
      gl={{ antialias: true, alpha: false, powerPreference: "low-power" }}
      camera={{ position: [6.5, 5.9, 9.5], fov: 40 }}
      onCreated={({ gl }) => {
        gl.toneMapping = NeutralToneMapping
        gl.toneMappingExposure = 1
        gl.outputColorSpace = SRGBColorSpace
      }}
      fallback={fallback}
      role="img"
      aria-label="心屿浅水岸边的飞机遗迹、岩石与芦苇，固定视角的自然场景"
    >
      <color attach="background" args={["#dceee9"]} />
      <fog attach="fog" args={["#dceee9", 22, 100]} />
      <FixedCamera />
      <ambientLight intensity={0.6} />
      <hemisphereLight args={["#eef8ff", "#d3c6a1", 1.1]} />
      <directionalLight
        position={[-5, 12, 7]}
        intensity={2.5}
        color="#fff7e6"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-normalBias={0.04}
        shadow-bias={-0.0002}
      />
      <directionalLight
        position={[6, 5, -5]}
        intensity={0.55}
        color="#edf8ff"
      />
      <Surface />
      <Suspense fallback={null}>
        <Shore onReady={onReady} />
      </Suspense>
    </Canvas>
  )
}

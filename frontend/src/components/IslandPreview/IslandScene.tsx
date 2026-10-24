import { OrthographicCamera, useGLTF } from "@react-three/drei"
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber"
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import {
  AgXToneMapping,
  Color,
  type Group,
  MathUtils,
  Mesh,
  type MeshBasicMaterial,
  Raycaster,
  SRGBColorSpace,
  type OrthographicCamera as ThreeOrthographicCamera,
  Vector3,
} from "three"
import { CompanionCat, type CompanionCatState } from "./CompanionCat"
import { createIslandInstance, retainIslandResources } from "./island-resources"

export const ISLAND_MODEL_URL = `${import.meta.env.BASE_URL}models/starter_jelly_island.glb`

const TAU = Math.PI * 2
const TILT = (0.75 * Math.PI) / 180
const HIGHLIGHT_COLOR = new Color("#d8e8c0")

type IslandSceneProps = {
  playing: boolean
  onReady: () => void
  onSelect: () => void
  reducedMotion: boolean
  characterPlaying: boolean
  characterState: CompanionCatState
  characterActionKey: number
  onCharacterSelect: () => void
  onCharacterActionComplete: () => void
}

/** Fit the actual low-poly silhouette, including the trimmed island corners. */
function modelCorners(model: Group) {
  const corners: Vector3[] = []
  model.updateMatrixWorld(true)
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const positions = object.geometry.getAttribute("position")
    for (let i = 0; i < positions.count; i++) {
      corners.push(
        new Vector3()
          .fromBufferAttribute(positions, i)
          .applyMatrix4(object.matrixWorld),
      )
    }
  })
  return corners
}

function FramedCamera({ corners }: { corners: Vector3[] }) {
  const cameraRef = useRef<ThreeOrthographicCamera>(null)
  const { size, invalidate } = useThree()

  useLayoutEffect(() => {
    const camera = cameraRef.current
    if (!camera || !size.width || !size.height) return

    // GLB is already Y-up: map the Blender preview camera, not the model.
    camera.position.set(12.5, 10.5, 16)
    camera.up.set(0, 1, 0)
    camera.lookAt(0, 0.7, 0)
    camera.updateMatrixWorld(true)

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const corner of corners) {
      const point = corner.clone().applyMatrix4(camera.matrixWorldInverse)
      minX = Math.min(minX, point.x)
      maxX = Math.max(maxX, point.x)
      minY = Math.min(minY, point.y)
      maxY = Math.max(maxY, point.y)
    }

    // Shift parallel to the image plane; the viewing angle remains fixed.
    const shift = new Vector3(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      0,
    ).applyQuaternion(camera.quaternion)
    camera.position.add(shift)
    camera.updateMatrixWorld(true)

    // Padding covers the complete float/scale/tilt envelope, including narrow screens.
    const halfWidth = (maxX - minX) / 2 + 0.55
    const halfHeight = (maxY - minY) / 2 + 0.55
    const aspect = size.width / size.height
    const frameHeight = Math.max(halfHeight, halfWidth / aspect) * 1.06
    camera.left = -frameHeight * aspect
    camera.right = frameHeight * aspect
    camera.top = frameHeight
    camera.bottom = -frameHeight
    camera.updateProjectionMatrix()
    invalidate()
  }, [corners, invalidate, size.height, size.width])

  return (
    <OrthographicCamera
      ref={cameraRef}
      name="IslandPreviewCamera"
      makeDefault
      manual
      near={0.1}
      far={100}
      zoom={1}
    />
  )
}

function IslandContent({
  playing,
  onReady,
  onSelect,
  reducedMotion,
  characterPlaying,
  characterState,
  characterActionKey,
  onCharacterSelect,
  onCharacterActionComplete,
}: IslandSceneProps) {
  const { scene } = useGLTF(ISLAND_MODEL_URL, false, false)
  const instance = useMemo(() => createIslandInstance(scene), [scene])
  const { model, shadowTexture, highlights } = instance
  const { gl, invalidate } = useThree()
  const corners = useMemo(() => modelCorners(model), [model])
  const catPosition = useMemo<[number, number, number]>(() => {
    model.updateMatrixWorld(true)
    const grass = model.getObjectByName("Grass_Top")
    if (!grass) throw new Error("The island is missing its grass surface.")
    const ray = new Raycaster(new Vector3(1.1, 10, 0.6), new Vector3(0, -1, 0))
    const hit = ray.intersectObject(grass, true)[0]
    if (!hit) throw new Error("Cannot place the companion on the grass.")
    return [1.1, hit.point.y + 0.001, 0.6]
  }, [model])
  const islandRef = useRef<Group>(null)
  const shadowRef = useRef<Mesh>(null)
  const shadowMaterialRef = useRef<MeshBasicMaterial>(null)
  const phase = useRef(0)
  const hovered = useRef(false)
  const highlight = useRef(0)

  useEffect(() => onReady(), [onReady])
  useEffect(
    () =>
      retainIslandResources(instance, () => useGLTF.clear(ISLAND_MODEL_URL)),
    [instance],
  )
  useEffect(
    () => () => {
      gl.domElement.style.cursor = ""
    },
    [gl],
  )

  const onPointerOver = (event: ThreeEvent<PointerEvent>) => {
    if (event.pointerType === "touch") return
    event.stopPropagation()
    hovered.current = true
    gl.domElement.style.cursor = "pointer"
    invalidate()
  }
  const onPointerOut = () => {
    hovered.current = false
    gl.domElement.style.cursor = ""
    invalidate()
  }

  useFrame((_, delta) => {
    // Preserve phase when paused/hidden; clamp the first frame after a long idle.
    if (playing) phase.current += Math.min(delta, 0.05)
    const targetHighlight = hovered.current ? 1 : 0
    let nextHighlight = reducedMotion
      ? targetHighlight
      : MathUtils.damp(
          highlight.current,
          targetHighlight,
          10,
          Math.min(delta, 0.05),
        )
    if (Math.abs(nextHighlight - targetHighlight) < 0.001)
      nextHighlight = targetHighlight
    if (nextHighlight !== highlight.current) {
      highlight.current = nextHighlight
      for (const { material, baseEmissive } of highlights) {
        material.emissive
          .copy(baseEmissive)
          .lerp(HIGHLIGHT_COLOR, nextHighlight * 0.04)
      }
    }
    if (nextHighlight !== targetHighlight) invalidate()
    const t = phase.current
    const float = Math.sin((TAU * t) / 5)
    const breathe = 1 + 0.008 * Math.sin((TAU * t) / 6)
    const island = islandRef.current
    if (island) {
      island.position.y = float * 0.12
      island.scale.setScalar(breathe)
      island.rotation.x = TILT * 0.75 * Math.sin((TAU * t) / 8)
      island.rotation.z = TILT * Math.sin((TAU * t) / 7)
    }
    if (shadowRef.current) {
      const spread = 1 + float * 0.035
      shadowRef.current.scale.set(10.8 * spread, 10 * spread, 1)
    }
    if (shadowMaterialRef.current) {
      shadowMaterialRef.current.opacity = 0.26 - float * 0.025
    }
  })

  return (
    <>
      <FramedCamera corners={corners} />
      {/* biome-ignore lint/a11y/noStaticElementInteractions: R3F group is a Three.js object; the HTML info button provides keyboard access. */}
      <group
        ref={islandRef}
        name="Jelly_Island_Motion"
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onClick={(event) => {
          event.stopPropagation()
          if (event.delta <= 5) onSelect()
        }}
      >
        <primitive object={model} dispose={null} />
        <CompanionCat
          position={catPosition}
          playing={characterPlaying}
          reducedMotion={reducedMotion}
          state={characterState}
          actionKey={characterActionKey}
          onSelect={onCharacterSelect}
          onActionComplete={onCharacterActionComplete}
        />
      </group>
      <mesh
        ref={shadowRef}
        name="Island_Simulated_Shadow"
        position={[0.15, -1.45, 0.15]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[10.8, 10, 1]}
        renderOrder={-1}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={shadowMaterialRef}
          map={shadowTexture}
          color="#655444"
          transparent
          opacity={0.26}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </>
  )
}

export function IslandScene(props: IslandSceneProps) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop={props.playing || props.characterPlaying ? "always" : "demand"}
      gl={{ antialias: true, alpha: false, powerPreference: "low-power" }}
      camera={{ position: [12.5, 10.5, 16] }}
      onCreated={({ gl }) => {
        gl.toneMapping = AgXToneMapping
        gl.toneMappingExposure = 1.3
        gl.outputColorSpace = SRGBColorSpace
      }}
      fallback={
        <div role="alert" style={{ padding: "3rem", textAlign: "center" }}>
          当前设备暂时无法显示三维小岛，请使用支持 WebGL 的浏览器。
        </div>
      }
      role="img"
      aria-label="可以点击的果冻岛和陪伴猫小屿；也可使用下方与小屿聊聊按钮打开聊天"
    >
      <color attach="background" args={["#f6f2e9"]} />
      <ambientLight intensity={0.9} color="#fff4df" />
      <hemisphereLight args={["#fff8ed", "#bca88b", 0.7]} />
      <directionalLight
        position={[-5, 10, 6]}
        intensity={3.2}
        color="#fff1d8"
      />
      <directionalLight position={[7, 6, -3]} intensity={1.1} color="#e7efff" />
      <Suspense fallback={null}>
        <IslandContent {...props} />
      </Suspense>
    </Canvas>
  )
}

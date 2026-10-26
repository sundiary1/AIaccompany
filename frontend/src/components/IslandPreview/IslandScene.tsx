import { Html, useGLTF } from "@react-three/drei"
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import {
  Color,
  type Group,
  MathUtils,
  Mesh,
  NeutralToneMapping,
  SRGBColorSpace,
  Vector3,
} from "three"
import { CloudBridge } from "./CloudBridge"
import { CompanionCat, type CompanionCatState } from "./CompanionCat"
import { applyIslandPalette } from "./island-look"
import styles from "./island-preview.module.css"
import { createIslandInstance, retainIslandResources } from "./island-resources"
import {
  COMPANION_SPAWN,
  getCloudBridges,
  getIslandDefinitions,
  ISLANDS,
  type IslandDefinition,
  toWorldPoint,
} from "./island-world"
import {
  type CameraGesture,
  WorldCamera,
  type ZoomRequest,
} from "./WorldCamera"

export const WORLD_MODEL_URLS = ISLANDS.filter((island) => island.enabled).map(
  (island) => `${import.meta.env.BASE_URL}${island.modelPath}`,
)
export const ISLAND_MODEL_URL = WORLD_MODEL_URLS[0]
const HIGHLIGHT_COLOR = new Color("#d8e8c0")
const TAU = Math.PI * 2

type IslandSceneProps = {
  compact: boolean
  controlsEnabled: boolean
  resetKey: number
  zoomRequest: ZoomRequest
  playing: boolean
  onReady: () => void
  onSelect: () => void
  onIslandSelect: (island: IslandDefinition) => void
  reducedMotion: boolean
  characterPlaying: boolean
  characterState: CompanionCatState
  characterActionKey: number
  onCharacterSelect: () => void
  onCharacterActionComplete: () => void
}

type Instance = ReturnType<typeof createIslandInstance>

function IslandVisual({
  definition,
  instance,
  reducedMotion,
  onSelect,
}: {
  definition: IslandDefinition
  instance: Instance
  reducedMotion: boolean
  onSelect: () => void
}) {
  const { gl, invalidate } = useThree()
  const [hovered, setHovered] = useState(false)
  const hover = useRef(false)
  const strength = useRef(0)
  const flash = useRef(0)
  useEffect(
    () => () => {
      gl.domElement.style.cursor = ""
    },
    [gl],
  )
  const enter = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    if (event.pointerType === "touch") return
    hover.current = true
    setHovered(true)
    gl.domElement.style.cursor = "pointer"
    invalidate()
  }
  const leave = () => {
    hover.current = false
    setHovered(false)
    gl.domElement.style.cursor = ""
    invalidate()
  }
  useFrame((_, frameDelta) => {
    const delta = Math.min(frameDelta, 0.05)
    flash.current = Math.max(0, flash.current - delta)
    const target = flash.current > 0 ? 1.5 : hover.current ? 1 : 0
    let next = reducedMotion
      ? target
      : MathUtils.damp(strength.current, target, 12, delta)
    if (Math.abs(next - target) < 0.001) next = target
    if (next !== strength.current) {
      strength.current = next
      for (const { material, baseEmissive } of instance.highlights)
        material.emissive.copy(baseEmissive).lerp(HIGHLIGHT_COLOR, next * 0.045)
    }
    if (next !== target || flash.current > 0) invalidate()
  })
  return (
    <group
      name={`Island_${definition.id}`}
      position={definition.position}
      rotation={definition.rotation}
      scale={definition.scale}
      userData={{ islandId: definition.id }}
    >
      <primitive object={instance.model} dispose={null} />
      {/* biome-ignore lint/a11y/noStaticElementInteractions: R3F hit proxy; the same route is available as an HTML link. */}
      <mesh
        name={`Island_${definition.id}_HitArea`}
        position={definition.hitArea.position}
        onPointerOver={enter}
        onPointerOut={leave}
        onClick={(event) => {
          event.stopPropagation()
          if (event.delta > 5) return
          flash.current = reducedMotion ? 0 : 0.22
          invalidate()
          onSelect()
        }}
      >
        <boxGeometry args={definition.hitArea.size} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          colorWrite={false}
        />
      </mesh>
      <Html
        position={definition.labelPosition}
        center
        zIndexRange={[5, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div
          className={styles.worldLabel}
          data-island-label={definition.id}
          data-active={hovered}
        >
          <span className={styles.worldLabelDot} />
          <strong>{definition.name}</strong>
          <span className={styles.worldLabelDescription}>
            {definition.description}
          </span>
        </div>
      </Html>
    </group>
  )
}

function IslandContent(props: IslandSceneProps) {
  const gltfs = useGLTF(WORLD_MODEL_URLS, false, false)
  const definitions = useMemo(
    () => getIslandDefinitions(props.compact),
    [props.compact],
  )
  const connections = useMemo(
    () => getCloudBridges(props.compact),
    [props.compact],
  )
  const instances = useMemo(
    () =>
      gltfs.map(({ scene }, index) => {
        const instance = createIslandInstance(scene)
        applyIslandPalette(
          ISLANDS.filter((island) => island.enabled)[index].id,
          instance.materials.values(),
        )
        // Picking uses one inexpensive proxy per island, never detailed grass or birds.
        instance.model.traverse((object) => {
          if (object instanceof Mesh) object.raycast = () => {}
        })
        return instance
      }),
    [gltfs],
  )
  const corners = useMemo(() => {
    const points: Vector3[] = []
    instances.forEach((instance, index) => {
      instance.model.updateWorldMatrix(true, true)
      const inverseRoot = instance.model.matrixWorld.clone().invert()
      instance.model.traverse((object) => {
        if (!(object instanceof Mesh)) return
        object.geometry.computeBoundingBox()
        const box = object.geometry.boundingBox
        if (!box) return
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z]) {
              const p = new Vector3(x, y, z)
                .applyMatrix4(object.matrixWorld)
                .applyMatrix4(inverseRoot)
              points.push(
                new Vector3(
                  ...toWorldPoint(definitions[index], [p.x, p.y, p.z]),
                ),
              )
            }
      })
    })
    // Include the companion and low HTML labels, not just the imported geometry.
    const home = definitions.find(
      (island) => island.id === COMPANION_SPAWN.islandId,
    )!
    points.push(new Vector3(...toWorldPoint(home, [1.5, 3.3, 2])))
    for (const definition of definitions)
      points.push(new Vector3(...toWorldPoint(definition, [0, -0.4, 4.8])))
    return points
  }, [definitions, instances])
  const motion = useRef<Group>(null)
  const gesture = useMemo<CameraGesture>(
    () => ({ active: false, moved: false, blockedUntil: 0 }),
    [],
  )
  const select = (callback: () => void) => {
    if (
      (gesture.active && gesture.moved) ||
      performance.now() < gesture.blockedUntil
    )
      return
    callback()
  }
  const time = useRef(0)
  useEffect(() => props.onReady(), [props.onReady])
  useEffect(() => {
    const releases = instances.map((instance, index) =>
      retainIslandResources(instance, () =>
        useGLTF.clear(WORLD_MODEL_URLS[index]),
      ),
    )
    return () => {
      for (const release of releases) release()
    }
  }, [instances])
  useFrame((_, delta) => {
    if (props.playing) time.current += Math.min(delta, 0.05)
    if (!motion.current) return
    const t = props.reducedMotion ? 0 : time.current
    // One transform for both islands, character and cloud bridge: docks cannot drift.
    motion.current.position.y = Math.sin((TAU * t) / 5) * 0.12
    motion.current.scale.setScalar(1 + Math.sin((TAU * t) / 6) * 0.008)
    motion.current.rotation.x = Math.sin((TAU * t) / 8) * 0.004
    motion.current.rotation.z = Math.sin((TAU * t) / 7) * 0.006
  })
  const home = definitions.find(
    (island) => island.id === COMPANION_SPAWN.islandId,
  )!
  return (
    <>
      <WorldCamera
        compact={props.compact}
        corners={corners}
        enabled={props.controlsEnabled}
        reducedMotion={props.reducedMotion}
        resetKey={props.resetKey}
        zoomRequest={props.zoomRequest}
        gesture={gesture}
      />
      <group ref={motion} name="Island_World_Motion">
        {definitions.map((definition, index) => (
          <IslandVisual
            key={definition.id}
            definition={definition}
            instance={instances[index]}
            reducedMotion={props.reducedMotion}
            onSelect={() =>
              select(() =>
                definition.id === "home"
                  ? props.onSelect()
                  : props.onIslandSelect(definition),
              )
            }
          />
        ))}
        <CloudBridge connections={connections} />
        <CompanionCat
          position={toWorldPoint(home, COMPANION_SPAWN.localPosition)}
          playing={props.characterPlaying}
          reducedMotion={props.reducedMotion}
          state={props.characterState}
          actionKey={props.characterActionKey}
          onSelect={() => select(props.onCharacterSelect)}
          onActionComplete={props.onCharacterActionComplete}
        />
      </group>
      {definitions.map((island, index) => (
        <mesh
          key={island.id}
          name={`Island_${island.id}_Shadow`}
          position={[island.position[0], -0.9, island.position[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[9.4, 8.8, 1]}
          renderOrder={-1}
          raycast={() => {}}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={instances[index].shadowTexture}
            color="#65737a"
            transparent
            opacity={0.13}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  )
}

export function IslandScene(props: IslandSceneProps) {
  return (
    <Canvas
      style={{ position: "absolute", inset: 0 }}
      shadows="percentage"
      dpr={[1, 1.5]}
      frameloop={props.playing || props.characterPlaying ? "always" : "demand"}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      camera={{ position: [12.5, 12, 18] }}
      onCreated={({ gl }) => {
        gl.toneMapping = NeutralToneMapping
        gl.toneMappingExposure = 1
        gl.outputColorSpace = SRGBColorSpace
        gl.setClearColor("#ffffff", 0)
      }}
      fallback={
        <div
          role="alert"
          style={{ padding: "3rem", textAlign: "center", background: "white" }}
        >
          当前设备暂时无法显示三维群岛，可继续使用下方的聊天与沙盘入口。
        </div>
      }
      role="img"
      aria-label="可拖动旋转、缩放的群岛；点击小屿聊天，沙盒进入心理沙盘，书屋进入曼陀罗绘画，雨林进入正念，也可使用地图与下方按钮"
    >
      <ambientLight intensity={0.5} color="#ffffff" />
      <hemisphereLight args={["#edf6ff", "#d0c1a9", 0.65]} />
      <directionalLight
        position={[-6, 12, 8]}
        intensity={2.7}
        color="#fff7ed"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={20}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={45}
        shadow-normalBias={0.05}
        shadow-bias={-0.002}
      />
      <directionalLight
        position={[7, 6, -3]}
        intensity={0.65}
        color="#e7efff"
      />
      <Suspense fallback={null}>
        <IslandContent {...props} />
      </Suspense>
    </Canvas>
  )
}

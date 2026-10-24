import { useGLTF } from "@react-three/drei"
import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber"
import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { MathUtils, type Object3D } from "three"

import { createIslandInstance, retainIslandResources } from "./island-resources"

export type CompanionCatState = "Idle" | "Greeting" | "Responding"
export const CAT_MODEL_URL = `${import.meta.env.BASE_URL}models/companion_cat.glb`

type CompanionCatProps = {
  position: [number, number, number]
  playing: boolean
  reducedMotion: boolean
  state: CompanionCatState
  actionKey: number
  onSelect: () => void
  onActionComplete: () => void
}

function requiredNode(root: Object3D, name: string) {
  const node = root.getObjectByName(name)
  if (!node) throw new Error(`Companion cat is missing the ${name} pivot.`)
  return node
}

/** A controlled animation interface, ready for future chat state integration. */
export function CompanionCat({
  position,
  playing,
  reducedMotion,
  state,
  actionKey,
  onSelect,
  onActionComplete,
}: CompanionCatProps) {
  const { scene } = useGLTF(CAT_MODEL_URL, false, false)
  const instance = useMemo(() => createIslandInstance(scene), [scene])
  const { gl, invalidate } = useThree()
  const rig = useMemo(() => {
    const body = requiredNode(instance.model, "Body")
    return {
      body,
      bodyY: body.position.y,
      head: requiredNode(instance.model, "Head"),
      arm: requiredNode(instance.model, "Arm_L"),
      tail: requiredNode(instance.model, "Tail"),
      leftEar: requiredNode(instance.model, "Ear_L"),
      rightEar: requiredNode(instance.model, "Ear_R"),
    }
  }, [instance])
  const time = useRef(0)
  const action = useRef({ state, key: actionKey, elapsed: 0, completed: false })

  useEffect(
    () => retainIslandResources(instance, () => useGLTF.clear(CAT_MODEL_URL)),
    [instance],
  )
  useEffect(
    () => () => {
      gl.domElement.style.cursor = ""
    },
    [gl],
  )
  useLayoutEffect(() => {
    action.current = { state, key: actionKey, elapsed: 0, completed: false }
  }, [state, actionKey])
  useLayoutEffect(() => {
    if (!reducedMotion) return
    rig.body.position.y = rig.bodyY
    rig.body.scale.setScalar(1)
    for (const node of [
      rig.head,
      rig.arm,
      rig.tail,
      rig.leftEar,
      rig.rightEar,
    ]) {
      node.rotation.set(0, 0, 0)
    }
    invalidate()
    if (state !== "Idle") onActionComplete()
  }, [invalidate, onActionComplete, reducedMotion, rig, state])

  useFrame((_, frameDelta) => {
    if (!playing || reducedMotion) return
    const delta = Math.min(frameDelta, 0.05)
    time.current += delta
    if (state !== "Idle") action.current.elapsed += delta
    const t = time.current
    const duration = state === "Greeting" ? 2.6 : 2.4
    const progress =
      state === "Responding"
        ? (action.current.elapsed % duration) / duration
        : Math.min(action.current.elapsed / duration, 1)
    const envelope = state === "Idle" ? 0 : Math.sin(progress * Math.PI)
    const breath = Math.sin((t * Math.PI * 2) / 4.8)

    // Legs are siblings of Body, keeping both soles fixed on the grass.
    rig.body.position.y = rig.bodyY + breath * 0.0035
    rig.body.scale.setScalar(1 + breath * 0.006)
    rig.tail.rotation.y = Math.sin((t * Math.PI * 2) / 5) * 0.13
    const greeting = state === "Greeting"
    const responding = state === "Responding"
    const wave = greeting
      ? -(1.95 + 0.16 * Math.sin(action.current.elapsed * 11)) * envelope
      : 0
    rig.arm.rotation.z = MathUtils.damp(rig.arm.rotation.z, wave, 13, delta)
    rig.head.rotation.z = MathUtils.damp(
      rig.head.rotation.z,
      greeting ? 0.13 * envelope : 0,
      12,
      delta,
    )
    rig.head.rotation.x = MathUtils.damp(
      rig.head.rotation.x,
      responding ? Math.sin(action.current.elapsed * 7) * envelope * 0.1 : 0,
      12,
      delta,
    )
    rig.leftEar.rotation.z = responding
      ? Math.sin(action.current.elapsed * 5) * envelope * 0.065
      : 0
    rig.rightEar.rotation.z = responding
      ? -Math.sin(action.current.elapsed * 5 + 0.3) * envelope * 0.055
      : 0
    if (state === "Greeting" && progress >= 1 && !action.current.completed) {
      action.current.completed = true
      onActionComplete()
    }
  })

  const onPointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    if (event.pointerType !== "touch") gl.domElement.style.cursor = "pointer"
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Three.js object; the information dialog includes an HTML companion entry.
    <group
      name="CompanionCat_Placement"
      position={position}
      rotation={[0, Math.atan2(12.5, 16), 0]}
      scale={1.5}
      userData={{ companionState: state }}
      onPointerOver={onPointerOver}
      onPointerOut={() => {
        gl.domElement.style.cursor = ""
      }}
      onClick={(event) => {
        event.stopPropagation()
        if (event.delta <= 5) onSelect()
      }}
    >
      <primitive object={instance.model} dispose={null} />
      <mesh
        name="CompanionCat_Contact_Shadow"
        position={[0, 0.003, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[0.6, 0.42, 1]}
        raycast={() => null}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={instance.shadowTexture}
          color="#655444"
          transparent
          opacity={0.17}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

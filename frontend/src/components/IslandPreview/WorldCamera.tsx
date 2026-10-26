import { OrbitControls, OrthographicCamera } from "@react-three/drei"
import { useThree } from "@react-three/fiber"
import { type ComponentRef, useEffect, useLayoutEffect, useRef } from "react"
import { type OrthographicCamera as Camera, MathUtils, Vector3 } from "three"

export type CameraGesture = {
  active: boolean
  moved: boolean
  blockedUntil: number
}
export type ZoomRequest = { id: number; direction: 1 | -1 }

export function WorldCamera({
  compact,
  corners,
  enabled,
  reducedMotion,
  resetKey,
  zoomRequest,
  gesture,
}: {
  compact: boolean
  corners: Vector3[]
  enabled: boolean
  reducedMotion: boolean
  resetKey: number
  zoomRequest: ZoomRequest
  gesture: CameraGesture
}) {
  const ref = useRef<Camera>(null)
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const start = useRef({ position: new Vector3(), zoom: 1 })
  const { size, invalidate, camera: activeCamera, gl } = useThree()
  useLayoutEffect(() => {
    const camera = ref.current
    const orbit = controls.current
    if (
      !camera ||
      camera !== activeCamera ||
      !orbit ||
      !size.width ||
      !size.height
    )
      return
    // Consume residual damping before framing, so reset does not drift again.
    const damping = orbit.enableDamping
    orbit.enableDamping = false
    orbit.update()
    orbit.enableDamping = damping
    const portrait = compact
    camera.position.set(
      portrait ? 19 : 12.5,
      portrait ? 16 : 12.5,
      portrait ? 9 : 18,
    )
    const target = new Vector3(0, 0.8, 0)
    camera.up.set(0, 1, 0)
    camera.lookAt(target)
    camera.zoom = 1
    camera.updateMatrixWorld(true)
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity
    for (const corner of corners) {
      const p = corner.clone().applyMatrix4(camera.matrixWorldInverse)
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
    const shift = new Vector3(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      0,
    ).applyQuaternion(camera.quaternion)
    camera.position.add(shift)
    target.add(shift)
    camera.updateMatrixWorld(true)
    const aspect = size.width / size.height
    const bottomInset = compact ? Math.min(64, size.height * 0.12) : 0
    const usableRatio = (size.height - bottomInset) / size.height
    const halfHeight =
      Math.max(
        ((maxY - minY) / 2 + 0.45) / usableRatio,
        ((maxX - minX) / 2 + 0.45) / aspect,
      ) * 1.035
    const toolbarOffset = new Vector3(
      0,
      (-halfHeight * bottomInset) / size.height,
      0,
    ).applyQuaternion(camera.quaternion)
    camera.position.add(toolbarOffset)
    target.add(toolbarOffset)
    camera.updateMatrixWorld(true)
    camera.left = -halfHeight * aspect
    camera.right = halfHeight * aspect
    camera.top = halfHeight
    camera.bottom = -halfHeight
    camera.updateProjectionMatrix()
    orbit.target.copy(target)
    const azimuth = Math.atan2(
      camera.position.x - target.x,
      camera.position.z - target.z,
    )
    orbit.minAzimuthAngle = azimuth - 0.95
    orbit.maxAzimuthAngle = azimuth + 0.95
    orbit.update()
    gesture.active = false
    gesture.moved = false
    gesture.blockedUntil = 0
    invalidate()
    // Reset is an explicit command; viewport changes also refit the world.
    void resetKey
  }, [
    activeCamera,
    compact,
    corners,
    gesture,
    invalidate,
    resetKey,
    size.height,
    size.width,
  ])

  useLayoutEffect(() => {
    const camera = ref.current
    if (!camera || camera !== activeCamera || zoomRequest.id === 0) return
    camera.zoom = MathUtils.clamp(
      camera.zoom * 1.16 ** zoomRequest.direction,
      0.75,
      1.75,
    )
    camera.updateProjectionMatrix()
    controls.current?.update()
    invalidate()
  }, [activeCamera, invalidate, zoomRequest])

  useEffect(() => {
    const canvas = gl.domElement
    const pointers = new Set<number>()
    const down = (event: PointerEvent) => {
      pointers.add(event.pointerId)
      if (pointers.size > 1) {
        gesture.moved = true
        gesture.blockedUntil = performance.now() + 250
      }
    }
    const up = (event: PointerEvent) => {
      if (pointers.size > 1 || gesture.moved)
        gesture.blockedUntil = performance.now() + 180
      pointers.delete(event.pointerId)
    }
    canvas.addEventListener("pointerdown", down, true)
    canvas.addEventListener("pointerup", up, true)
    canvas.addEventListener("pointercancel", up, true)
    return () => {
      canvas.removeEventListener("pointerdown", down, true)
      canvas.removeEventListener("pointerup", up, true)
      canvas.removeEventListener("pointercancel", up, true)
    }
  }, [gesture, gl])
  return (
    <>
      <OrthographicCamera
        ref={ref}
        name="Island_World_Camera"
        makeDefault
        manual
        near={0.1}
        far={150}
        zoom={1}
      />
      <OrbitControls
        ref={controls}
        makeDefault
        enabled={enabled}
        enablePan={false}
        enableDamping={!reducedMotion}
        dampingFactor={0.09}
        rotateSpeed={0.55}
        zoomSpeed={0.65}
        minZoom={0.75}
        maxZoom={1.75}
        minPolarAngle={Math.PI * 0.16}
        maxPolarAngle={Math.PI * 0.46}
        onStart={() => {
          if (!ref.current) return
          gl.domElement.style.cursor = "grabbing"
          gesture.active = true
          gesture.moved = false
          start.current.position.copy(ref.current.position)
          start.current.zoom = ref.current.zoom
        }}
        onChange={() => {
          const camera = ref.current
          if (
            gesture.active &&
            camera &&
            (camera.position.distanceToSquared(start.current.position) >
              0.004 ||
              Math.abs(camera.zoom - start.current.zoom) > 0.004)
          )
            gesture.moved = true
        }}
        onEnd={() => {
          gl.domElement.style.cursor = ""
          if (gesture.moved) gesture.blockedUntil = performance.now() + 180
          gesture.active = false
        }}
      />
    </>
  )
}

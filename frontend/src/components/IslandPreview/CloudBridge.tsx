import { useLayoutEffect, useMemo, useRef } from "react"
import { type InstancedMesh, Object3D, Vector3 } from "three"
import type { CloudConnection } from "./island-world"

/** Static instanced puffs; every platform shares the world's motion parent. */
export function CloudBridge({
  connections,
}: {
  connections: CloudConnection[]
}) {
  const ref = useRef<InstancedMesh>(null)
  const lobes = useMemo(() => {
    const result: { position: Vector3; scale: [number, number, number] }[] = []
    for (const cloud of connections.flatMap(
      (connection) => connection.clouds,
    )) {
      const p = new Vector3(...cloud)
      result.push({
        position: p.clone().add(new Vector3(0, -0.24, 0)),
        scale: [0.45, 0.22, 0.55],
      })
      for (const side of [-1, 1]) {
        result.push({
          position: p.clone().add(new Vector3(side * 0.23, -0.19, 0.02)),
          scale: [0.25, 0.25, 0.35],
        })
        result.push({
          position: p.clone().add(new Vector3(0.05, -0.24, side * 0.37)),
          scale: [0.29, 0.17, 0.26],
        })
      }
    }
    return result
  }, [connections])
  useLayoutEffect(() => {
    if (!ref.current) return
    const dummy = new Object3D()
    lobes.forEach(({ position, scale }, index) => {
      dummy.position.copy(position)
      dummy.scale.set(...scale)
      dummy.updateMatrix()
      ref.current?.setMatrixAt(index, dummy.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [lobes])
  return (
    <instancedMesh
      ref={ref}
      name="Cloud_Bridge"
      args={[undefined, undefined, lobes.length]}
      raycast={() => {}}
      userData={{ navigation: connections }}
    >
      <sphereGeometry args={[1, 12, 8]} />
      <meshStandardMaterial color="#e5edf3" roughness={1} metalness={0} />
    </instancedMesh>
  )
}

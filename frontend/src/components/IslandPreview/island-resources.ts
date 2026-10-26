import {
  BackSide,
  type BufferGeometry,
  CanvasTexture,
  type Color,
  type Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  Texture,
} from "three"

const leases = new WeakMap<
  object,
  { users: number; timer?: ReturnType<typeof setTimeout> }
>()

/** Defer final release so React StrictMode's effect replay can retain resources. */
function retain(key: object, dispose: () => void) {
  const lease = leases.get(key) ?? { users: 0 }
  if (lease.timer !== undefined) clearTimeout(lease.timer)
  lease.users += 1
  leases.set(key, lease)
  return () => {
    lease.users -= 1
    if (lease.users !== 0) return
    lease.timer = setTimeout(() => {
      if (lease.users !== 0) return
      dispose()
      leases.delete(key)
    }, 0)
  }
}

function createShadowTexture() {
  const canvas = document.createElement("canvas")
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Cannot create the island shadow.")
  const gradient = context.createRadialGradient(64, 64, 5, 64, 64, 64)
  gradient.addColorStop(0, "rgba(255,255,255,0.9)")
  gradient.addColorStop(0.45, "rgba(255,255,255,0.65)")
  gradient.addColorStop(0.78, "rgba(255,255,255,0.18)")
  gradient.addColorStop(1, "rgba(255,255,255,0)")
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
  return new CanvasTexture(canvas)
}

export function createIslandInstance(source: Group) {
  const model = source.clone(true)
  const materials = new Map<Material, Material>()
  const highlights: { material: MeshStandardMaterial; baseEmissive: Color }[] =
    []
  const cloneMaterial = (original: Material) => {
    let cloned = materials.get(original)
    if (!cloned) {
      cloned = original.clone()
      // Imported double-sided faces otherwise cast striped self-shadows.
      cloned.shadowSide = BackSide
      materials.set(original, cloned)
      if (cloned instanceof MeshStandardMaterial) {
        highlights.push({
          material: cloned,
          baseEmissive: cloned.emissive.clone(),
        })
      }
    }
    return cloned
  }
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return
    object.castShadow = true
    object.receiveShadow = true
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material)
  })
  return {
    source,
    model,
    materials,
    highlights,
    shadowTexture: createShadowTexture(),
  }
}

function disposeSource(source: Group) {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  source.traverse((object) => {
    if (!(object instanceof Mesh)) return
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      materials.add(material)
      for (const value of Object.values(material)) {
        if (value instanceof Texture) textures.add(value)
      }
    }
  })
  for (const geometry of geometries) geometry.dispose()
  for (const material of materials) material.dispose()
  for (const texture of textures) texture.dispose()
}

export function retainIslandResources(
  instance: ReturnType<typeof createIslandInstance>,
  clearLoaderCache: () => void,
) {
  const releaseSource = retain(instance.source, () => {
    disposeSource(instance.source)
    clearLoaderCache()
  })
  const releaseInstance = retain(instance, () => {
    for (const material of instance.materials.values()) material.dispose()
    instance.shadowTexture.dispose()
  })
  return () => {
    releaseInstance()
    releaseSource()
  }
}

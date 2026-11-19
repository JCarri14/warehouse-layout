import * as THREE from 'three'
import { LABEL_HEIGHT, LabelAtlas, labelWidthPx } from './labelAtlas'

export type LabelSpec = { text: string; active: boolean; priority: number; widthPx: number; opacity: number }
export type LabelMarker = THREE.Object3D & { userData: { label: LabelSpec; anchor: THREE.Vector3 } }

export function createLabelMarker(text: string, x: number, y: number, z: number, active: boolean, priority = 0): LabelMarker {
  const marker = new THREE.Object3D()
  marker.position.set(x, y, z)
  return Object.assign(marker, { userData: { label: { text, active, priority, widthPx: labelWidthPx(text), opacity: 1 }, anchor: marker.position.clone() } })
}

export function isLabelMarker(object: THREE.Object3D): object is LabelMarker {
  return object.userData.label !== undefined
}

const vertexShader = /* glsl */`
  uniform vec2 uViewport;
  attribute vec3 aAnchor;
  attribute vec2 aSize;
  attribute vec4 aUv;
  attribute float aActive;
  attribute float aOpacity;
  attribute float aVisible;
  varying vec2 vLabelUv;
  varying vec2 vLocal;
  varying vec2 vSize;
  varying float vActive;
  varying float vOpacity;

  void main() {
    vec4 clip = projectionMatrix * viewMatrix * vec4(aAnchor, 1.0);
    clip.xy += position.xy * aSize * 2.0 / uViewport * clip.w;
    gl_Position = aVisible > 0.5 ? clip : vec4(2.0, 2.0, 2.0, 1.0);
    vLabelUv = mix(aUv.xy, aUv.zw, position.xy + 0.5);
    vLocal = position.xy * aSize;
    vSize = aSize;
    vActive = aActive;
    vOpacity = aOpacity;
  }
`

const fragmentShader = /* glsl */`
  uniform sampler2D uAtlas;
  uniform vec3 uBackground;
  uniform vec3 uBorder;
  uniform vec3 uText;
  uniform vec3 uActiveBackground;
  varying vec2 vLabelUv;
  varying vec2 vLocal;
  varying vec2 vSize;
  varying float vActive;
  varying float vOpacity;

  void main() {
    // Same radius, inset and centred stroke as the original 96px canvas.
    const float radius = 14.0 * 18.0 / 96.0;
    const float inset = 3.0 * 18.0 / 96.0;
    const float halfStroke = inset * 0.5;
    vec2 q = abs(vLocal) - vSize * 0.5 + inset + radius;
    float distanceToEdge = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - radius;
    float aa = fwidth(distanceToEdge) * 0.5;
    float coverage = 1.0 - smoothstep(halfStroke - aa, halfStroke + aa, distanceToEdge);
    float fill = 1.0 - smoothstep(-halfStroke - aa, -halfStroke + aa, distanceToEdge);
    vec3 background = mix(uBackground, uActiveBackground, vActive);
    vec3 border = mix(uBorder, uActiveBackground, vActive);
    vec3 text = mix(uText, uBackground, vActive);
    vec3 color = mix(border, background, fill / max(coverage, 0.0001));
    color = mix(color, text, texture2D(uAtlas, vLabelUv).a);
    gl_FragColor = vec4(color, coverage * vOpacity);
    #include <colorspace_fragment>
  }
`

const sizes = { aAnchor: 3, aSize: 2, aUv: 4, aActive: 1, aOpacity: 1, aVisible: 1 } as const
type AttributeName = keyof typeof sizes

function createGeometry(capacity: number) {
  // The shader needs anchors, not instance matrices. Using an instanced
  // geometry keeps Three from allocating and uploading those matrices.
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.5, -.5, 0, .5, -.5, 0, -.5, .5, 0, .5, .5, 0,
  ], 3))
  geometry.setIndex([0, 1, 2, 2, 1, 3])
  for (const key of Object.keys(sizes) as AttributeName[]) {
    const size = sizes[key]
    const attribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size).setUsage(THREE.DynamicDrawUsage)
    attribute.onUpload(() => attribute.clearUpdateRanges())
    geometry.setAttribute(key, attribute)
  }
  geometry.instanceCount = 0
  return geometry
}

// The previous sprites sampled a NoColorSpace canvas as linear RGB.
// Keep that display appearance when moving the palette into uniforms.
const canvasColor = (hex: number) => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace)

export class LabelLayer {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>
  private readonly atlas: LabelAtlas
  private capacity = 32

  constructor(atlas: LabelAtlas) {
    this.atlas = atlas
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uAtlas: { value: atlas.texture },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uBackground: { value: canvasColor(0xfbfcf9) },
        uBorder: { value: canvasColor(0xbccbc3) },
        uText: { value: canvasColor(0x273e37) },
        uActiveBackground: { value: canvasColor(0x194d48) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    this.mesh = new THREE.Mesh(createGeometry(this.capacity), material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 10
    this.mesh.visible = false
    this.mesh.raycast = () => {}
  }

  sync(markers: readonly LabelMarker[], reservedTexts: readonly string[] = []): void {
    this.atlas.prepare([...markers.map(marker => marker.userData.label.text), ...reservedTexts])
    if (markers.length > this.capacity) {
      // Reserve room for columns when changing the selected rack.
      this.capacity = 2 ** Math.ceil(Math.log2(markers.length + 12))
      this.mesh.geometry.dispose()
      this.mesh.geometry = createGeometry(this.capacity)
    }
    const count = this.mesh.geometry.instanceCount
    for (const [index, marker] of markers.entries()) {
      const { label, anchor } = marker.userData
      const { u0, v0, u1, v1 } = this.atlas.entry(label.text)
      this.write('aAnchor', index, anchor.x, anchor.y, anchor.z)
      this.write('aSize', index, label.widthPx, LABEL_HEIGHT)
      this.write('aUv', index, u0, v0, u1, v1)
      this.write('aActive', index, Number(label.active))
      this.setOpacity(index, label.opacity)
      if (index >= count) this.setVisible(index, true)
    }
    this.mesh.geometry.instanceCount = markers.length
    this.mesh.visible = markers.length > 0
  }

  setVisible(index: number, visible: boolean): void {
    this.writeScalar('aVisible', index, Number(visible))
  }

  setOpacity(index: number, opacity: number): void {
    this.writeScalar('aOpacity', index, opacity)
  }

  setViewport(widthPx: number, heightPx: number): void {
    this.mesh.material.uniforms.uViewport.value.set(Math.max(1, widthPx), Math.max(1, heightPx))
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }

  private write(name: AttributeName, index: number, ...values: number[]): void {
    const attribute = this.mesh.geometry.getAttribute(name) as THREE.InstancedBufferAttribute
    const start = index * attribute.itemSize
    if (values.every((value, offset) => attribute.array[start + offset] === Math.fround(value))) return
    attribute.array.set(values, start)
    attribute.addUpdateRange(start, values.length)
    attribute.needsUpdate = true
  }

  private writeScalar(name: 'aOpacity' | 'aVisible', index: number, value: number): void {
    const attribute = this.mesh.geometry.getAttribute(name) as THREE.InstancedBufferAttribute
    if (attribute.array[index] === Math.fround(value)) return
    attribute.array[index] = value
    attribute.addUpdateRange(index, 1)
    attribute.needsUpdate = true
  }
}

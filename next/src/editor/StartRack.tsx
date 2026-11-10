import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/** A short entrance, then a still model. No render loop while the user works. */
export function StartRack() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current!
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ canvas: element, alpha: true, antialias: true }) }
    catch { return }
    renderer.setSize(280, 220, false); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    const scene = new THREE.Scene(), model = new THREE.Group()
    const camera = new THREE.OrthographicCamera(-2.8, 2.8, 2.2, -2.2, .1, 30)
    camera.position.set(5, 3.5, 6); camera.lookAt(0, 1.2, 0)
    scene.add(new THREE.HemisphereLight(0xe8f2ed, 0x46665b, 2.5))
    const light = new THREE.DirectionalLight(0xf5f0df, 3); light.position.set(3, 6, 5); scene.add(light)
    const metal = new THREE.MeshStandardMaterial({ color: 0x427c72, roughness: .7 })
    const shelf = new THREE.MeshStandardMaterial({ color: 0xb0c7bd, roughness: .85 })
    const carton = new THREE.MeshStandardMaterial({ color: 0xc9af7b, roughness: 1 })
    const geometries: THREE.BoxGeometry[] = []
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
      const geometry = new THREE.BoxGeometry(w, h, d); geometries.push(geometry)
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); model.add(mesh)
    }
    for (const x of [-1.15, 1.15]) for (const z of [-.45, .45]) box(.07, 2.5, .07, x, 1.25, z, metal)
    for (const y of [.25, 1.2, 2.15]) {
      box(2.3, .06, .95, 0, y, 0, shelf)
      for (const z of [-.45, .45]) box(2.3, .12, .05, 0, y - .07, z, metal)
    }
    box(.65, .48, .63, -.57, .52, .03, carton)
    box(.72, .42, .65, .54, 1.44, 0, carton)
    box(.62, .35, .63, -.5, 2.36, 0, carton)
    scene.add(model)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0, started = 0
    const render = (time: number) => {
      if (!started) started = time
      const progress = reduced.matches ? 1 : Math.min((time - started) / 850, 1)
      model.rotation.y = -.35 * Math.pow(1 - progress, 4)
      renderer.render(scene, camera)
      if (progress < 1) frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)
    const settle = () => { if (reduced.matches) { cancelAnimationFrame(frame); model.rotation.y = 0; renderer.render(scene, camera) } }
    reduced.addEventListener('change', settle)
    return () => { cancelAnimationFrame(frame); reduced.removeEventListener('change', settle); geometries.forEach(geometry => geometry.dispose()); metal.dispose(); shelf.dispose(); carton.dispose(); renderer.dispose() }
  }, [])
  return <canvas className="start-rack" ref={canvas} width={280} height={220} aria-hidden="true"/>
}

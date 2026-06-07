// Post-processing: bloom on the bright highlights, a final grade pass
// (vignette + warm lift + gentle saturation/contrast), then SMAA.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 1.05 },
    uSaturation: { value: 1.12 },
    uContrast: { value: 1.04 },
    uWarm: { value: 0.04 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uVignette, uSaturation, uContrast, uWarm;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // saturation
      float l = dot(c.rgb, vec3(0.2126,0.7152,0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSaturation);
      // contrast around mid grey
      c.rgb = (c.rgb - 0.5) * uContrast + 0.5;
      // warm lift in shadows
      c.rgb += uWarm * vec3(1.0,0.6,0.2) * (1.0 - l);
      // vignette
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.35, length(d) * uVignette);
      c.rgb *= mix(0.72, 1.0, v);
      gl_FragColor = c;
    }
  `,
};

export function createComposer(renderer, scene, camera, settings = {}) {
  const { bloom = true, smaa = true } = settings;
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());

  composer.addPass(new RenderPass(scene, camera));

  const size = renderer.getSize(new THREE.Vector2());
  let bloomPass = null;
  if (bloom) {
    bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.32, 0.7, 1.15);
    composer.addPass(bloomPass);
  }

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  if (smaa) composer.addPass(new SMAAPass(size.x, size.y));
  composer.addPass(new OutputPass());

  return { composer, bloom: bloomPass, grade };
}

// Post-processing: bloom on bright lights/emissives, SMAA for AA,
// and final output pass.  Keeps Three's tone mapping in the renderer.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";

export function createComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const size = renderer.getSize(new THREE.Vector2());
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    0.35, // strength
    0.6, // radius
    1.05 // threshold — only HDR-bright pixels (lamps, sun) bloom
  );
  composer.addPass(bloom);

  const smaa = new SMAAPass(size.x, size.y);
  composer.addPass(smaa);

  const output = new OutputPass();
  composer.addPass(output);

  return { composer, bloom };
}

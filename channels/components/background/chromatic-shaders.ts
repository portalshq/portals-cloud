export const backgroundVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const backgroundFragmentShader = `
precision highp float;

varying vec2 vUv;
uniform float uTime;
uniform float uAspect;
uniform vec3 uEye;
uniform mat4 uInverseViewProjection;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise21(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = noise21(p) * 0.55;
  value += noise21(p * 2.03 + 17.1) * 0.28;
  value += noise21(p * 4.01 - 9.4) * 0.17;
  return value;
}

// Integrate a soft, world-space light volume along the camera ray.
float volume(vec3 ray, vec3 center, vec3 radius) {
  vec3 origin = (uEye - center) / radius;
  vec3 direction = ray / radius;
  float distance = max(0.0, -dot(origin, direction) / dot(direction, direction));
  vec3 closest = origin + direction * distance;
  return exp(-dot(closest, closest));
}

void main() {
  vec2 p = vUv - 0.5;
  vec4 world = uInverseViewProjection * vec4(p * 2.0, 0.0, 1.0);
  vec3 ray = normalize(world.xyz / world.w - uEye);
  float time = uTime * 0.21;
  float cloud = fbm(p * vec2(4.0 * uAspect, 5.0) + vec2(time * 0.19, -time * 0.12));
  float ember = volume(ray, vec3(0.5, -0.55, -9.0), vec3(5.9, 4.35, 15.0));
  float coral = volume(ray, vec3(0.55 * sin(time), 0.65 * cos(time * 0.84), -9.0),
    vec3(3.5, 2.8, 10.6));
  float peach = volume(ray, vec3(0.65 * cos(time * 0.79), 0.9 + sin(time) * 0.52, -9.0),
    vec3(2.4, 1.65, 5.6));
  float air = volume(ray, vec3(0.0, 0.0, -16.0), vec3(15.0, 10.5, 29.0));

  vec3 color = vec3(0.002, 0.003, 0.007);
  color += vec3(0.022, 0.052, 0.069) * air * (0.26 + cloud * 0.53);
  color += vec3(0.105, 0.006, 0.019) * ember * (0.42 + cloud * 0.45);
  color += vec3(0.29, 0.044, 0.036) * coral * (0.5 + cloud * 0.40);
  color += vec3(0.31, 0.103, 0.055) * peach * (0.72 + sin(time) * 0.14);

  float vignette = 1.0 - 0.42 * smoothstep(0.27, 0.74, length(p));
  float grain = hash21(gl_FragCoord.xy) - 0.5;
  gl_FragColor = vec4(max(color * vignette + grain * 0.0024, 0.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export const rayVertexShader = `
attribute vec3 aRay;
uniform float uTime;
varying vec2 vUv;
varying vec4 vLight;
varying vec3 vProfile;

void main() {
  float angle = aRay.x;
  float seed = aRay.y;
  float sweep = step(0.5, aRay.z);
  float leak = step(1.5, aRay.z);
  float phase = fract(seed + uTime * mix(0.11 + seed * 0.09, 0.065 + seed * 0.055, leak));
  float lengthZ = mix(9.0 + seed * 10.0, 13.0 + seed * 13.0, leak);
  float sweepZ = mix(-44.0, 26.0, phase) + (uv.x - 0.5) * lengthZ;
  float z = clamp(mix(mix(-35.0, 17.0, uv.x), sweepZ, sweep), -35.0, 17.0);
  float s = (z + 9.0) / 6.4;

  // A fixed azimuth traces a curved meridian of the Z-aligned hyperboloid.
  float radius = sqrt(1.0 + s * s);
  vec2 radial = vec2(cos(angle), sin(angle)) * vec2(5.4, 3.75);
  float shell = 1.0 + leak * (0.025 + seed * 0.12);
  float rotation = uTime * 0.006;
  float c = cos(rotation);
  float sn = sin(rotation);
  mat2 roll = mat2(c, sn, -sn, c);
  vec2 section = roll * (radial * shell);
  vec3 center = vec3(section * radius, z);
  vec3 tangent = vec3(section * (s / (6.4 * radius)), 1.0);
  vec3 side = cross(tangent, cameraPosition - center);
  side *= inversesqrt(max(dot(side, side), 0.0001));

  float width = mix(0.48 + seed * 0.64, 1.05 + seed * 1.25, sweep);
  width = mix(width, 2.2 + seed * 1.8, leak);
  float ends = smoothstep(-35.0, -23.0, z) * (1.0 - smoothstep(5.0, 17.0, z));
  float cycle = smoothstep(0.0, 0.12, phase) * (1.0 - smoothstep(0.88, 1.0, phase));
  float waist = exp(-0.42 * s * s);
  vec2 direction = normalize(section);
  float warm = smoothstep(-0.48, 0.92, dot(direction, vec2(0.57, -0.82)));
  float exposure = mix(0.42, 1.0, smoothstep(-0.22, 0.94, dot(direction, vec2(0.80, 0.60))));

  vUv = uv;
  vLight = vec4(z, warm, exposure * ends * mix(1.0, cycle, sweep), waist);
  vProfile = vec3(seed, sweep, leak);
  gl_Position = projectionMatrix * viewMatrix * vec4(center + side * position.y * width, 1.0);
}
`

export const rayFragmentShader = `
precision highp float;
uniform float uTime;
varying vec2 vUv;
varying vec4 vLight;
varying vec3 vProfile;

void main() {
  float seed = vProfile.x;
  float sweep = vProfile.y;
  float leak = vProfile.z;
  float across = vUv.y * 2.0 - 1.0;
  float edge = 1.0 - smoothstep(0.60, 1.0, abs(across));
  float veil = exp(-across * across * mix(5.3, 2.9, leak));
  float filament = exp(-across * across * 160.0) * (1.0 - leak);
  float envelope = smoothstep(0.0, 0.36, vUv.x) * (1.0 - smoothstep(0.53, 1.0, vUv.x));

  float wave = fract(vLight.x * 0.068 - uTime * (0.25 + seed * 0.21) + seed);
  float pulse = smoothstep(0.18, 0.75, wave) * (1.0 - smoothstep(0.78, 1.0, wave));
  float split = smoothstep(-0.40, 0.46, across + (vUv.x - 0.5) * 1.16);
  float warmth = mix(vLight.y, split, sweep * (0.50 + leak * 0.34));
  vec3 blue = vec3(0.16, 0.48, 1.03);
  vec3 coral = mix(vec3(1.28, 0.18, 0.11), vec3(1.15, 0.43, 0.29), seed);
  vec3 light = mix(blue, coral, warmth);
  light = mix(light, vec3(1.25, 1.36, 1.48), filament * (0.74 + 0.24 * pulse));

  float continuous = (veil * 0.056 + filament * 0.050) * (0.47 + 0.53 * pulse);
  float traveling = (veil * mix(0.30, 0.25, leak) + filament * 0.42) * envelope;
  float density = mix(continuous, traveling, sweep) * vLight.z * (0.59 + 0.41 * vLight.w);

  gl_FragColor = vec4(light, density * edge * mix(0.68, 0.99, seed));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

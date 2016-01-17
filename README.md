# geo-ambient-occlusion

Generates a per-vertex ambient occlusion array for arbitrary meshes.

> Note: requires renderable `gl.FLOAT` textures.

<img src="https://raw.githubusercontent.com/wwwtyro/geo-ambient-occlusion/master/images/screenshot.png" width="100%">

[Demo](http://wwwtyro.github.io/geo-ambient-occlusion/)

## How does it work?

`geo-ambient-occlusion` renders multiple shadow maps for your mesh from random viewpoints. It averages the occlusion
for each vertex across all the shadow maps to calculate an ambient occlusion value for each. This array of occlusion
values (a one-dimensional array of floats that represents the shading, not occlusion) is returned to you for immediate
use as an attribute in your WebGL shader program.

## Install

```sh
npm install geo-ambient-occlusion
```

## Example

### Javascript
```js
var mesh = require('stanford-dragon/3')
var GeoAO = require('geo-ambient-occlusion')

var geometry = Geometry(gl)
geometry.attr('aPosition', mesh.positions)
geometry.faces(mesh.cells)

var aoSampler = new GeoAO(mesh.positions, {
  resolution: 256,
  bias: 0.01,
  cells: mesh.cells
})

ao = aoSampler.sample(256)
geometry.attr('aOcclusion', ao, {size: 1})

geometry.bind(program)
geometry.draw(gl.TRIANGLES)
```

### Vertex Shader
```glsl
attribute vec3 aPosition;
attribute float aOcclusion;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;

varying float vOcclusion;

void main() {
    gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
    vOcclusion = aOcclusion;
}
```

### Fragment Shader
```glsl
varying float vOcclusion;

void main() {
    gl_FragColor = vec4(vOcclusion,vOcclusion,vOcclusion, 1);
}
```

## API

```js
var GeoAO = require('geo-ambient-occlusion')
```

### Constructor

#### `var aoSampler = new GeoAO(positions[, opts])`

`positions` is the vertex array for your mesh. It can be any of:

* Flat array `[1,2,3,4,5,6]`
* Array of arrays `[[1,2,3], [4,5,6]]`
* Array of TypedArrays `[new Float32Array([1,2,3]), new Float32Array([4,5,6])]`
* TypedArray `new Float32Array([1,2,3,4,5,6])`
* [ndarray](https://www.npmjs.com/package/ndarray) `ndarray(new Float32Array([1,2,3,4,5,6]))`

`opts` is an object that can have the following properties:
* `resolution` (int) is the resolution to build the depth buffer at. Defaults to `256`.
* `bias` (float) is the bias applied to the shadow map while building the ambient occlusion data. Defaults to `0.01`.
* `cells` is the index data for your mesh, if you're using a [simplicial complex](https://github.com/mikolalysenko/simplicial-complex). Defaults to `null`.

### Methods

#### `var ao = aoSampler.sample(nSamples)`

Performs `nSamples` (int) iterations of ambient occlusion sampling on the mesh positions provided in the constructor.
Returns a flat Float32Array of shading values (1.0 - occlusion) that you can immediately consume as an attribute in your shader
program.

Since a fully converged AO calculation can take on the order of seconds or more even on modern GPUs, `geo-ambient-occlusion`
allows you to split up the work between multiple calls to this function so that you can provide progress feedback to
your user. If you don't need to do this, you can simply set `nSamples` to the total number of samples you want to take.

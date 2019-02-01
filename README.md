# geo-ambient-occlusion

Generates a per-vertex ambient occlusion array for arbitrary meshes.

<p align="center">
  <img src="https://github.com/wwwtyro/media/raw/master/geo-ambient-occlusion-000.png" width="25%">
</p>

[Demo](https://wwwtyro.github.io/geo-ambient-occlusion/)

### Support notes

* Requires the `OES_texture_float` extension.
* [Currently unsupported by Safari](https://bugs.webkit.org/show_bug.cgi?id=171432).

## How does it work?

`geo-ambient-occlusion` renders multiple shadow maps for your mesh from random viewpoints. It averages the occlusion
for each vertex across all the shadow maps to calculate an ambient occlusion value for each. This data is converted
into a `Float32Array` of occlusion values and returned to you for immediate use as an attribute in your shader program.

`geo-ambient-occlusion` is built on top of the disgustingly good [regl](https://github.com/regl-project/regl) WebGL
library.

## Install

```sh
npm install geo-ambient-occlusion
```

## Example

```js
let dragon = require('stanford-dragon/2');
const geoao = require('geo-ambient-occlusion');

const aoSampler = geoao(dragon.positions, { cells: dragon.cells });

for (let i = 0; i < 256; i++) {
  aoSampler.sample();
}

const ao = aoSampler.report();

aoSampler.dispose();
```

## API

#### `const geoao = require('geo-ambient-occlusion')`

### Constructor

#### `const aoSampler = geoao(positions[, opts])`

`positions` is the vertex array for your mesh. It can be any of:

* Flat array `[1,2,3,4,5,6]`
* Array of arrays `[[1,2,3], [4,5,6]]`
* Array of TypedArrays `[new Float32Array([1,2,3]), new Float32Array([4,5,6])]`
* TypedArray `new Float32Array([1,2,3,4,5,6])`
* [ndarray](https://www.npmjs.com/package/ndarray) `ndarray(new Float32Array([1,2,3,4,5,6]))`

`opts` is an object that can have the following properties:
* `resolution` (int) is the resolution to build the depth buffer at. Defaults to `512`.
* `bias` (float) is the bias applied to the shadow map while building the ambient occlusion data. Defaults to `0.01`.
* `cells` is the index data for your mesh, if you're using a [simplicial complex](https://github.com/mikolalysenko/simplicial-complex). Defaults to `undefined`.
* `normals` are per-vertex normals, either in an array or array of arrays. If not supplied, they will be computed using the [normals](https://www.npmjs.com/package/normals) npm module.
* `regl` is an optional [regl](https://github.com/regl-project/regl) context you can provide to reduced the overhead of
multiple WebGL contexts. This context will need to have the `OES_texture_float` extension enabled, and depending on the
size of your mesh, also the `OES_element_index_uint` extension.

### Methods

#### `aoSampler.sample()`

Collects a single sample of ambient occlusion data. Run this several hundred times to reach a useful average.

#### `const ao = aoSampler.report()`

Returns the average ambient occlusion, per vertex, sampled so far. Format is a `Float32Array`.

#### `aoSampler.dispose()`

Disposes of all resources used for this sampling. Does not dispose of the internal `regl` context if it was provided by
the user. Behavior of `aoSampler` after calling this function is undefined.

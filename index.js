'use strict';


const REGL = require('regl');
const mat4 = require('gl-matrix').mat4;
const center = require('geo-center');
const boundingBox = require('vertices-bounding-box');
const transform = require('geo-3d-transform-mat4');
const converter = require('geo-convert-position-format');
const vertexNormals = require('normals').vertexNormals;
const reindex = require('mesh-reindex');
const defaults = require('defaults');


module.exports = function(positions, opts) {

  opts = defaults(opts, {
    cells: undefined,
    regl: false,
    bias: 0.01,
    resolution: 512
  });

  // Center the mesh on the origin (and make a copy in the process).
  positions = center(positions);

  // Scale the mesh to a 1x1x1 cube.
  const bb = boundingBox(positions);
  const scale = [
    1 / (bb[1][0] - bb[0][0]),
    1 / (bb[1][1] - bb[0][1]),
    1 / (bb[1][2] - bb[0][2]),
  ];
  const scaleMat4 = mat4.scale([], mat4.create(), scale);
  positions = transform(positions, scaleMat4);

  // Create an array with the vertex data.
  const vertexData = converter.convert(positions, converter.TYPED_ARRAY);

  // Create normals.
  let mesh = {
    cells: opts.cells,
    positions: positions,
  };
  if (mesh.cells === undefined) {
    mesh = reindex(vertexData);
  }
  const normals = vertexNormals(mesh.cells, mesh.positions, 0);
  const normalData = converter.convert(normals, converter.TYPED_ARRAY);

  // Make sure the position array is divisible by three.
  if (vertexData.length % 3 !== 0) {
    throw new Error('geo-ambient-occlusion: Position array not divisible by three.');
  }

  // Copy it into the smallest POT-length array we can.
  const vertexCount = vertexData.length/3;
  let vertexTextureRes = 1;
  while (vertexTextureRes * vertexTextureRes < vertexCount) {
    vertexTextureRes *= 2;
  }
  const vertexDataArray = new Float32Array(vertexTextureRes * vertexTextureRes * 3);
  vertexDataArray.set(vertexData);

  // Copy the normal data into a same-size array.
  const normalDataArray = new Float32Array(vertexTextureRes * vertexTextureRes * 3);
  normalDataArray.set(normalData);

  // Figure out what extensions we need.
  const extensions = ['OES_texture_float'];
  if (vertexCount > 65535 && opts.cells !== undefined) {
    extensions.push('OES_element_index_uint');
  }

  // If we are given a regl context, make sure it has the extensions we need.
  if (opts.regl) {
    for (let ext of extensions) {
      if (!opts.regl.hasExtension(ext)) {
        throw new Error('geo-ambient-occlusion: Provided regl context needs the ' + ext + ' extension for this mesh.');
      }
    }
  }

  // If we don't have a regl context, create one.
  let regl, ownregl;
  if (opts.regl) {
    regl = opts.regl;
    ownregl = false;
  } else {
    regl = REGL({
      canvas: document.createElement('canvas'),
      extensions: extensions,
    });
    ownregl = true;
  }

  // Define a framebuffer for our position data.
  const fboPosition = fbo(opts.resolution);

  // Define the command that gathers the position data.
  const cmdPositionObj = {
    vert: `
      precision highp float;
      attribute vec3 position;
      uniform mat4 model, projection;
      varying vec3 vPos;
      void main() {
        gl_Position = projection * model * vec4(position, 1);
        vPos = vec3(model * vec4(position, 1));
      }
    `,
    frag: `
      precision highp float;
      varying vec3 vPos;
      void main() {
        gl_FragColor = vec4(vPos, 1);
      }
    `,
    attributes: {
      position: positions,
    },
    uniforms: {
      model: regl.prop('model'),
      projection: regl.prop('projection'),
    },
    viewport: {x: 0, y: 0, width: opts.resolution, height: opts.resolution},
    framebuffer: fboPosition,
  };
  if (opts.cells) {
    cmdPositionObj.elements = opts.cells;
  } else {
    cmdPositionObj.count = vertexCount;
  }
  const cmdPosition = regl(cmdPositionObj);

  // Define a pair of buffers we'll ping-pong to accumulate occlusion data.
  const fboOcclusion = [fbo(vertexTextureRes), fbo(vertexTextureRes)];

  // Create a texture that stores our vertex locations.
  const tVertex = regl.texture({
    width: vertexTextureRes,
    height: vertexTextureRes,
    data: vertexDataArray,
    format: 'rgb',
    type: 'float'
  });

  // Create a texture that stores our normal directions.
  const tNormal = regl.texture({
    width: vertexTextureRes,
    height: vertexTextureRes,
    data: normalDataArray,
    format: 'rgb',
    type: 'float',
  });

  // Define the command for occlusion accumulation.
  const cmdOcclusion = regl({
    vert: `
      precision highp float;
      attribute vec2 position;
      void main() {
          gl_Position = vec4(position, 0, 1);
      }
    `,
    frag: `
      precision highp float;

      uniform sampler2D tPosition, tSource, tVertex, tNormal;
      uniform float count, bias;
      uniform vec2 resolution;
      uniform mat4 model;

      const float INVSQRT3 = 0.5773502691896258; // 1/sqrt(3)

      void main() {
          vec2 texel = gl_FragCoord.xy/resolution;
          vec3 vert = texture2D(tVertex, texel).rgb;
          vert = vec3(model * vec4(vert, 1));
          vec3 norm = texture2D(tNormal, texel).rgb;
          norm = vec3(model * vec4(norm, 1));
          float z = texture2D(tPosition, INVSQRT3 * vert.xy + 0.5).z;
          float o = 0.0;
          if ((vert.z - z) < -bias) {
              o = 1.0;
          }
          vec4 src = texture2D(tSource, texel);
          if (dot(norm, vec3(0,0,1)) > 0.0) {
            gl_FragColor = src + vec4(o, 1, 0, 0);
          } else {
            gl_FragColor = src;
          }
      }
    `,
    attributes: {
      position: [-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1],
    },
    uniforms: {
      tPosition: fboPosition,
      tSource: regl.prop('source'),
      tVertex: tVertex,
      tNormal: tNormal,
      count: regl.prop('count'),
      bias: regl.prop('bias'),
      resolution: [vertexTextureRes, vertexTextureRes],
      model: regl.prop('model'),
    },
    viewport: {x: 0, y: 0, width: vertexTextureRes, height: vertexTextureRes},
    framebuffer: regl.prop('destination'),
    count: 6,
  });

  // Keep track of our ping-ponging.
  let occlusionIndex = 0;

  // Keep track of how many samples we've collected.
  let occlusionCount = 0;

  // set up our projection matrix.
  const d = Math.sqrt(3)/2;
  const projection = mat4.ortho([], -d, d, -d, d, -d, d);

  // Take a single occlusion sample.
  function sample() {
    occlusionIndex = 1 - occlusionIndex;
    const source = fboOcclusion[occlusionIndex];
    const destination = fboOcclusion[1 - occlusionIndex];
    occlusionCount++;
    const model = mat4.create();
    mat4.rotateX(model, model, Math.random() * 100);
    mat4.rotateY(model, model, Math.random() * 100);
    mat4.rotateZ(model, model, Math.random() * 100);
    regl.clear({
      color: [0,0,0,1],
      depth: 1,
      framebuffer: fboPosition,
    });
    cmdPosition({
      model: model,
      projection: projection,
    });
    regl.clear({
      color: [0,0,0,1],
      depth: 1,
      framebuffer: destination,
    });
    cmdOcclusion({
      source: source,
      destination: destination,
      count: occlusionCount,
      bias: opts.bias,
      model: model,
    });
  }


  // Return the per-vertex ambient occlusion in a Float32Array of length vertexCount.
  function report() {
    // Gather the resulting pixels.
    let pixels;
    fboOcclusion[1 - occlusionIndex].use(() => {
      pixels = regl.read();
    });

    // Format them and return the final product.
    const result = new Float32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      const index = i * 4;
      const total = pixels[index + 1];
      result[i] = total === 0.0 ? 0.0 : pixels[index + 0]/total;
    }

    return result;
  }


  // Dispose of all resources. Do not dispose of regl if we did not create it. Behavior after calling dispose is
  // undefined.
  function dispose() {
    tVertex.destroy();
    fboPosition.destroy();
    fboOcclusion[0].destroy();
    fboOcclusion[1].destroy();
    if (ownregl) {
      regl.destroy();
    }
  }


  // Utility function for creating a common fbo.
  function fbo(resolution) {
    return regl.framebuffer({
      width: resolution,
      height: resolution,
      colorFormat: 'rgba',
      colorType: 'float',
    });
  }

  return {
    sample: sample,
    report: report,
    dispose: dispose
  };
};

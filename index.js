'use strict'

var Geometry = require('gl-geometry')
var geoconv = require('geo-convert-position-format')
var defaults = require('lodash.defaultsdeep')
var createTexture = require('gl-texture2d')
var getExtension = require('gl-extension')
var glShader = require('gl-shader')
var glslify = require('glslify')
var boundingBox = require('vertices-bounding-box')
var mat4 = require('gl-mat4')
var tform = require('geo-3d-transform-mat4')
var createFBO = require('gl-fbo')

module.exports = function AO (positions, opts) {
  // Initialize the context.
  var canvas = document.createElement('canvas')
  var gl = canvas.getContext('webgl')
  getExtension(gl, 'OES_texture_float')

  // Set some defaults.
  opts = opts || {}
  opts = defaults(opts, {
    resolution: 256,
    cells: null,
    bias: 0.01
  })

  // Calculate the bounding box.
  var bb = boundingBox(positions)

  // Translate the geometry center to the origin.
  var _translate = [
    -0.5 * (bb[0][0] + bb[1][0]),
    -0.5 * (bb[0][1] + bb[1][1]),
    -0.5 * (bb[0][2] + bb[1][2])
  ]
  var translate = mat4.create()
  mat4.translate(translate, translate, _translate)
  var centered = tform(positions, translate)

  // Scale the geometry to a 1x1x1 cube.
  var bound = Math.sqrt(3) / 2
  var _scale = [
    bound / (bb[1][0] - bb[0][0]),
    bound / (bb[1][1] - bb[0][1]),
    bound / (bb[1][2] - bb[0][2])
  ]
  var scale = mat4.create()
  mat4.scale(scale, scale, _scale)
  positions = tform(centered, scale)

  // Get a typed array of the vertex positions.
  var vDataPos = geoconv.convert(positions, geoconv.TYPED_ARRAY)

  // Make sure the position array is divisible by three.
  if (vDataPos.length % 3 !== 0) {
    throw new Error('geo-ambient-occlusion: Position array not divisible by three.')
  }

  // Determine the minimum POT texture size for the vertex data texture.
  var texelCount = vDataPos.length / 3
  var vTexRes = 1
  while (vTexRes * vTexRes < texelCount) {
    vTexRes *= 2
  }

  // Create and fill in the vertex data texture.
  var temp = new Float32Array(vTexRes * vTexRes * 3)
  temp.set(vDataPos)
  var vTex = createTexture(gl, [vTexRes, vTexRes], gl.RGB, gl.FLOAT)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, vTexRes, vTexRes, 0, gl.RGB, gl.FLOAT, temp)

  // Create the programs.
  var pPos = glShader(gl, glslify('./pos.vert'), glslify('./pos.frag'))
  var pOcclusion = glShader(gl, glslify('./occlusion.vert'), glslify('./occlusion.frag'))

  // Set up the context.
  gl.enable(gl.DEPTH_TEST)
  gl.enable(gl.CULL_FACE)
  gl.cullFace(gl.BACK)

  // Create the geometries.
  var geometry = Geometry(gl)
  geometry.attr('aPosition', positions)
  if (opts.cells !== null) {
    geometry.faces(opts.cells)
  }
  var quad = Geometry(gl)
  quad.attr('aPosition', [
    -1, -1, -1,
    +1, -1, -1,
    +1, +1, -1,
    -1, -1, -1,
    +1, +1, -1,
    -1, +1, -1
  ])

  // Create the FBOs.
  var fboPos = createFBO(gl, [opts.resolution, opts.resolution], {float: true})
  var fboOcclusion = [
    createFBO(gl, [vTexRes, vTexRes], {float: true}),
    createFBO(gl, [vTexRes, vTexRes], {float: true})
  ]

  var occlusionIndex = 0

  var sampleCount = 0

  this.sample = function (nSamples) {
    for (var i = 0; i < nSamples; i++) {
      sampleCount++
      // Render the depth buffer.
      gl.viewport(0, 0, opts.resolution, opts.resolution)
      var projection = mat4.create()
      mat4.ortho(projection, -0.5, 0.5, -0.5, 0.5, -0.5, 0.5)
      var model = mat4.create()
      mat4.rotateX(model, model, Math.random() * 100)
      mat4.rotateY(model, model, Math.random() * 100)
      fboPos.bind()
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      pPos.bind()
      geometry.bind(pPos)
      pPos.uniforms.uModel = model
      pPos.uniforms.uProjection = projection
      geometry.draw(gl.TRIANGLES)

      // Render the occlusion, ping-ponging the fbo.
      occlusionIndex = 1 - occlusionIndex
      var fboSource = fboOcclusion[1 - occlusionIndex]
      var fboDest = fboOcclusion[occlusionIndex]
      gl.viewport(0, 0, vTexRes, vTexRes)
      fboDest.bind()
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      pOcclusion.bind()
      quad.bind(pOcclusion)
      pOcclusion.uniforms.uModel = model
      pOcclusion.uniforms.uPos = fboPos.color[0].bind(0)
      pOcclusion.uniforms.uSource = fboSource.color[0].bind(1)
      pOcclusion.uniforms.uVertex = vTex.bind(2)
      pOcclusion.uniforms.uCount = sampleCount
      pOcclusion.uniforms.uBias = opts.bias
      pOcclusion.uniforms.uRes = [vTexRes, vTexRes]
      quad.draw(gl.TRIANGLES)
    }
    var buffer = new Float32Array(vTexRes * vTexRes * 4)
    gl.readPixels(0, 0, vTexRes, vTexRes, gl.RGBA, gl.FLOAT, buffer)
    var result = new Float32Array(texelCount)
    for (var j = 0; j < texelCount; j++) {
      result[j] = Math.min(1.0, 1.0 - buffer[j * 4] + 0.5)
    }
    return result
  }
}

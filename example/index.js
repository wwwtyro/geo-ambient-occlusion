'use strict'

/* global requestAnimationFrame */

var mat4 = require('gl-mat4')
var Geometry = require('gl-geometry')
var glShader = require('gl-shader')
var glslify = require('glslify')
var mesh = require('stanford-dragon/3')
var Trackball = require('trackball-controller')
var boundingBox = require('vertices-bounding-box')
var tform = require('geo-3d-transform-mat4')
var GeoAO = require('../index')

window.onload = function () {
  var canvas = document.createElement('canvas')
  canvas.style.background = 'linear-gradient(to top, #0088ff 0%,#ffffff 100%)'
  canvas.style.position = 'fixed'
  canvas.style.left = '0px'
  canvas.style.top = '0px'
  canvas.style.width = canvas.style.height = '100%'
  document.body.appendChild(canvas)

  var range = document.createElement('input')
  range.type = 'range'
  range.style.position = 'fixed'
  range.style.bottom = '8px'
  range.style.left = '0px'
  range.style.width = '100%'
  range.style.margin = '0px'
  range.style.border = '0px'
  range.min = 0
  range.max = 16
  range.step = 0.001
  range.value = 2.0
  document.body.appendChild(range)

  var indicator = document.createElement('div')
  indicator.style.position = 'fixed'
  indicator.style.top = '0%'
  indicator.style.left = '0px'
  indicator.style.width = '0%'
  indicator.style.height = '8px'
  indicator.style.background = 'rgba(0,128,255,1.0)'
  document.body.appendChild(indicator)

  var gl = canvas.getContext('webgl')
  gl.enable(gl.DEPTH_TEST)
  gl.enable(gl.CULL_FACE)
  gl.cullFace(gl.BACK)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  gl.clearColor(0, 0, 0, 0)

  // Calculate the bounding box.
  var bb = boundingBox(mesh.positions)

  // Translate the geometry center to the origin.
  var _translate = [
    -0.5 * (bb[0][0] + bb[1][0]),
    -0.5 * (bb[0][1] + bb[1][1]),
    -0.5 * (bb[0][2] + bb[1][2])
  ]
  var translate = mat4.create()
  mat4.translate(translate, translate, _translate)
  mesh.positions = tform(mesh.positions, translate)

  var geometry = Geometry(gl)
  geometry.attr('aPosition', mesh.positions)
  geometry.faces(mesh.cells)

  var aoSampler = new GeoAO(mesh.positions, {
    resolution: 256,
    bias: 0.01,
    cells: mesh.cells
  })

  var view = mat4.create()
  var projection = mat4.create()

  var pExample = glShader(gl, glslify('./example.vert'), glslify('./example.frag'))

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  var ao
  var aoCount = 0
  var aoTotal = 256
  var aoDone = false

  function render () {
    if (aoCount < aoTotal) {
      aoCount++
      ao = aoSampler.sample(1)
      if (geometry._keys[geometry._keys.length - 1] === 'aOcclusion') {
        geometry._keys.pop()
        geometry._attributes.pop()
      }
      geometry.attr('aOcclusion', ao, {size: 1})
      indicator.style.width = 100 * aoCount / aoTotal + '%'
    } else if (!aoDone) {
      aoDone = true
      trackball.spin(1, 0)
      indicator.style.display = 'none'
    }
    canvas.width = canvas.clientWidth
    canvas.height = canvas.clientHeight
    gl.viewport(0, 0, canvas.width, canvas.height)
    mat4.lookAt(view, [0, 0, 128], [0, 0, 0], [0, 1, 0])
    mat4.perspective(projection, Math.PI / 4, canvas.width / canvas.height, 0.1, 1000.0)

    gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT)

    pExample.bind()
    geometry.bind(pExample)
    pExample.uniforms.uModel = trackball.rotation
    pExample.uniforms.uView = view
    pExample.uniforms.uProjection = projection
    pExample.uniforms.uPower = range.value
    geometry.draw(gl.TRIANGLES)
    requestAnimationFrame(render)
  }

  var trackball = new Trackball(canvas, {})

  render()
}

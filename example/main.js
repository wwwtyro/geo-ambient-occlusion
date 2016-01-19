'use strict'

/* global requestAnimationFrame $ vex*/

var mat4 = require('gl-mat4')
var Geometry = require('gl-geometry')
var glShader = require('gl-shader')
var glslify = require('glslify')
var dragon = require('stanford-dragon/3')
var Trackball = require('trackball-controller')
var boundingBox = require('vertices-bounding-box')
var tform = require('geo-3d-transform-mat4')
var saveAs = require('filesaver.js').saveAs

var GeoAO = require('../index')

window.onload = function () {
  var canvas = document.getElementById('render-canvas')
  var range = document.getElementById('range-ao-power')
  var indicator = document.getElementById('indicator')
  var importButton = document.getElementById('button-import')
  var exportButton = document.getElementById('button-export')


  importButton.onclick = function () {
    var importMessage = 'Paste your mesh data below. ' +
                        'Data must be in JSON format with "positions" and "cells" fields.' +
                        '<br><textarea id="area-import" style="width:100%"></textarea>'
    vex.dialog.open({
      message: importMessage,
      buttons: [
        $.extend({}, vex.dialog.buttons.YES, {
          text: 'Import'
        }),
        $.extend({}, vex.dialog.buttons.NO, {
          text: 'Cancel'
        })
      ],
      callback: function (fields) {
        if (fields === false) {
          return
        }
        var data = document.getElementById('area-import').value
        data = JSON.parse(data)
        loadMesh(data)
      }
    })
  }

  exportButton.onclick = function() {
    vex.dialog.open({
        message: 'Enter your filename below.',
        input: '<input name="filename" type="text" placeholder="ambient-occlusion.json" required/>',
        buttons: [
          $.extend({}, vex.dialog.buttons.YES, {
              text: 'Save'
          }),
          $.extend({}, vex.dialog.buttons.NO, {
              text: 'Cancel'
          })
        ],
        callback: function(fields) {
          if (fields === false) {
              return
          }
          var data = JSON.stringify(Array.prototype.slice.call(ao))
          var blob = new Blob([data], {type: "text/plain;charset=utf-8"})
          saveAs(blob, fields.filename)
        }
    });

  }

  var gl = canvas.getContext('webgl')
  gl.enable(gl.DEPTH_TEST)
  gl.enable(gl.CULL_FACE)
  gl.cullFace(gl.BACK)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  gl.clearColor(0, 0, 0, 0)

  var geometry = null
  var aoSampler
  var ao
  var aoCount = 0
  var aoTotal = 256
  var aoDone = false
  var camz = 0
  var fov = Math.PI / 4

  function loadMesh (mesh) {
    if (geometry) {
      geometry.dispose()
    }
    // Set up the AO variables.
    aoCount = 0
    aoDone = false

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

    geometry = Geometry(gl)
    geometry.attr('aPosition', mesh.positions)
    geometry.faces(mesh.cells)

    aoSampler = new GeoAO(mesh.positions, {
      resolution: 256,
      bias: 0.01,
      cells: mesh.cells
    })

    // Calculate a camera distance that will allow viewing
    // the entire model given an fov.
    var dx = bb[1][0] - bb[0][0]
    var dy = bb[1][1] - bb[0][1]
    var dz = bb[1][2] - bb[0][2]
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz)
    camz = d / (2 * Math.tan(fov / 2))
  }

  loadMesh(dragon)

  var view = mat4.create()
  var projection = mat4.create()

  var pExample = glShader(gl, glslify('./example.vert'), glslify('./example.frag'))

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
      indicator.style.width = 0
    }
    canvas.width = canvas.clientWidth
    canvas.height = canvas.clientHeight
    gl.viewport(0, 0, canvas.width, canvas.height)
    mat4.lookAt(view, [0, 0, camz], [0, 0, 0], [0, 1, 0])
    mat4.perspective(projection, fov, canvas.width / canvas.height, 0.1, 1000.0)

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

'use strict';


const REGL = require('regl');
const mat4 = require('gl-matrix').mat4;
const Trackball = require('trackball-controller');
const center = require('geo-center');
const mesh = require('snowden');

const geoao = require('../index.js');


// Entry point.
main();


async function main() {

  // Grab our canvas and set the resolution to the window resolution.
  const canvas = document.getElementById('render-canvas');
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  // Create our regl context. Since we'll be passing this to geo-ambient-occlusion, we'll need A) OES_texture_float
  // because geo-ambient-occlusion always requires it, and B) OES_element_index_uint because our mesh has more than
  // 65536 vertices.
  const regl = REGL({
    canvas: canvas,
    extensions: ['OES_texture_float', 'OES_element_index_uint'],
  });

  // Center the mesh vertices on the ~origin.
  text('Centering mesh...');
  await display();
  mesh.positions = center(mesh.positions, {
    center: [0, -0.5, 0],
  });

  // Initialize geo-ambient-occlusion.
  text('Initializing ambient occlusion generator...');
  await display();
  const aoSampler = geoao(mesh.positions, {
    cells: mesh.cells,
    resolution: 512,
    regl: regl,
  });

  // Sample the ambient occlusion. Every tenth of a second, give a progress update.
  text('Calculating ambient occlusion...');
  await display();
  const samples = 4096;
  let t0 = performance.now();
  let tStart = t0;
  for (let i = 0; i < samples; i++) {
    aoSampler.sample();
    if (performance.now() - t0 > 1000/60) {
      fraction(i/samples);
      await display();
      t0 = performance.now();
    }
  }
  var tEnd = performance.now();
  // eslint-disable-next-line no-console
  console.info('Computed '+samples+' samples in '+(tEnd - tStart).toFixed(1)+'ms');

  // We're done with the progress bar, hide it.
  fraction(0);

  // Collect the results of the ambient occluseion. This is a Float32Array of length <number of vertices>.
  text('Collecting ambient occlusion...');
  await display();
  const ao = aoSampler.report();

  // Dispose of resources we no longer need.
  aoSampler.dispose();

  // Create a regl command for rendering the mesh. Note that we subtract the occlusion value from 1.0 in order to
  // calculate the ambient light.
  const render = regl({
    vert: `
      precision highp float;
      attribute vec3 position;
      attribute vec3 normal;
      attribute float occlusion;
      uniform mat4 model, view, projection;
      varying float vOcclusion;
      void main() {
        gl_Position = projection * view * model * vec4(position, 1);
        vOcclusion = occlusion;
      }
    `,
    frag: `
      precision highp float;
      varying float vOcclusion;
      void main() {
        gl_FragColor = vec4(0.95 * vec3(1.0 - vOcclusion), 1.0);
      }
    `,
    attributes: {
      position: mesh.positions,
      occlusion: ao,
    },
    uniforms: {
      model: regl.prop('model'),
      view: regl.prop('view'),
      projection: regl.prop('projection'),
    },
    viewport: regl.prop('viewport'),
    elements: mesh.cells,
    cull: {
      enable: true,
      face: 'back',
    },
  });

  // Create a trackball.
  var trackball = new Trackball(canvas, {
    onRotate: loop,
    drag: 0.01
  });
  trackball.spin(13,0);

  // Handle mousewheel zoom.
  let zoom = 16;
  window.addEventListener('wheel', function(e) {
    if (e.deltaY < 0) {
      zoom *= 0.9;
    } else if (e.deltaY > 0) {
      zoom *= 1.1;
    }
    zoom = Math.max(2, Math.min(64, zoom));
    loop();
  });

  // Render loop.
  function loop() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    const model = trackball.rotation;
    const view = mat4.lookAt([], [0,0,zoom], [0,0,0], [0,1,0]);
    const projection = mat4.perspective([], Math.PI/4, canvas.width/canvas.height, 0.1, 1000);

    regl.clear({
      color: [1,1,1,1],
      depth: 1,
    });

    render({
      model: model,
      view: view,
      projection: projection,
      viewport: {x: 0, y: 0, width: canvas.width, height: canvas.height},
    });
  }

  text('Click & drag to rotate the scene. Mousewheel zooms.');
  await display();

}


// Async utility function for updating the display.
function display() {
  return new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });
}


// Update the progress bar.
function fraction(f) {
  document.getElementById('fraction').style.width = 100 * f + '%';
}


// Update the text field.
function text(value) {
  document.getElementById('fraction-label').innerHTML = value;
}

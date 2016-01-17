#define SHADER_NAME quad.frag

precision highp float;

varying vec3 vPos;

void main() {
    gl_FragColor = vec4(vPos, 1);
}

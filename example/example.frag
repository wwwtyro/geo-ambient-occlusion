#define SHADER_NAME test.frag

precision highp float;

uniform float uPower;

varying float vOcclusion;

void main() {
    float c = pow(vOcclusion, uPower);
    gl_FragColor = vec4(c,c,c, 1);
}

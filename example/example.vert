#define SHADER_NAME test.vert

attribute vec3 aPosition;
attribute vec3 aNormal;
attribute float aOcclusion;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;

varying float vOcclusion;

void main() {
    gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
    vOcclusion = aOcclusion;
}

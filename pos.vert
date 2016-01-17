#define SHADER_NAME pos.vert

attribute vec3 aPosition;

uniform mat4 uProjection;
uniform mat4 uModel;

varying vec3 vPos;

void main() {
    gl_Position = uProjection * uModel * vec4(aPosition, 1.0);
    vPos = vec3(uModel * vec4(aPosition, 1));
}

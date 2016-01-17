#define SHADER_NAME display.vert

attribute vec3 aPosition;

void main() {
    gl_Position = vec4(aPosition, 1.0);
}

#define SHADER_NAME occlusion.frag

precision highp float;

uniform sampler2D uPos;
uniform sampler2D uSource;
uniform sampler2D uVertex;
uniform float uCount;
uniform float uBias;
uniform vec2 uRes;
uniform mat4 uModel;

void main() {
    vec2 texel = gl_FragCoord.xy/uRes;
    vec3 vert = texture2D(uVertex, texel).rgb;
    vert = vec3(uModel * vec4(vert, 1));
    float z = texture2D(uPos, vert.xy + 0.5).b;
    float o = 0.0;
    if ((vert.z - z) < -uBias) {
        o = 1.0;
    }
    float src = texture2D(uSource, texel).r;
    o = ((uCount - 1.0)/uCount) * src + (1.0/uCount) * o;//(1.0 - uFrac) * o + uFrac * src;
    gl_FragColor = vec4(o, 0, 0, 1);
}

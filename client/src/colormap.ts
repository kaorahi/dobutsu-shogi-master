// copied from mcts.js in LizGoban
// https://github.com/kaorahi/lizgoban

export function get_color(winrate: number) {
    const color_emphasis = 1.2
    const t = 0.5 + (winrate - 0.5) * color_emphasis
    return color_for(t)
}

// ColorBrewer: Color Advice for Maps
// https://colorbrewer2.org/?type=diverging&scheme=Spectral&n=11
const hex_colors = [
    '#9e0142', '#d53e4f', '#f46d43', '#fdae61',
    '#fee08b', '#ffffbf', '#e6f598',
    '#abdda4', '#66c2a5', '#3288bd', '#5e4fa2',
]
const vec_colors = hex_colors.map(to_vec)  // [[r, g, b], ...]

function color_for(t: number) {
    t = Math.min(Math.max(t, 0), 1 - 1e-8)
    // piecewise linear interpolation
    const p = t * (vec_colors.length - 1), k = Math.floor(p), r = p - k
    const aa_transpose = (aa: number[][]) => aa[0].map((_, k) => aa.map(a => a[k]))
    const pairs = aa_transpose(vec_colors.slice(k, k + 2))  // [[r0, r1], ...]
    const interpolate = ([a, b]: [number, number]) => Math.round((1 - r) * a + r * b)
    return to_hex(pairs.map(interpolate))
}

function to_vec(hex: string) {
    return hex.match(/#(..)(..)(..)/)?.slice(1).map(k => parseInt(k, 16)) || []
}

function to_hex(vec: number[]) {
    return '#' + vec.map(z => z.toString(16).padStart(2, '0')).join('')
}

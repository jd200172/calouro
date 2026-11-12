# Visita da planta A do Edimburgo, renderizada no Blender (Cycles, CC0).
# Aberturas: só as portas e vãos listados em web/src/data/edimburgo.ts.
# A planta não marca janelas; a luz do dia entra pela varanda (guarda-corpo) e pelo vão de correr.
# Uso:
#   blender -b --python web/scripts/visita_planta_a.py -- --teste
#   blender -b --python web/scripts/visita_planta_a.py -- --render /tmp/visita-frames
# --render grava uma sequência JPEG (frame_0001.jpg …). O MP4 é montado depois.

import math
import os
import sys

import bpy
from mathutils import Vector

TEX = os.environ.get("VISITA_TEX", "/tmp/cc0")
HDRI = os.path.join(TEX, "sky.hdr")
FPS = int(os.environ.get("VISITA_FPS", "30"))
OLHO = 1.60
PASSO = 1.0  # m/s
ALTURA = 2.60
ESP = 0.10

ROOMS = {
    "tecnica": [(118, 38), (168, 38), (168, 200), (118, 200)],
    "dormitorio": [(168, 38), (410, 38), (410, 195), (168, 195)],
    "bwc1": [(168, 205), (340, 205), (340, 290), (168, 290)],
    "circulacao": [(340, 195), (418, 195), (418, 295), (340, 295)],
    "bwc2": [(168, 290), (340, 290), (340, 380), (168, 380)],
    "suite": [(168, 380), (340, 380), (340, 295), (418, 295), (418, 558), (168, 558)],
    "estar": [(418, 38), (668, 38), (668, 100), (625, 100), (625, 325), (580, 325), (580, 435), (418, 435)],
    "cozinha": [(625, 100), (668, 100), (668, 325), (625, 325)],
    "servico": [(580, 325), (668, 325), (668, 435), (580, 435)],
    "varanda": [(418, 435), (620, 435), (620, 565), (418, 565)],
}
AREAS = {
    "tecnica": 1.69,
    "dormitorio": 8.41,
    "bwc1": 2.72,
    "circulacao": 1.24,
    "bwc2": 2.76,
    "suite": 10.43,
    "estar": 15.66,
    "cozinha": 3.77,
    "servico": 2.23,
    "varanda": 5.68,
}
# (a, b) em pixels, tipo, cômodos. Espelha edimburgo.ts.
DOORS = [
    ((345, 195), (400, 195), "porta", ("dormitorio", "circulacao")),
    ((340, 210), (340, 250), "porta", ("bwc1", "circulacao")),
    ((290, 380), (335, 380), "porta", ("bwc2", "suite")),
    ((345, 295), (410, 295), "porta", ("suite", "circulacao")),
    ((418, 200), (418, 290), "porta", ("circulacao", "estar")),
    ((625, 100), (625, 325), "vao", ("estar", "cozinha")),
    ((585, 325), (625, 325), "porta", ("cozinha", "servico")),
    ((420, 435), (578, 435), "correr", ("estar", "varanda")),
    ((625, 38), (665, 38), "porta", ("estar", None)),
]


def poly_area(poly):
    s = 0
    for i, (x1, y1) in enumerate(poly):
        x2, y2 = poly[(i + 1) % len(poly)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


PX = sum(poly_area(p) for p in ROOMS.values())
M2 = sum(AREAS.values())
SCALE = math.sqrt(M2 / PX)
XS = [x for p in ROOMS.values() for x, _ in p]
YS = [y for p in ROOMS.values() for _, y in p]
CX = (min(XS) + max(XS)) / 2
CY = (min(YS) + max(YS)) / 2


def wm(px, py):
    """Pixel da planta -> (x, z) do passeio, em metros. Y do Blender = -z."""
    return ((px - CX) * SCALE, (py - CY) * SCALE)


def bxy(px, py):
    x, z = wm(px, py)
    return (x, -z)


ROOMS_M = {rid: [bxy(*p) for p in poly] for rid, poly in ROOMS.items()}
DOORS_M = []
for a, b, tipo, rooms in DOORS:
    ax, ay = bxy(*a)
    bx, by = bxy(*b)
    DOORS_M.append(
        {
            "a": (ax, ay),
            "b": (bx, by),
            "mid": ((ax + bx) / 2, (ay + by) / 2),
            "tipo": tipo,
            "rooms": rooms,
            "len": math.hypot(bx - ax, by - ay),
        }
    )


def args_after():
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def box(name, x0, y0, z0, x1, y1, z1, mat):
    if x1 < x0:
        x0, x1 = x1, x0
    if y1 < y0:
        y0, y1 = y1, y0
    if z1 < z0:
        z0, z1 = z1, z0
    if min(x1 - x0, y1 - y0, z1 - z0) < 0.01:
        return None
    mesh = bpy.data.meshes.new(name)
    cx, cy, cz = (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
    sx, sy, sz = (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2
    verts = [(cx + ix * sx, cy + iy * sy, cz + iz * sz) for ix in (-1, 1) for iy in (-1, 1) for iz in (-1, 1)]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new(name, mesh)
    if mat:
        ob.data.materials.append(mat)
    return link(ob)


def load_img(path, color=True):
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = "sRGB" if color else "Non-Color"
    return img


def tex_mat(name, diff, rough, scale=1.0, color=None, rough_val=0.5):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough_val
    nt = mat.node_tree
    if color:
        bsdf.inputs["Base Color"].default_value = (*color, 1)
    if diff and os.path.exists(os.path.join(TEX, diff)):
        uv = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (scale, scale, scale)
        d = nt.nodes.new("ShaderNodeTexImage")
        d.image = load_img(os.path.join(TEX, diff), True)
        r = nt.nodes.new("ShaderNodeTexImage")
        r.image = load_img(os.path.join(TEX, rough), False)
        nt.links.new(uv.outputs["Object"], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], d.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], r.inputs["Vector"])
        nt.links.new(d.outputs["Color"], bsdf.inputs["Base Color"])
        nt.links.new(r.outputs["Color"], bsdf.inputs["Roughness"])
    if name == "reboco":
        geom = nt.nodes.new("ShaderNodeNewGeometry")
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (0.86, 0.84, 0.78, 1)
        em.inputs["Strength"].default_value = 1.1
        mix = nt.nodes.new("ShaderNodeMixShader")
        out = nt.nodes["Material Output"]
        # o avesso da parede (normal invertida) também aparece claro
        nt.links.new(geom.outputs["Backfacing"], mix.inputs["Fac"])
        nt.links.new(bsdf.outputs["BSDF"], mix.inputs[1])
        nt.links.new(em.outputs["Emission"], mix.inputs[2])
        nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    return mat


def flat(name, color, rough=0.45, metal=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    return mat


def wall_mat():
    mat = bpy.data.materials.new("reboco")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.88, 0.86, 0.81, 1)
    bsdf.inputs["Roughness"].default_value = 0.8
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (0.88, 0.86, 0.81, 1)
    em.inputs["Strength"].default_value = 0.9
    mix = nt.nodes.new("ShaderNodeMixShader")
    out = nt.nodes["Material Output"]
    nt.links.new(geom.outputs["Backfacing"], mix.inputs["Fac"])
    nt.links.new(bsdf.outputs["BSDF"], mix.inputs[1])
    nt.links.new(em.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    return mat


def emit_ceiling():
    mat = bpy.data.materials.new("teto")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.95, 0.93, 0.88, 1)
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.95, 0.86, 1)
    bsdf.inputs["Emission Strength"].default_value = 4
    bsdf.inputs["Roughness"].default_value = 0.9
    return mat


def glass_mat():
    mat = bpy.data.materials.new("vidro")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.85, 0.9, 0.92, 1)
    bsdf.inputs["Roughness"].default_value = 0.04
    # alpha em vez de transmission: o Cycles em CPU não aguenta vidro refrativo em centenas de frames
    bsdf.inputs["Alpha"].default_value = 0.25
    mat.blend_method = "BLEND"
    return mat


def point_in(poly, x, y):
    inside = False
    j = len(poly) - 1
    for i, (xi, yi) in enumerate(poly):
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def centroid(poly):
    return (sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly))


def edge_hits_door(p, q, door, tol=0.18):
    mx, my = door["mid"]
    # distância do meio da porta ao segmento
    vx, vy = q[0] - p[0], q[1] - p[1]
    l2 = vx * vx + vy * vy
    if l2 < 1e-8:
        return False
    t = max(0, min(1, ((mx - p[0]) * vx + (my - p[1]) * vy) / l2))
    dx, dy = p[0] + t * vx - mx, p[1] + t * vy - my
    return dx * dx + dy * dy < tol * tol


def wall_on(name, p, q, holes, mat, thick=ESP):
    """Parede de p a q no plano XY. holes: (t0, t1, z0, z1) ao longo do comprimento."""
    dx, dy = q[0] - p[0], q[1] - p[1]
    length = math.hypot(dx, dy)
    if length < 0.15:
        return
    ux, uy = dx / length, dy / length
    nx, ny = -uy, ux
    spans = [(0.0, length)]
    for t0, t1, _z0, _z1 in holes:
        a, b = min(t0, t1), max(t0, t1)
        nxt = []
        for s, e in spans:
            if b <= s + 0.02 or a >= e - 0.02:
                nxt.append((s, e))
                continue
            if a > s + 0.02:
                nxt.append((s, a))
            if b < e - 0.02:
                nxt.append((b, e))
        spans = nxt
    def slab(t0, t1, z0, z1, suffix):
        if t1 - t0 < 0.04 or z1 - z0 < 0.04:
            return
        c = ((p[0] + ux * (t0 + t1) / 2), (p[1] + uy * (t0 + t1) / 2))
        hx, hy = ux * (t1 - t0) / 2, uy * (t1 - t0) / 2
        hnx, hny = nx * thick / 2, ny * thick / 2
        x0, x1 = c[0] - abs(hx) - abs(hnx), c[0] + abs(hx) + abs(hnx)
        y0, y1 = c[1] - abs(hy) - abs(hny), c[1] + abs(hy) + abs(hny)
        # caixa alinhada só funciona se a parede é ortogonal
        if abs(ux) < 0.2 or abs(uy) < 0.2:
            box(name + suffix, x0, y0, z0, x1, y1, z1, mat)
    for s, e in spans:
        slab(s, e, 0, ALTURA, "")
    for t0, t1, z0, z1 in holes:
        slab(min(t0, t1), max(t0, t1), 0, z0, "_pe")
        slab(min(t0, t1), max(t0, t1), z1, ALTURA, "_vg")


def build_shell(mats):
    emitted = []
    for rid, poly in ROOMS_M.items():
        # piso
        if rid == "estar":
            rects = [((0.362, 2.916), (3.980, 3.813)), ((0.362, -0.340), (3.358, 2.916)), ((0.362, -1.932), (2.706, -0.340))]
        elif rid == "suite":
            # dois retângulos do L, em coordenadas já convertidas: recalcula dos pixels
            a = bxy(168, 380)
            b = bxy(340, 558)
            c = bxy(340, 295)
            d = bxy(418, 558)
            rects = [(a, b), (c, d)]
        else:
            xs = [p[0] for p in poly]
            ys = [p[1] for p in poly]
            rects = [((min(xs), min(ys)), (max(xs), max(ys)))]
        piso = mats["piso_ext"] if rid == "varanda" else mats["piso_int"] if rid in ("dormitorio", "suite", "circulacao") else mats["piso_mol"] if rid in ("bwc1", "bwc2", "cozinha", "servico", "tecnica") else mats["piso_soc"]
        for (x0, y0), (x1, y1) in rects:
            box(f"piso_{rid}", x0, y0, -0.02, x1, y1, 0.0, piso)
            if rid != "varanda":
                box(f"teto_{rid}", x0, y0, ALTURA, x1, y1, ALTURA + 0.04, mats["teto"])
        for i, p in enumerate(poly):
            q = poly[(i + 1) % len(poly)]
            if any(edge_hits_door(p, q, d) and edge_hits_door(p, q, {"mid": d["mid"], "a": d["a"], "b": d["b"]}) for d in []):
                pass
            key = tuple(sorted([(round(p[0], 2), round(p[1], 2)), (round(q[0], 2), round(q[1], 2))]))
            if key in emitted:
                continue
            emitted.append(key)
            holes = []
            exterior = True
            mid = ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
            for oid, op in ROOMS_M.items():
                if oid == rid:
                    continue
                if point_in(op, mid[0], mid[1]) or min(math.hypot(mid[0] - v[0], mid[1] - v[1]) for v in op) < 0.05 and any(
                    edge_hits_door(p, q, {"mid": ((op[k][0] + op[(k + 1) % len(op)][0]) / 2, (op[k][1] + op[(k + 1) % len(op)][1]) / 2), "a": op[k], "b": op[(k + 1) % len(op)]})
                    for k in range(len(op))
                ):
                    exterior = False
            # compartilhada se algum outro cômodo tem aresta colinear próxima
            shared = False
            for oid, op in ROOMS_M.items():
                if oid == rid:
                    continue
                for k in range(len(op)):
                    if edge_hits_door(p, q, {"mid": ((op[k][0] + op[(k + 1) % len(op)][0]) / 2, (op[k][1] + op[(k + 1) % len(op)][1]) / 2), "a": op[k], "b": op[(k + 1) % len(op)]}):
                        shared = True
            for door in DOORS_M:
                if edge_hits_door(p, q, door):
                    length = math.hypot(q[0] - p[0], q[1] - p[1]) or 1
                    ux, uy = (q[0] - p[0]) / length, (q[1] - p[1]) / length
                    t0 = (door["a"][0] - p[0]) * ux + (door["a"][1] - p[1]) * uy
                    t1 = (door["b"][0] - p[0]) * ux + (door["b"][1] - p[1]) * uy
                    head = {"vao": 2.34, "correr": 2.18, "porta": 2.08}[door["tipo"]]
                    holes.append((t0, t1, 0.0, head))
            if rid == "varanda" and not shared:
                # guarda-corpo, não janela inventada
                box_rail(p, q, mats["vidro"], mats["metal"])
                continue
            wall_on(f"par_{rid}_{i}", p, q, holes, mats["parede"])


def box_rail(p, q, glass, metal):
    dx, dy = q[0] - p[0], q[1] - p[1]
    length = math.hypot(dx, dy)
    if length < 0.3:
        return
    ux, uy = dx / length, dy / length
    nx, ny = -uy * 0.02, ux * 0.02
    # painel baixo de vidro no meio da aresta
    c = ((p[0] + q[0]) / 2 + nx, (p[1] + q[1]) / 2 + ny)
    if abs(ux) > 0.8:
        box("guarda", p[0], c[1] - 0.015, 0.08, q[0], c[1] + 0.015, 1.05, glass)
        box("corrimao", p[0], c[1] - 0.02, 1.05, q[0], c[1] + 0.02, 1.09, metal)
    else:
        box("guarda", c[0] - 0.015, p[1], 0.08, c[0] + 0.015, q[1], 1.05, glass)
        box("corrimao", c[0] - 0.02, p[1], 1.05, c[0] + 0.02, q[1], 1.09, metal)


def furnish(mats):
    def put(name, x, y, z0, w, d, h, mat):
        box(name, x - w / 2, y - d / 2, z0, x + w / 2, y + d / 2, z0 + h, mat)

    # estar: jantar ao norte, sofá ao sul, como na planta humanizada
    jx, jy = bxy(540, 140)
    put("mesa_jantar", jx, jy, 0.72, 1.15, 1.15, 0.04, mats["carvalho"])
    put("pe_jantar", jx, jy, 0, 0.12, 0.12, 0.72, mats["carvalho"])
    for i, (dx, dy) in enumerate(((-0.55, -0.55), (0.55, -0.55), (-0.55, 0.55), (0.55, 0.55))):
        put(f"cad_{i}", jx + dx, jy + dy, 0.42, 0.38, 0.38, 0.06, mats["linho"])
        put(f"cadp_{i}", jx + dx, jy + dy, 0, 0.32, 0.32, 0.42, mats["carvalho"])
    sx, sy = bxy(520, 330)
    put("sofa", sx, sy, 0.18, 2.05, 0.9, 0.28, mats["linho"])
    put("encosto", sx, sy + 0.28, 0.4, 2.05, 0.22, 0.42, mats["linho"])
    put("mesa_centro", sx, sy - 0.7, 0.32, 0.9, 0.5, 0.04, mats["carvalho"])
    put("tapete", sx, sy - 0.15, 0.005, 2.4, 1.7, 0.012, mats["linho"])
    # cozinha: bancada na face leste
    kx, ky = bxy(656, 200)
    put("bancada", kx, ky, 0.88, 0.30, 1.6, 0.04, mats["pedra"])
    put("arm_baixo", kx, ky, 0, 0.30, 1.6, 0.88, mats["branco"])
    # serviço, encostado na parede leste para deixar o vão livre
    vx, vy = bxy(655, 380)
    put("tanque", vx, vy, 0.85, 0.36, 0.55, 0.05, mats["branco"])
    put("maq", vx, vy - 0.55, 0, 0.40, 0.45, 0.85, mats["branco"])
    # varanda
    bx, by = bxy(520, 500)
    put("mesa_var", bx, by, 0.72, 0.7, 1.1, 0.04, mats["pedra"])
    put("pe_var", bx, by, 0, 0.08, 0.08, 0.72, mats["metal"])
    # dormitório
    dx, dy = -2.35, 2.55
    put("cama", dx, dy, 0.28, 1.4, 2.0, 0.22, mats["linho"])
    put("colchao", dx, dy + 0.05, 0.5, 1.3, 1.85, 0.16, mats["branco"])
    # suíte, cama a oeste para o corredor leste ficar livre
    ux, uy = -2.45, -2.55
    put("cama_s", ux, uy, 0.28, 1.45, 2.0, 0.22, mats["linho"])
    put("colchao_s", ux, uy, 0.5, 1.35, 1.85, 0.18, mats["branco"])
    # banheiros: bancada simples
    for name, px, py in (("bwc1", 250, 248), ("bwc2", 250, 335)):
        x, y = bxy(px, py)
        put(name, x, y, 0.82, 0.45, 0.9, 0.06, mats["branco"])


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def caminho():
    """Cada par é (posição, alvo). O alvo é um ponto do cômodo, não a parede à frente.

    A cozinha tem 62 cm de largura: a câmera para na abertura e olha para dentro.
    """
    # Trecho que cabe no vão: estar, varanda e jantar.
    # A circulação tem 1,24 m²; a câmera encosta no batente, então o passeio fica na área social.
    pontos = [
        ((3.05, 3.05), (1.55, -1.20)),
        ((1.50, 2.10), (1.54, -2.20)),
        ((1.50, 0.20), (1.54, -2.60)),
        ((1.54, -2.40), (1.54, -3.55)),
        ((1.35, 1.85), (2.15, 2.35)),
    ]
    def mix(a, b, t):
        return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

    frames = []
    pausa = int(3.0 * FPS)
    for (pa, _la), (pb, lb) in zip(pontos, pontos[1:]):
        n = max(1, int(round(dist(pa, pb) / (PASSO / FPS))))
        for i in range(n):
            t = i / n
            pos = mix(pa, pb, t)
            look = mix(pa, pb, min(1.0, t + 0.25))
            frames.append((pos, look))
        for _ in range(pausa):
            frames.append((pb, lb))
    frames.append(pontos[-1])
    return frames, [p[0] for p in pontos]


def look_euler(loc, target):
    direction = Vector((target[0] - loc[0], target[1] - loc[1], target[2] - loc[2]))
    return direction.to_track_quat("-Z", "Y").to_euler()


def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = int(os.environ.get("VISITA_SAMPLES", "16"))
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 1
    scene.cycles.transmission_bounces = 4
    scene.cycles.sample_clamp_indirect = 8
    scene.cycles.use_light_tree = False
    scene.cycles.blur_glossy = 1.0
    scene.render.use_persistent_data = True
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.resolution_x = int(os.environ.get("VISITA_W", "1920"))
    scene.render.resolution_y = int(os.environ.get("VISITA_H", "1080"))
    scene.render.fps = FPS
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.15
    scene.render.film_transparent = False

    world = bpy.data.worlds.new("ceu")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes["Background"]
    bg.inputs["Strength"].default_value = 1.6
    if os.path.exists(HDRI):
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = load_img(HDRI, True)
        nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    else:
        bg.inputs["Color"].default_value = (0.65, 0.75, 0.88, 1)

    sun = bpy.data.lights.new("sol", "SUN")
    sun.energy = 5.0
    sun.angle = math.radians(6)
    sun.color = (1, 0.97, 0.92)
    ob = bpy.data.objects.new("sol", sun)
    link(ob)
    ob.rotation_euler = (math.radians(55), 0, math.radians(20))

    # luz de teto nos quartos (a planta não marca janela neles)
    for rid, energia in (("dormitorio", 180), ("suite", 180), ("estar", 120), ("cozinha", 140), ("bwc1", 80), ("bwc2", 80)):
        c = centroid(ROOMS_M[rid])
        area = bpy.data.lights.new(rid, "AREA")
        area.energy = energia
        area.size = 2.4
        area.color = (1, 0.93, 0.84)
        aob = bpy.data.objects.new("luz_" + rid, area)
        link(aob)
        aob.location = (c[0], c[1], ALTURA - 0.08)
        aob.rotation_euler = (math.radians(180), 0, 0)


def animate(cam, frames):
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = len(frames)
    for i, (pos, look) in enumerate(frames, start=1):
        cam.location = (pos[0], pos[1], OLHO)
        cam.rotation_euler = look_euler(cam.location, (look[0], look[1], OLHO))
        cam.keyframe_insert("location", frame=i)
        cam.keyframe_insert("rotation_euler", frame=i)
    if cam.animation_data and cam.animation_data.action:
        for fc in cam.animation_data.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"


def main():
    argv = args_after()
    teste = "--teste" in argv
    saida = None
    if "--render" in argv:
        saida = argv[argv.index("--render") + 1]
    frames, limpos = caminho()
    metros = sum(dist(a, b) for a, b in zip(limpos, limpos[1:]))
    print(f"CAMINHO {metros:.1f} m, {len(frames)} frames, {len(frames) / FPS:.1f} s")
    if "--so-caminho" in argv:
        return
    setup_scene()
    mats = {
        "parede": wall_mat(),
        "teto": emit_ceiling(),
        "piso_soc": tex_mat("piso", "interior_tiles_diffuse.jpg", "interior_tiles_rough.jpg", 0.9, rough_val=0.35),
        "piso_int": tex_mat("madeira", "white_planks_clean_diffuse.jpg", "white_planks_clean_rough.jpg", 1.1, rough_val=0.4),
        "piso_mol": tex_mat("molhado", "interior_tiles_diffuse.jpg", "interior_tiles_rough.jpg", 1.4, rough_val=0.25),
        "piso_ext": tex_mat("varanda", "interior_tiles_diffuse.jpg", "interior_tiles_rough.jpg", 0.8, rough_val=0.45),
        "carvalho": tex_mat("carvalho", "oak_veneer_01_diffuse.jpg", "oak_veneer_01_rough.jpg", 0.8, rough_val=0.45),
        "linho": tex_mat("linho", "rough_linen_diffuse.jpg", "rough_linen_rough.jpg", 1.4, rough_val=0.75),
        "branco": flat("branco", (0.9, 0.89, 0.86), 0.5),
        "pedra": flat("pedra", (0.35, 0.35, 0.36), 0.18),
        "metal": flat("metal", (0.75, 0.74, 0.7), 0.3, 1),
        "vidro": glass_mat(),
    }
    build_shell(mats)
    furnish(mats)
    cam_data = bpy.data.cameras.new("olho")
    cam_data.lens = 28
    cam_data.clip_start = 0.05
    cam_data.clip_end = 40
    cam = bpy.data.objects.new("olho", cam_data)
    link(cam)
    bpy.context.scene.camera = cam
    animate(cam, frames)
    scene = bpy.context.scene
    if teste and os.environ.get("VISITA_DEBUG") == "1":
        c = centroid(ROOMS_M["estar"])
        cam.location = (frames[0][0][0], frames[0][0][1], OLHO)
        cam.rotation_euler = look_euler(cam.location, (c[0], c[1], 1.3))
        print("DEBUG cam", tuple(round(v, 2) for v in cam.location), "alvo", tuple(round(v, 2) for v in c))
        scene.render.filepath = "/tmp/visita-teste.jpg"
        scene.render.image_settings.file_format = "JPEG"
        scene.render.image_settings.quality = 85
        scene.render.use_motion_blur = False
        bpy.ops.render.render(write_still=True)
        return
    if teste:
        scene.frame_set(int(os.environ.get("VISITA_FRAME", "40")))
        scene.render.filepath = "/tmp/visita-teste.jpg"
        scene.render.image_settings.file_format = "JPEG"
        scene.render.image_settings.quality = 85
        scene.render.use_motion_blur = False
        bpy.ops.render.render(write_still=True)
        print("TESTE", scene.render.filepath)
        return
    if not saida:
        print("nada a renderizar")
        return
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 90
    os.makedirs(saida, exist_ok=True)
    scene.render.filepath = os.path.join(saida, "frame_")
    bpy.ops.render.render(animation=True)
    print("FRAMES", saida, scene.frame_end)


if __name__ == "__main__":
    main()

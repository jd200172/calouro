# Gera o estar realista da planta A do Edimburgo.
# Texturas CC0 da Poly Haven (https://polyhaven.com). Luz assada no Cycles.
# Uso: blender -b --python web/scripts/estar_realista.py -- /caminho/estar-realista.glb
#
# O modelo sai no mesmo sistema da maquete (Three.js): X à direita, Y para cima, Z para o fundo.
# No Blender (Z para cima) isso vira X, Y = -Z_three, Z = Y_three.

import math
import os
import sys

import bpy

TEX = os.environ.get("ESTAR_TEX", "/tmp/cc0")
OUT = "/tmp/estar-realista.glb"
if "--" in sys.argv:
    OUT = sys.argv[sys.argv.index("--") + 1]

H = 2.60


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 64
    scene.cycles.use_denoising = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 800
    scene.render.film_transparent = False


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
    if x1 - x0 < 0.004 or y1 - y0 < 0.004 or z1 - z0 < 0.004:
        return None
    mesh = bpy.data.meshes.new(name)
    cx, cy, cz = (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
    sx, sy, sz = (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2
    verts = [((cx + ix * sx), (cy + iy * sy), (cz + iz * sz)) for ix in (-1, 1) for iy in (-1, 1) for iz in (-1, 1)]
    faces = [
        (0, 1, 3, 2),
        (4, 6, 7, 5),
        (0, 4, 5, 1),
        (2, 3, 7, 6),
        (0, 2, 6, 4),
        (1, 5, 7, 3),
    ]
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    if mat:
        ob.data.materials.append(mat)
    return link(ob)


def load_img(path, color=True):
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = "sRGB" if color else "Non-Color"
    return img


def tex_mat(name, diff, rough, scale, roughness=0.55, color=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    if color:
        bsdf.inputs["Base Color"].default_value = (*color, 1)
    if diff:
        uv = nt.nodes.new("ShaderNodeUVMap")
        uv.uv_map = "Tile"
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (scale, scale, scale)
        d = nt.nodes.new("ShaderNodeTexImage")
        d.image = load_img(os.path.join(TEX, diff), True)
        r = nt.nodes.new("ShaderNodeTexImage")
        r.image = load_img(os.path.join(TEX, rough), False)
        nt.links.new(uv.outputs["UV"], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], d.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], r.inputs["Vector"])
        span = nt.nodes.new("ShaderNodeMapRange")
        span.inputs["From Min"].default_value = 0.05
        span.inputs["From Max"].default_value = 0.95
        span.inputs["To Min"].default_value = 0.38
        span.inputs["To Max"].default_value = 0.72
        nt.links.new(d.outputs["Color"], bsdf.inputs["Base Color"])
        nt.links.new(r.outputs["Color"], span.inputs["Value"])
        nt.links.new(span.outputs["Result"], bsdf.inputs["Roughness"])
    return mat


def flat_mat(name, color, roughness=0.45, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def emit_mat(name, color, strength):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Emission Color"].default_value = (*color, 1)
    bsdf.inputs["Emission Strength"].default_value = strength
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    return mat


def wall_x(name, x, y0, y1, holes, mat, thick=0.08, outward=1):
    """Parede paralela ao eixo Y, em x fixo. outward +1 empurra para +X."""
    y0, y1 = min(y0, y1), max(y0, y1)
    spans = [(y0, y1)]
    for a, b, _z0, _z1 in holes:
        a, b = min(a, b), max(a, b)
        nxt = []
        for s, e in spans:
            if b <= s or a >= e:
                nxt.append((s, e))
                continue
            if a > s:
                nxt.append((s, a))
            if b < e:
                nxt.append((b, e))
        spans = nxt
    x0 = x if outward < 0 else x
    x1 = x - thick if outward < 0 else x + thick
    for s, e in spans:
        box(name, x0, s, 0, x1, e, H, mat)
    for a, b, z0, z1 in holes:
        a, b = min(a, b), max(a, b)
        if z0 > 0.02:
            box(name + "_peitoril", x0, a, 0, x1, b, z0, mat)
        if H - z1 > 0.02:
            box(name + "_verga", x0, a, z1, x1, b, H, mat)


def wall_y(name, y, x0, x1, holes, mat, thick=0.08, outward=1):
    x0, x1 = min(x0, x1), max(x0, x1)
    spans = [(x0, x1)]
    for a, b, _z0, _z1 in holes:
        a, b = min(a, b), max(a, b)
        nxt = []
        for s, e in spans:
            if b <= s or a >= e:
                nxt.append((s, e))
                continue
            if a > s:
                nxt.append((s, a))
            if b < e:
                nxt.append((b, e))
        spans = nxt
    y0 = y - thick if outward < 0 else y
    y1 = y if outward < 0 else y + thick
    for s, e in spans:
        box(name, s, y0, 0, e, y1, H, mat)
    for a, b, z0, z1 in holes:
        a, b = min(a, b), max(a, b)
        if z0 > 0.02:
            box(name + "_peitoril", a, y0, 0, b, y1, z0, mat)
        if H - z1 > 0.02:
            box(name + "_verga", a, y0, z1, b, y1, H, mat)


def poly_floor(name, pts, z, mat, thickness=0.04):
    mesh = bpy.data.meshes.new(name)
    verts = [(x, y, z) for x, y in pts] + [(x, y, z - thickness) for x, y in pts]
    n = len(pts)
    faces = [tuple(range(n))]
    faces.append(tuple(range(2 * n - 1, n - 1, -1)))
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, j + n, i + n))
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    bpy.ops.object.select_all(action="DESELECT")
    ob = bpy.data.objects.new(name, mesh)
    link(ob)
    ob.data.materials.append(mat)
    # normal para cima
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


def build():
    plaster = tex_mat("reboco", "white_plaster_02_diffuse.jpg", "white_plaster_02_rough.jpg", 0.55, 0.85)
    floor = tex_mat("piso", "interior_tiles_diffuse.jpg", "interior_tiles_rough.jpg", 0.85, 0.35)
    oak = tex_mat("carvalho", "oak_veneer_01_diffuse.jpg", "oak_veneer_01_rough.jpg", 0.45, 0.5)
    linen = tex_mat("linho", "rough_linen_diffuse.jpg", "rough_linen_rough.jpg", 1.6, 0.8)
    planks = tex_mat("tabua", "white_planks_clean_diffuse.jpg", "white_planks_clean_rough.jpg", 0.9, 0.4)
    white = flat_mat("branco", (0.86, 0.84, 0.80), 0.55)
    stone = flat_mat("pedra", (0.45, 0.44, 0.42), 0.18)
    dark = flat_mat("grafite", (0.12, 0.12, 0.12), 0.35)
    metal = flat_mat("metal", (0.75, 0.73, 0.68), 0.25, 1)
    glass = flat_mat("vidro", (0.75, 0.82, 0.86), 0.05)
    glass.use_nodes = True
    glass.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.25
    glass.blend_method = "BLEND"
    led = emit_mat("led", (1.0, 0.86, 0.62), 8)
    lamp = emit_mat("luminaria", (1.0, 0.95, 0.85), 6)
    sky = emit_mat("ceu", (0.72, 0.82, 0.92), 1.4)
    plant = flat_mat("planta", (0.18, 0.32, 0.18), 0.6)

    # piso e teto em três retângulos (a planta do estar é um L)
    for name, x0, y0, x1, y1 in [
        ("norte", 0.362, 2.916, 3.980, 3.813),
        ("meio", 0.362, -0.340, 3.358, 2.916),
        ("sul", 0.362, -1.932, 2.706, -0.340),
    ]:
        box("piso_" + name, x0, y0, -0.04, x1, y1, 0.0, floor)
        box("teto_" + name, x0, y0, H, x1, y1, H + 0.04, white)

    # oeste, porta para a circulação
    wall_x("oeste", 0.362, -1.932, 3.813, [(0.166, 1.469, 0.0, 2.08)], plaster, outward=-1)
    # norte, porta de entrada
    wall_y("norte", 3.813, 0.362, 3.980, [(3.358, 3.936, 0.0, 2.12)], plaster, outward=1)
    # stub nordeste
    wall_x("nordeste", 3.980, 2.916, 3.813, [], plaster, outward=1)
    wall_y("degrau", 2.916, 3.358, 3.980, [], plaster, outward=1)
    # vão da cozinha: só a verga
    wall_x("cozinha_verga", 3.358, -0.340, 2.916, [(-0.340, 2.916, 0.0, 2.32)], plaster, outward=1)
    wall_y("sul_cozinha", -0.340, 2.706, 3.358, [], plaster, outward=-1)
    wall_x("leste_estar", 2.706, -1.932, -0.340, [], plaster, outward=1)
    # sul, janela da varanda
    wall_y("sul", -1.932, 0.362, 2.706, [(0.50, 2.50, 0.08, 2.22)], plaster, outward=-1)

    # rodapé
    for name, x0, y0, x1, y1 in [
        ("r1", 0.40, -1.90, 0.48, 3.78),
        ("r2", 0.40, 3.74, 3.90, 3.80),
        ("r3", 0.42, -1.90, 2.68, -1.84),
    ]:
        box(name, x0, y0, 0, x1, y1, 0.08, white)

    # painel de madeira e TV na parede oeste, voltado para a sala
    box("painel", 0.40, -1.35, 0.42, 0.48, 0.85, 2.35, oak)
    box("painel_ripas", 0.48, -1.28, 1.55, 0.52, 0.78, 2.28, oak)
    box("tv", 0.52, -0.85, 1.15, 0.56, 0.35, 1.72, dark)
    box("rack", 0.48, -1.15, 0.0, 0.95, 0.65, 0.48, white)
    box("prateleira", 0.48, -1.22, 2.28, 0.95, 0.72, 2.34, white)
    box("led", 0.50, -1.18, 2.24, 0.90, 0.68, 2.26, led)
    # livros e vaso
    box("livros", 0.55, -1.05, 2.34, 0.78, -0.55, 2.52, oak)
    box("vaso", 0.62, -0.35, 2.34, 0.78, -0.15, 2.48, white)
    box("folha", 0.64, -0.32, 2.48, 0.76, -0.18, 2.78, plant)

    # sofá de frente para o painel
    box("sofa_base", 1.15, -1.05, 0.18, 2.15, 0.55, 0.42, linen)
    box("sofa_encosto", 1.85, -1.05, 0.42, 2.15, 0.55, 0.85, linen)
    box("almofada1", 1.25, -0.85, 0.42, 1.70, -0.35, 0.58, linen)
    box("almofada2", 1.25, -0.15, 0.42, 1.70, 0.35, 0.58, linen)
    box("braco1", 1.15, -1.05, 0.42, 2.05, -0.92, 0.62, linen)
    box("braco2", 1.15, 0.42, 0.42, 2.05, 0.55, 0.62, linen)
    box("mesa", 1.05, -0.45, 0.0, 1.55, 0.15, 0.36, oak)
    box("tapete", 0.85, -1.20, 0.005, 2.25, 0.70, 0.02, linen)

    # jantar, perto da entrada
    box("mesa_jantar", 1.55, 1.55, 0.72, 2.55, 2.55, 0.76, oak)
    box("mesa_pe", 1.95, 1.95, 0.0, 2.15, 2.15, 0.72, oak)
    for i, (cx, cy) in enumerate([(1.70, 1.70), (2.40, 1.70), (1.70, 2.40), (2.40, 2.40)]):
        box(f"cadeira_{i}", cx - 0.18, cy - 0.18, 0.42, cx + 0.18, cy + 0.18, 0.46, linen)
        box(f"cadeira_pe_{i}", cx - 0.16, cy - 0.16, 0.0, cx + 0.16, cy + 0.16, 0.42, oak)

    # cozinha vista pelo vão
    box("bancada", 3.42, -0.15, 0.0, 3.95, 2.55, 0.90, stone)
    box("frente_arm", 3.40, -0.10, 0.08, 3.48, 2.50, 0.82, white)
    box("parede_coz", 3.95, -0.20, 0.0, 4.02, 2.70, H, plaster)
    box("piso_coz", 3.36, -0.20, -0.02, 4.02, 2.70, 0.0, floor)
    box("armario_alto", 3.55, 0.20, 1.45, 3.98, 2.20, 2.15, white)

    # varanda e céu atrás da janela
    box("piso_varanda", 0.30, -3.10, -0.02, 2.80, -1.94, 0.0, floor)
    box("guarda", 0.40, -2.55, 0.15, 2.60, -2.50, 1.05, glass)
    box("ceu", 0.2, -3.05, 0.2, 2.9, -2.95, 3.2, sky)
    box("chao_fora", 0.2, -3.05, -0.08, 2.9, -2.0, -0.02, flat_mat("grama", (0.55, 0.58, 0.52), 0.9))

    # luminária de teto sobre o estar
    box("plafon", 1.45, -0.15, H - 0.04, 1.85, 0.25, H, lamp)
    box("pendente", 1.95, 2.05, 1.85, 2.15, 2.25, 1.90, metal)
    box("pendente_luz", 1.90, 2.00, 1.78, 2.20, 2.30, 1.85, lamp)

    # moldura da janela
    box("marco_v", 0.46, -1.96, 0.08, 0.54, -1.90, 2.22, white)
    box("marco_h", 2.46, -1.96, 0.08, 2.54, -1.90, 2.22, white)
    box("marco_t", 0.46, -1.96, 2.16, 2.54, -1.90, 2.24, white)
    box("marco_b", 0.46, -1.96, 0.06, 2.54, -1.90, 0.12, white)

    world = bpy.data.worlds.new("ceu")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.62, 0.74, 0.88, 1)
    bg.inputs["Strength"].default_value = 0.35

    sun_data = bpy.data.lights.new("sol", "SUN")
    sun_data.energy = 2.2
    sun_data.angle = math.radians(8)
    sun_data.color = (1.0, 0.96, 0.90)
    sun = bpy.data.objects.new("sol", sun_data)
    link(sun)
    sun.rotation_euler = (math.radians(58), math.radians(8), math.radians(200))

    area = bpy.data.lights.new("janela", "AREA")
    area.energy = 80
    area.size = 2.2
    area.color = (0.85, 0.92, 1.0)
    area_ob = bpy.data.objects.new("janela", area)
    link(area_ob)
    area_ob.location = (1.5, -2.4, 1.6)
    area_ob.rotation_euler = (math.radians(-80), 0, 0)

    fill = bpy.data.lights.new("teto", "AREA")
    fill.energy = 40
    fill.size = 1.4
    fill.color = (1.0, 0.93, 0.84)
    fill_ob = bpy.data.objects.new("teto_luz", fill)
    link(fill_ob)
    fill_ob.location = (1.7, 0.4, 2.45)
    fill_ob.rotation_euler = (math.radians(180), 0, 0)
    tile_uvs()


def tile_uvs():
    for ob in bpy.context.scene.objects:
        if ob.type != "MESH":
            continue
        mesh = ob.data
        if "Tile" not in mesh.uv_layers:
            mesh.uv_layers.new(name="Tile")
        layer = mesh.uv_layers["Tile"].data
        for poly in mesh.polygons:
            n = poly.normal
            for li in poly.loop_indices:
                v = mesh.vertices[mesh.loops[li].vertex_index].co
                if abs(n.z) >= abs(n.x) and abs(n.z) >= abs(n.y):
                    layer[li].uv = (v.x, v.y)
                elif abs(n.x) >= abs(n.y):
                    layer[li].uv = (v.y, v.z)
                else:
                    layer[li].uv = (v.x, v.z)


def add_camera():
    cam = bpy.data.cameras.new("olho")
    cam.lens = 28
    ob = bpy.data.objects.new("olho", cam)
    link(ob)
    # olho no estar, olhando o painel e a janela
    ob.location = (2.15, 2.05, 1.48)
    direction = (math.radians(78), 0, math.radians(148))
    ob.rotation_euler = direction
    bpy.context.scene.camera = ob
    return ob


def aim(ob, target):
    direction = (
        target[0] - ob.location.x,
        target[1] - ob.location.y,
        target[2] - ob.location.z,
    )
    rot = (-math.atan2(direction[2], math.hypot(direction[0], direction[1])) + math.pi / 2, 0, 0)
    # look-at via track
    empty = bpy.data.objects.new("alvo", None)
    link(empty)
    empty.location = target
    con = ob.constraints.new("TRACK_TO")
    con.target = empty
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"
    return rot


def preview(path):
    scene = bpy.context.scene
    scene.cycles.samples = int(os.environ.get("ESTAR_SAMPLES", "24"))
    scene.render.resolution_x = int(os.environ.get("ESTAR_W", "960"))
    scene.render.resolution_y = int(os.environ.get("ESTAR_H", "600"))
    bpy.context.scene.render.filepath = path
    bpy.context.scene.render.image_settings.file_format = "JPEG"
    bpy.context.scene.render.image_settings.quality = 85
    bpy.ops.render.render(write_still=True)


def bake_and_export(path):
    scene = bpy.context.scene
    scene.cycles.samples = 28
    meshes = [ob for ob in list(scene.objects) if ob.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for ob in meshes:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = "estar"
    if "Bake" not in joined.data.uv_layers:
        joined.data.uv_layers.new(name="Bake")
    joined.data.uv_layers["Bake"].active = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=66, island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")

    img = bpy.data.images.new("luz", 768, 768, alpha=False)
    img.colorspace_settings.name = "Linear Rec.709"
    for mat in joined.data.materials:
        if not mat or not mat.use_nodes:
            continue
        node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = img
        node.name = "BakeTarget"
        mat.node_tree.nodes.active = node

    meshes = [joined]
    joined.select_set(True)
    scene.cycles.bake_type = "DIFFUSE"
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True
    scene.render.bake.use_pass_color = False
    scene.render.bake.margin = 6
    bpy.ops.object.bake(type="DIFFUSE", save_mode="INTERNAL", use_clear=True)

    luz = os.path.splitext(path)[0] + "-luz.png"
    img.filepath_raw = luz
    img.file_format = "PNG"
    img.save()

    # a luz não entra no glb; o Three.js multiplica este mapa pelas texturas
    for ob in meshes:
        for mat in ob.data.materials:
            if not mat or not mat.use_nodes:
                continue
            node = mat.node_tree.nodes.get("BakeTarget")
            if node:
                mat.node_tree.nodes.remove(node)

    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for ob in meshes:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_jpeg_quality=78,
        export_lights=False,
        export_cameras=False,
        export_yup=True,
    )
    print("GLB", path, os.path.getsize(path))
    print("LUZ", luz, os.path.getsize(luz))


def main():
    clear_scene()
    build()
    cam = add_camera()
    aim(cam, (0.85, -0.7, 1.05))
    if os.environ.get("ESTAR_PREVIEW") == "1":
        preview("/tmp/estar-preview.jpg")
    if os.environ.get("ESTAR_BAKE", "1") != "0":
        bake_and_export(OUT)


if __name__ == "__main__":
    main()

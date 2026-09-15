// ponytail: like codes.js in currency_converter — just data, no logic.
const SAMPLE_SCRIPT = `import bpy

# Create a cube
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
cube = bpy.context.active_object
cube.name = "MyCube"

# Smooth shading
bpy.ops.object.shade_smooth()

# Simple material
mat = bpy.data.materials.new("CubeMaterial")
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.1, 0.5, 0.9, 1.0)
bsdf.inputs['Roughness'].default_value = 0.5
cube.data.materials.append(mat)
`;

const GUIDE_SAMPLES = [
  {
    name: "Simple Cube",
    desc: "Smallest script that passes (creates 1 MESH).",
    code: SAMPLE_SCRIPT
  },
  {
    name: "Row of Spheres",
    desc: "Loop = many objects, all get exported.",
    code: `import bpy

for i in range(3):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, location=(i * 2, 0, 0))
    sphere = bpy.context.active_object
    sphere.name = "Sphere_" + str(i)
    bpy.ops.object.shade_smooth()
`
  },
  {
    name: "What FAILS (do not submit)",
    desc: "Worker clears scene + exports for you. This breaks it.",
    code: `# DON'T submit this:
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
bpy.ops.export_scene.gltf(filepath="out.glb", export_format='GLB')
`
  }
];

// Golden rule for docs / viva: script creates ONLY geometry.
const SCRIPT_RULES = {
  must: "import bpy + at least 1 MESH object (cube/sphere/cylinder/from_pydata)",
  mustNot: "scene clear, collections, export_scene, render settings, file/network access, infinite loops"
};

# 3D chess piece models — attribution

The six GLTF piece models in this directory are third-party assets
licensed under **CC-BY-4.0** (https://creativecommons.org/licenses/by/4.0/),
originally published on Sketchfab and obtained via the
https://github.com/Sushant-Coder-01/chess3d repository's public assets.

Per-model attribution is preserved in each piece directory's
`license.txt` (as shipped by Sketchfab's download bundles), including:

- Bishop — "Wooden bishop chess piece" by francesca23
  https://sketchfab.com/3d-models/wooden-bishop-chess-piece-6ca1785eca0342c482a2376a712f756a
- Pawn — by ranya123 (see pawn/license.txt)
- Knight, Rook, Queen, King — see the respective license.txt files.

Modifications made for Power Up Chess:
- Texture references removed from the .gltf manifests and texture
  files deleted — the app applies its own solid per-side materials.
- Geometry is merged, recentred, and rescaled at load time
  (apps/web/src/board3d/gltfPieces.ts).

CC-BY-4.0 requires this attribution to accompany redistribution; keep
this file and the per-piece license.txt files together with the models.

## Environment assets (`env/`)

- `st_fagans_interior_1k.hdr` — "St Fagans Interior" HDRI by Andreas
  Mischok, Poly Haven, **CC0** — https://polyhaven.com/a/st_fagans_interior
- `wood.jpg` — "Wood Table 001" diffuse map (downscaled to 512px),
  Poly Haven, **CC0** — https://polyhaven.com/a/wood_table_001

CC0 requires no attribution; credited here for provenance anyway.

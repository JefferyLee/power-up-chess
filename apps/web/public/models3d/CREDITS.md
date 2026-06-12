# 3D chess assets — attribution

## Piece models (`glowbox/`)

"Chess Set" by **Glowbox 3D** — Sketchfab, licensed **CC-BY-4.0**
(https://creativecommons.org/licenses/by/4.0/).
https://sketchfab.com/3d-models/chess-set-520cc529bfd8425695cd336efd1dfe11

Modifications made for Power Up Chess:
- The board node, its material and 2K texture were pruned from the
  shipped file (the app renders its own board).
- Piece baseColor textures recompressed with pngquant.
- Per-piece geometry is extracted, recentred, and rescaled at load
  time (apps/web/src/board3d/gltfPieces.ts).

CC-BY-4.0 requires this attribution to accompany redistribution.

## Environment assets (`env/`)

- `st_fagans_interior_1k.hdr` — "St Fagans Interior" HDRI by Andreas
  Mischok, Poly Haven, **CC0** — https://polyhaven.com/a/st_fagans_interior
- `wood.jpg` — "Wood Table 001" diffuse map (downscaled to 512px),
  Poly Haven, **CC0** — https://polyhaven.com/a/wood_table_001

CC0 requires no attribution; credited here for provenance anyway.

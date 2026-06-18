# Floor Region and Visibility

The floor-region work fixes the one place where wall pixels really did affect geometry: Cognitive Companion's camera visibility polygon.

This polygon is not used by the CTS runtime tracker. It is used by CC for camera adjacency inference and operator UI. Bad visibility polygons can make two cameras look adjacent when the shared area is actually a wall projection.

## The bug

A homography maps points on the floor plane into floor-plan coordinates. The old CC visibility code sampled the full camera image border and projected those border points through the homography.

That border contains walls, ceiling, cabinets, and door frames. Those points are not on the floor plane, so projecting them through a floor homography creates false floor-plan coverage.

## The fix

CTS auto-calibration already estimates the floor plane from depth. It uses Depth Anything v2 plus RANSAC; the RANSAC inliers are pixels likely to belong to the floor. M10 converts those inliers into a floor-region polygon.

`tracking-orchestrator/app/calibration/floor_plane.py::floor_region_polygon`:

1. Takes `FloorPlaneResult.sample_indices[result.inlier_mask]`.
2. Filters to the configured vertical image region.
3. Builds a concave hull when possible, with a convex hull fallback.
4. Simplifies the polygon.
5. Returns normalized image coordinates `[[x_norm, y_norm], ...]`.

The important coordinate rule is:

| Polygon | Coordinate space |
| --- | --- |
| `floor_region_polygon` | normalized image space `[0, 1]` |
| `visibility_polygon` | normalized floor-plan space `[0, 1]` |

They both use numbers between 0 and 1, but they are not the same space.

## How CC uses it

CTS returns `floor_region_polygon` from `/internal/calibration/auto`. It is return-only on the CTS side: no protobuf and no CTS persistence.

Cognitive Companion stores the polygon on `cts_cameras`:

| Column | Meaning |
| --- | --- |
| `floor_region_polygon` | JSON polygon in normalized image space |
| `floor_region_source` | `depth_auto` or `manual` |
| `floor_region_set_at` | timestamp of the saved region |

`backend/services/cts_visibility.py::compute_visibility_from_homography` now accepts the optional floor region. When present, it samples along the floor-region boundary and projects those points through the homography. When absent, it falls back to the old image-border behavior and logs `visibility_polygon_no_floor_region`.

## Operator editing

The auto-derived region is a proposal, not a hidden truth. The calibration UI overlays it on the camera snapshot. An operator can accept it, move vertices, or hand-draw a replacement. Saving the region stores `source="manual"` when edited.

If the camera already has a committed homography, saving a floor region recomputes the visibility polygon immediately. That keeps adjacency/UI behavior aligned with the latest operator-reviewed geometry.

## What this does not change

The floor region does not change person tracking. CTS still localizes people from footpoints and fuses floor positions as described in [Multi-Camera Fusion](./04-multi-camera-fusion.md).

The floor region only improves camera coverage/adjacency surfaces that need to know "which part of the floor can this camera see?"

## Code references

| Concern | Code |
| --- | --- |
| Depth floor plane and floor-region polygon | `tracking-orchestrator/app/calibration/floor_plane.py` |
| Auto-calibration response | `tracking-orchestrator/app/routers/calibration.py` |
| CC visibility projection | `cognitive-companion/backend/services/cts_visibility.py::compute_visibility_from_homography` |
| CC calibration routes | `cognitive-companion/backend/routers/cts_calibration.py` |
| CC camera columns | `cognitive-companion/backend/models/cts_camera.py` |

Previous: [Posture Fusion](./05-posture-fusion.md)

Next: [Operations, Drift, and Recalibration](./07-operations-drift-and-recalibration.md)

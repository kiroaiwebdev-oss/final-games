// Grid-based turn-by-turn navigation for the city road grid.
//
// The city is a regular grid: roads run along every multiple of `blockSize`
// (both X-running and Z-running lines) from -extent..+extent. Given the truck
// position and the active target we build a Manhattan route along the roads and
// report the next maneuver relative to the truck's heading:
//   "Go straight / Turn left / Turn right / Turn around / Arriving"
// plus the distance to it, and the full route (for on-road chevrons + minimap).
//
// Heading convention (matches the game): forward = (sin h, cos h) in (x,z),
// bearing(a->b) = atan2(bx-ax, bz-az), so bearing(forward) = heading and
// +Δbearing = a RIGHT turn (clockwise from above).

const TURN_THRESHOLD = 0.55; // ~31°, corner bend below this counts as "straight"
const SIDE_THRESHOLD = 0.6;  // ~34°, waypoint this far off-heading => steer now
const UTURN_THRESHOLD = 2.3; // ~132°, waypoint behind => turn around
const WP_REACH = 9;          // a corner is considered passed within this radius
const ARRIVE_DIST = 30;      // show "Arriving" inside this distance to the goal
const NOW_DIST = 32;         // show the turn arrow (vs straight preview) this close

function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function bearing(ax, az, bx, bz) { return Math.atan2(bx - ax, bz - az); }
function dist2(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

export class Navigator {
  constructor(world) {
    this.world = world;
    this.B = world.map.blockSize;
    this.extent = world.map.half;
    this.route = [];                 // [[x,z], ...] anchor + corners + target (world XZ)
    this.target = null;              // [x,z]
    this.instruction = { type: "none", bigArrow: "straight", distance: 0, text: "" };
  }

  _snapLine(v) {
    const s = Math.round(v / this.B) * this.B;
    return Math.max(-this.extent, Math.min(this.extent, s));
  }

  // Manhattan route along grid roads from the truck to the target. The target
  // is approached along whichever road (vertical/horizontal) it sits closest
  // to, so we never backtrack to a far intersection near the destination.
  _buildRoute(px, pz, tx, tz) {
    const gx = this._snapLine(px), gz = this._snapLine(pz);
    const onHoriz = Math.abs(pz - gz) <= Math.abs(px - gx); // truck on an X-running road?
    const sx = this._snapLine(tx), sz = this._snapLine(tz);
    // target hugs a vertical road (x=sx) or a horizontal road (z=sz)?
    const accessV = Math.abs(tx - sx) <= Math.abs(tz - sz);
    const A = accessV ? [sx, tz] : [tx, sz];      // approach point on the access road
    const start = onHoriz ? [px, gz] : [gx, pz];  // anchor on the truck's current road

    let mids;
    if (onHoriz && accessV) {
      mids = [[sx, gz]];                           // perpendicular: one corner
    } else if (!onHoriz && !accessV) {
      mids = [[gx, sz]];                           // perpendicular: one corner
    } else if (onHoriz && !accessV) {
      const cx = this._snapLine(tx);               // parallel horizontals: jog via x=cx
      mids = [[cx, gz], [cx, sz]];
    } else {                                        // both vertical
      if (gx === sx) mids = [];
      else { const cz = this._snapLine(tz); mids = [[gx, cz], [sx, cz]]; }
    }

    const pts = [start, ...mids, A, [tx, tz]];
    const out = [];
    for (const p of pts) {
      const last = out[out.length - 1];
      if (!last || dist2(last[0], last[1], p[0], p[1]) > 2.5) out.push(p);
    }
    return out;
  }

  // Recompute route + next maneuver. `target` is [x,y,z] (or null).
  update(truckPos, heading, target) {
    if (!target) {
      this.route = [];
      this.target = null;
      this.instruction = { type: "none", bigArrow: "straight", distance: 0, text: "" };
      return this.instruction;
    }
    const px = truckPos[0], pz = truckPos[2];
    const tx = target[0], tz = target[2];
    this.target = [tx, tz];

    const route = this._buildRoute(px, pz, tx, tz);
    this.route = route;

    let nodes = route.slice(1);                 // corners + target (drop the rail anchor)
    if (nodes.length === 0) nodes = [[tx, tz]];

    let i = 0;
    while (i < nodes.length - 1 && dist2(px, pz, nodes[i][0], nodes[i][1]) < WP_REACH) i++;
    const cur = nodes[i];
    const nxt = nodes[i + 1] || null;
    const distance = dist2(px, pz, cur[0], cur[1]);
    const isFinal = !nxt;

    // direction to the current waypoint relative to where we're pointing
    const relToCur = normAngle(bearing(px, pz, cur[0], cur[1]) - heading);

    // the road bend at the current corner (route geometry), if any
    let cornerTurn = "straight";
    if (nxt) {
      const bIn = bearing(px, pz, cur[0], cur[1]);
      const bOut = bearing(cur[0], cur[1], nxt[0], nxt[1]);
      const tA = normAngle(bOut - bIn);
      cornerTurn = tA > TURN_THRESHOLD ? "right" : (tA < -TURN_THRESHOLD ? "left" : "straight");
    }

    let type, bigArrow, text;
    if (isFinal && distance < ARRIVE_DIST) {
      type = "arrive"; bigArrow = "arrive"; text = "Arriving";
    } else if (Math.abs(relToCur) > UTURN_THRESHOLD) {
      type = "uturn"; bigArrow = "uturn"; text = "Turn around";
    } else if (relToCur > SIDE_THRESHOLD) {
      type = "right"; bigArrow = "right"; text = "Turn right";
    } else if (relToCur < -SIDE_THRESHOLD) {
      type = "left"; bigArrow = "left"; text = "Turn left";
    } else if (isFinal) {
      type = "straight"; bigArrow = "straight"; text = "Go straight";
    } else if (cornerTurn === "straight") {
      type = "straight"; bigArrow = "straight"; text = "Go straight";
    } else if (distance <= NOW_DIST) {
      type = cornerTurn; bigArrow = cornerTurn;
      text = cornerTurn === "left" ? "Turn left" : "Turn right";
    } else {
      type = cornerTurn; bigArrow = "straight";
      text = `${Math.round(distance)} m, then ${cornerTurn}`;
    }

    this.instruction = { type, bigArrow, distance, text };
    return this.instruction;
  }

  routeWorld() { return this.route.map((p) => [p[0], 0, p[1]]); }
}

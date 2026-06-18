// Map descriptors. World generator (world.js) turns these into geometry +
// collision data. v1 ships one big open city; structure supports more.
export const MAPS = [
  {
    id: "harbor_city",
    name: "Harbor City",
    desc: "Sprawling coastal town with a tight grid of streets.",
    env: {
      sky: [0.62, 0.78, 0.95],
      fogNear: 90,
      fogFar: 420,
      lightDir: [0.5, 0.9, 0.35],
      lightColor: [1.0, 0.97, 0.86],
      ambient: [0.46, 0.5, 0.58],
      ground: [0.34, 0.46, 0.28],
    },
    half: 240,         // world extends -half..half on X/Z
    blockSize: 60,     // city block spacing (road grid)
    roadWidth: 12,
    spawn: [6, 0],
    hubs: [
      { name: "Dockyards", pos: [-180, -180] },
      { name: "Old Town", pos: [120, -150] },
      { name: "Market Sq.", pos: [-120, 120] },
      { name: "Hilltop", pos: [170, 160] },
      { name: "Industrial Park", pos: [0, 200] },
      { name: "Riverside", pos: [-200, 40] },
      { name: "Central Depot", pos: [40, 0] },
    ],
    fuelStations: [[60, 18], [-120, -60], [150, -120], [-60, 160]],
    seed: 1337,
  },
];

export function getMap(id) {
  return MAPS.find((m) => m.id === id) || MAPS[0];
}

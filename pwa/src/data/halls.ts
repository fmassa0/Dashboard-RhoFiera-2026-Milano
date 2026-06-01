// Hall positions on the PLAST 2026 plan (hall-plan-padiglioni.png, the official
// Fiera Milano Rho plan from plastonline.org), expressed as percentages so the
// overlay scales with the image at any size. PLAST occupa i 6 padiglioni al pian
// terreno: 9, 11, 13, 15, 22, 24. Coordinate misurate visivamente dalla pianta
// isometrica (sono approssimate per via della prospettiva: facili da ritoccare).
export interface HallBox {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export const HALL_BOXES: HallBox[] = [
  { id: "9",  left: 40.1, top: 42.1, width: 12.8, height: 18.5 },
  { id: "11", left: 31.0, top: 46.3, width: 9.1,  height: 18.5 },
  { id: "13", left: 24.0, top: 50.5, width: 9.4,  height: 14.4 },
  { id: "15", left: 17.2, top: 52.3, width: 6.8,  height: 21.3 },
  { id: "22", left: 17.4, top: 38.4, width: 8.6,  height: 13.4 },
  { id: "24", left: 9.1,  top: 39.8, width: 8.3,  height: 13.4 },
];

export interface Point {
  x: number;
  y: number;
}

export function hallCentroid(box: HallBox): Point {
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

export const HALL_CENTROIDS: Record<string, Point> = Object.fromEntries(
  HALL_BOXES.map((b) => [b.id, hallCentroid(b)]),
);

export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

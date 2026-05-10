import { z } from "zod";

const pointSchema = z.object({
  x: z.number().int(),
  y: z.number().int()
});

const collisionSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int().positive(),
  h: z.number().int().positive()
});

const teleportSchema = z.object({
  label: z.string().trim().min(1),
  targetRoom: z.string().trim().min(1)
});

const tableSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  seats: z.number().int().min(1).max(12)
});

const roomLayoutSchema = z.object({
  theme: z.string().trim().min(1),
  backgroundAsset: z.string().trim().min(1),
  avatarStyleSet: z.string().trim().min(1),
  objectPack: z.string().trim().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  spawnPoints: z.array(pointSchema).min(1),
  collision: z.array(collisionSchema),
  teleports: z.array(teleportSchema),
  tables: z.array(tableSchema).default([])
});

export type RoomLayout = z.input<typeof roomLayoutSchema>;

export function parseRoomLayout(input: unknown, options: { roomSlugs: string[] }): RoomLayout {
  const layout = roomLayoutSchema.parse(input);

  layout.spawnPoints.forEach((point, index) => {
    if (!isPointWithinBounds(point.x, point.y, layout.width, layout.height)) {
      throw new Error(`spawn point ${index} must be within room bounds`);
    }
  });

  layout.collision.forEach((rectangle, index) => {
    if (
      !isPointWithinBounds(rectangle.x, rectangle.y, layout.width, layout.height) ||
      rectangle.x + rectangle.w > layout.width ||
      rectangle.y + rectangle.h > layout.height
    ) {
      throw new Error(`collision rectangle ${index} must be within room bounds`);
    }
  });

  const roomSlugs = new Set(options.roomSlugs);
  layout.teleports.forEach((teleport, index) => {
    if (!roomSlugs.has(teleport.targetRoom)) {
      throw new Error(`teleport ${index} targets unknown room slug "${teleport.targetRoom}"`);
    }
  });

  const tableIds = new Set<string>();
  layout.tables.forEach((table, index) => {
    if (
      !isPointWithinBounds(table.x, table.y, layout.width, layout.height) ||
      table.x + table.w > layout.width ||
      table.y + table.h > layout.height
    ) {
      throw new Error(`table ${index} must be within room bounds`);
    }

    if (tableIds.has(table.id)) {
      throw new Error(`table ${index} has duplicate id "${table.id}"`);
    }
    tableIds.add(table.id);
  });

  return layout;
}

function isPointWithinBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x <= width && y <= height;
}

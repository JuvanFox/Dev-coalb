import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("[seed] Starting database seed...");

  // Create default General room
  const generalRoom = await prisma.room.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "General",
      description: "Default public room for everyone",
      isPublic: true,
      createdById: "00000000-0000-0000-0000-000000000000",
    },
  });

  console.log(`[seed] Created/updated room: ${generalRoom.name}`);

  // Create a default voice channel in General
  const voiceChannel = await prisma.voiceChannel.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      name: "Voice",
      roomId: generalRoom.id,
    },
  });

  console.log(`[seed] Created/updated voice channel: ${voiceChannel.name}`);
  console.log("[seed] Done!");
}

main()
  .catch((err) => {
    console.error("[seed] Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

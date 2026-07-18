import { PrismaClient, MemberRole } from "@prisma/client";
import { categoryTaxonomies } from "./taxonomy.js";

const db = new PrismaClient();
const slug = (value: string, index: number) =>
  value
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-|-$/g, "") || `category-${index}`;

async function seed() {
  const telegramChatId = BigInt(
    process.env.TELEGRAM_GROUP_ID || "-1000000000000",
  );
  const community = await db.community.upsert({
    where: { telegramChatId },
    update: {},
    create: {
      telegramChatId,
      name: process.env.APP_NAME || "Community Board",
      slug: "main",
      inviteUrl:
        process.env.TELEGRAM_GROUP_INVITE_URL || "https://t.me/example",
    },
  });
  for (const [index, taxonomy] of categoryTaxonomies.entries())
    await db.category.upsert({
      where: {
        communityId_slug: {
          communityId: community.id,
          slug: slug(taxonomy.name, index),
        },
      },
      update: {
        icon: taxonomy.icon,
        fieldSchema: taxonomy.fields,
        conditionEnabled: taxonomy.conditionEnabled,
      } as any,
      create: {
        communityId: community.id,
        name: taxonomy.name,
        slug: slug(taxonomy.name, index),
        icon: taxonomy.icon,
        sortOrder: index,
        fieldSchema: taxonomy.fields,
        conditionEnabled: taxonomy.conditionEnabled,
      } as any,
    });
  for (const id of (process.env.INITIAL_ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)) {
    const user = await db.user.upsert({
      where: { telegramUserId: BigInt(id) },
      update: {},
      create: { telegramUserId: BigInt(id), firstName: "Owner" },
    });
    await db.communityMember.upsert({
      where: {
        communityId_userId: { communityId: community.id, userId: user.id },
      },
      update: { role: MemberRole.owner },
      create: {
        communityId: community.id,
        userId: user.id,
        role: MemberRole.owner,
      },
    });
  }
}
seed().finally(() => db.$disconnect());

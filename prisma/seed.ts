import { config as loadDotenv } from "dotenv";
import { PrismaClient, SourceKind, TelegramSourceKind } from "@prisma/client";

loadDotenv();

const prisma = new PrismaClient();

const categories = [
  { slug: "ukraine", nameUk: "\u0423\u043a\u0440\u0430\u0457\u043d\u0430", nameEn: "Ukraine" },
  { slug: "war", nameUk: "\u0412\u0456\u0439\u043d\u0430", nameEn: "War" },
  { slug: "politics", nameUk: "\u041f\u043e\u043b\u0456\u0442\u0438\u043a\u0430", nameEn: "Politics" },
  { slug: "economy", nameUk: "\u0415\u043a\u043e\u043d\u043e\u043c\u0456\u043a\u0430", nameEn: "Economy" },
  { slug: "international", nameUk: "\u041c\u0456\u0436\u043d\u0430\u0440\u043e\u0434\u043d\u0456", nameEn: "International" },
  { slug: "technology", nameUk: "\u0422\u0435\u0445\u043d\u043e\u043b\u043e\u0433\u0456\u0457", nameEn: "Technology" },
  { slug: "society", nameUk: "\u0421\u0443\u0441\u043f\u0456\u043b\u044c\u0441\u0442\u0432\u043e", nameEn: "Society" },
  { slug: "business", nameUk: "\u0411\u0456\u0437\u043d\u0435\u0441", nameEn: "Business" },
  { slug: "science", nameUk: "\u041d\u0430\u0443\u043a\u0430", nameEn: "Science" },
  { slug: "culture", nameUk: "\u041a\u0443\u043b\u044c\u0442\u0443\u0440\u0430", nameEn: "Culture" },
  { slug: "sports", nameUk: "\u0421\u043f\u043e\u0440\u0442", nameEn: "Sports" },
  { slug: "other", nameUk: "\u0406\u043d\u0448\u0435", nameEn: "Other" },
];

const rssSources: Array<{
  name: string;
  url: string;
  country: string;
  language: string;
  organization: string;
  reliabilityScore: number;
  isOfficial?: boolean;
}> = [
  { name: "Suspilne", url: "https://suspilne.media/rss/all.rss", country: "UA", language: "uk", organization: "Suspilne", reliabilityScore: 85 },
  { name: "Ukrainska Pravda", url: "https://www.pravda.com.ua/rss/", country: "UA", language: "uk", organization: "Ukrainska Pravda", reliabilityScore: 80 },
  { name: "Radio Svoboda", url: "https://www.radiosvoboda.org/api/zrqiteuuir", country: "UA", language: "uk", organization: "RFE/RL", reliabilityScore: 85 },
  { name: "ZN.ua", url: "https://zn.ua/ukr/rss/full.rss", country: "UA", language: "uk", organization: "ZN.ua", reliabilityScore: 78 },
  { name: "LB.ua", url: "https://lb.ua/rss/ukr/news.xml", country: "UA", language: "uk", organization: "LB.ua", reliabilityScore: 78 },
  { name: "Ukrinform", url: "https://www.ukrinform.ua/rss/block-lastnews", country: "UA", language: "uk", organization: "Ukrinform", reliabilityScore: 82 },
  { name: "NV", url: "https://nv.ua/ukr/rss/all.xml", country: "UA", language: "uk", organization: "NV", reliabilityScore: 78 },
  { name: "Babel", url: "https://babel.ua/rss.xml", country: "UA", language: "uk", organization: "Babel", reliabilityScore: 74 },
  { name: "Espreso", url: "https://espreso.tv/rss", country: "UA", language: "uk", organization: "Espreso", reliabilityScore: 72 },
  { name: "Interfax-Ukraine", url: "https://interfax.com.ua/news/last.rss", country: "UA", language: "uk", organization: "Interfax-Ukraine", reliabilityScore: 80 },
  { name: "European Pravda", url: "https://www.eurointegration.com.ua/rss/", country: "UA", language: "uk", organization: "Ukrainska Pravda", reliabilityScore: 80 },
  { name: "ArmyInform", url: "https://armyinform.com.ua/feed/", country: "UA", language: "uk", organization: "Ministry of Defence", reliabilityScore: 75, isOfficial: true },
  { name: "Hromadske Radio", url: "https://hromadske.radio/rss", country: "UA", language: "uk", organization: "Hromadske Radio", reliabilityScore: 76 },
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", country: "GB", language: "en", organization: "BBC", reliabilityScore: 90 },
  { name: "BBC Ukrainian", url: "https://feeds.bbci.co.uk/ukrainian/rss.xml", country: "GB", language: "uk", organization: "BBC", reliabilityScore: 90 },
  { name: "The Guardian World", url: "https://www.theguardian.com/world/rss", country: "GB", language: "en", organization: "The Guardian", reliabilityScore: 86 },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", country: "QA", language: "en", organization: "Al Jazeera", reliabilityScore: 82 },
  { name: "DW Ukrainian", url: "https://rss.dw.com/rdf/rss-ukr-all", country: "DE", language: "uk", organization: "Deutsche Welle", reliabilityScore: 86 },
];

const officialSources = [
  { organization: "Office of the President of Ukraine", name: "President of Ukraine", websiteUrl: "https://www.president.gov.ua/", telegramUrl: "https://t.me/V_Zelenskiy_official", username: "V_Zelenskiy_official", reliabilityScore: 95 },
  { organization: "Cabinet of Ministers of Ukraine", name: "Cabinet of Ministers", websiteUrl: "https://www.kmu.gov.ua/", telegramUrl: "https://t.me/Denys_Smyhal", username: "Denys_Smyhal", reliabilityScore: 92 },
  { organization: "State Emergency Service of Ukraine", name: "DSNS", websiteUrl: "https://dsns.gov.ua/", telegramUrl: "https://t.me/dsns_telegram", username: "dsns_telegram", reliabilityScore: 93 },
  { organization: "Air Force of the Armed Forces of Ukraine", name: "Air Force of Ukraine", websiteUrl: "https://www.zsu.gov.ua/", telegramUrl: "https://t.me/kpszsu", username: "kpszsu", reliabilityScore: 92 },
  { organization: "General Staff of the Armed Forces of Ukraine", name: "General Staff ZSU", websiteUrl: "https://www.zsu.gov.ua/", telegramUrl: "https://t.me/GeneralStaffZSU", username: "GeneralStaffZSU", reliabilityScore: 94 },
];

const telegramNewsSources = [
  { name: "Blyskavka", username: "blyskavka_ua", inviteLink: null as string | null, sourceType: TelegramSourceKind.public_channel, reliabilityScore: 45, organization: "Blyskavka" },
  { name: "OPG News UA", username: "OPG_NEWS_UA", inviteLink: null, sourceType: TelegramSourceKind.public_channel, reliabilityScore: 40, organization: "OPG News" },
  { name: "Private invite channel", username: null, inviteLink: "https://t.me/+pFvHjtPUufZhMTFi", sourceType: TelegramSourceKind.private_channel, reliabilityScore: 35, organization: "Private invite channel" },
];

async function main() {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { nameUk: category.nameUk, nameEn: category.nameEn },
      create: category,
    });
  }

  for (const source of rssSources) {
    await prisma.source.upsert({
      where: { url: source.url },
      update: {
        name: source.name,
        country: source.country,
        language: source.language,
        organization: source.organization,
        reliabilityScore: source.reliabilityScore,
        isOfficial: source.isOfficial ?? false,
        type: SourceKind.RSS,
        enabled: true,
      },
      create: {
        name: source.name,
        type: SourceKind.RSS,
        url: source.url,
        country: source.country,
        language: source.language,
        organization: source.organization,
        reliabilityScore: source.reliabilityScore,
        isOfficial: source.isOfficial ?? false,
      },
    });
  }

  for (const official of officialSources) {
    const existing = await prisma.officialSource.findFirst({
      where: { telegramUrl: official.telegramUrl },
    });
    const row =
      existing ??
      (await prisma.officialSource.create({
        data: {
          organization: official.organization,
          name: official.name,
          websiteUrl: official.websiteUrl,
          telegramUrl: official.telegramUrl,
          country: "UA",
          reliabilityScore: official.reliabilityScore,
        },
      }));

    const telegramExisting = await prisma.telegramSource.findFirst({
      where: { username: official.username },
    });
    if (telegramExisting) {
      await prisma.telegramSource.update({
        where: { id: telegramExisting.id },
        data: {
          name: official.name,
          sourceType: TelegramSourceKind.official,
          officialSourceId: row.id,
          organization: official.organization,
          reliabilityScore: official.reliabilityScore,
          enabled: true,
        },
      });
    } else {
      await prisma.telegramSource.create({
        data: {
          name: official.name,
          username: official.username,
          sourceType: TelegramSourceKind.official,
          officialSourceId: row.id,
          organization: official.organization,
          reliabilityScore: official.reliabilityScore,
        },
      });
    }
  }

  for (const channel of telegramNewsSources) {
    const existing = await prisma.telegramSource.findFirst({
      where: channel.username ? { username: channel.username } : { inviteLink: channel.inviteLink },
    });
    if (existing) {
      await prisma.telegramSource.update({
        where: { id: existing.id },
        data: {
          name: channel.name,
          username: channel.username,
          inviteLink: channel.inviteLink,
          sourceType: channel.sourceType,
          reliabilityScore: channel.reliabilityScore,
          organization: channel.organization,
          enabled: true,
        },
      });
    } else {
      await prisma.telegramSource.create({ data: channel });
    }
  }

  console.log("Seed completed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

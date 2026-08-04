import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import type { WaVisibility } from "../src/generated/prisma/enums";
import {
  MUTE_FOREVER_MS,
  STATUS_BACKGROUNDS,
  STATUS_TTL_MS,
} from "../src/lib/wpp/config";
import { normalizePhone } from "../src/lib/wpp/phone";
import type { WaSystemAction } from "../src/lib/wpp/types";

/**
 * Demo data for the WhatsApp clone (the `Wa*` half of the schema).
 *
 * Separate from `prisma/seed.ts` on purpose: the two apps share a database but
 * nothing else, so seeding one must never disturb the other. Run it with
 * `npm run db:seed:wpp`.
 *
 * Unlike the Slack seed this one does **not** wipe the database — it upserts by
 * unique key (`phone` for accounts, `directKey` for 1:1 chats, subject+creator
 * for the group) and replays each demo chat's history from scratch, so running
 * it twice leaves exactly the same data as running it once.
 *
 * No attachments are created: seeding media would mean writing objects into
 * S3/MinIO (or `.uploads/`), which the seed has no business doing. Avatars,
 * group icons and image messages stay empty — upload them from the UI.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const NOW = Date.now();
const minutesAgo = (m: number) => new Date(NOW - m * 60_000);
const secondsAgo = (s: number) => new Date(NOW - s * 1_000);

/** Shared password for every demo account. */
/**
 * The password every demo account gets.
 *
 * Generated per run unless `WPP_SEED_PASSWORD` is set, and printed in the
 * summary below. A password committed to the repository is a real problem, not
 * just a scanner alert: this seed is meant to be runnable against a deployed
 * database, and five accounts with a password anyone can read from GitHub is
 * exactly the account takeover `ALLOW_PROD_SEED` is trying to make deliberate.
 *
 * Set it explicitly when something else needs to know it up front — the
 * end-to-end suite does (see e2e/README.md).
 */
const PASSWORD =
  process.env.WPP_SEED_PASSWORD ?? `demo-${randomBytes(8).toString("hex")}`;

/**
 * Canonicalise a literal through the same helper sign-up uses, so the seeded
 * numbers can never disagree with what the app would have stored. The spacing
 * below is deliberate — it proves `normalizePhone` is doing the work.
 */
function e164(input: string): string {
  const phone = normalizePhone(input);
  if (!phone) throw new Error(`Not a valid phone number: ${input}`);
  return phone;
}

// ── Accounts ────────────────────────────────────────────────────────────────

type Account = {
  phone: string;
  name: string;
  about: string;
  locale: string;
  theme: string;
  wallpaper: string;
  /** Seconds since the last heartbeat; under 45 s renders as "online". */
  lastSeenSec: number;
  lastSeenPrivacy?: WaVisibility;
  avatarPrivacy?: WaVisibility;
  aboutPrivacy?: WaVisibility;
  readReceipts?: boolean;
};

/**
 * Five demo accounts on an obviously fake range (+54 9 11 0000 000x), so nobody
 * ever seeds a number that belongs to a real person.
 *
 * Nicolás and Olivia carry non-default privacy on purpose — they are what makes
 * the privacy branches visible without touching Settings:
 *   • Nicolás hides "last seen" and "about" from anyone he hasn't saved. He has
 *     saved Sofía and Mateo but not Emma, so Emma sees neither for him
 *     (`canSeeField` checks *the subject's* contact list — see lib/wpp/data.ts).
 *   • Olivia has read receipts off, which is reciprocal: nobody ever sees blue
 *     ticks from her, and she never sees anyone else's.
 */
const accounts = {
  sofia: {
    phone: "+54 9 11 0000 0001",
    name: "Sofía Ramírez",
    about: "Diseñando cosas 🎨",
    locale: "es",
    theme: "light",
    wallpaper: "sage",
    lastSeenSec: 8, // online right now
  },
  mateo: {
    phone: "+54 9 11 0000 0002",
    name: "Mateo Fernández",
    about: "En bici por Buenos Aires 🚲",
    locale: "es",
    theme: "dark",
    wallpaper: "default",
    lastSeenSec: 20, // online right now
  },
  emma: {
    phone: "+54 9 11 0000 0003",
    name: "Emma Clarke",
    about: "Learning Spanish, slowly.",
    locale: "en",
    theme: "system",
    wallpaper: "sand",
    lastSeenSec: 40 * 60,
  },
  nico: {
    phone: "+54 9 11 0000 0004",
    name: "Nicolás Duarte",
    about: "Ocupado",
    locale: "es",
    theme: "dark",
    wallpaper: "slate",
    lastSeenSec: 3 * 60 * 60,
    lastSeenPrivacy: "CONTACTS",
    aboutPrivacy: "CONTACTS",
  },
  olivia: {
    phone: "+54 9 11 0000 0005",
    name: "Olivia Bennett",
    about: "Ceramics, coffee, and long walks.",
    locale: "en",
    theme: "light",
    wallpaper: "rose",
    lastSeenSec: 26 * 60 * 60,
    avatarPrivacy: "NOBODY",
    readReceipts: false,
  },
} satisfies Record<string, Account>;

type AccountKey = keyof typeof accounts;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Same formula as `directKeyFor` in `src/lib/wpp/data.ts` — the two ids sorted
 * and joined with ":". Duplicated rather than imported because that module is
 * `server-only` and pulls in the request-scoped Prisma proxy.
 */
function directKeyFor(a: string, b: string): string {
  return [a, b].sort().join(":");
}

type MemberState = {
  role?: "MEMBER" | "ADMIN";
  joinedAt?: Date;
  lastReadAt?: Date;
  lastDeliveredAt?: Date;
  pinnedAt?: Date | null;
  archivedAt?: Date | null;
  mutedUntil?: Date | null;
  draft?: string | null;
};

/**
 * Create or reset one participant's view of a chat. Every resettable column is
 * written explicitly (not merged) so a re-run restores the scripted state
 * instead of inheriting whatever the last demo session left behind.
 */
async function member(chatId: string, userId: string, state: MemberState = {}) {
  const data = {
    role: state.role ?? ("MEMBER" as const),
    joinedAt: state.joinedAt ?? new Date(NOW),
    lastReadAt: state.lastReadAt ?? new Date(NOW),
    lastDeliveredAt: state.lastDeliveredAt ?? new Date(NOW),
    pinnedAt: state.pinnedAt ?? null,
    archivedAt: state.archivedAt ?? null,
    mutedUntil: state.mutedUntil ?? null,
    draft: state.draft ?? null,
  };
  await prisma.waChatMember.upsert({
    where: { chatId_userId: { chatId, userId } },
    update: data,
    create: { chatId, userId, ...data },
  });
}

/**
 * Wipe a demo chat's timeline before replaying it. Messages have no natural
 * unique key, so this is what keeps the seed idempotent; reactions, stars and
 * hides go with them by cascade.
 */
async function resetHistory(chatId: string) {
  await prisma.waMessage.deleteMany({ where: { chatId } });
}

/** Find-or-create the 1:1 chat between two accounts, and blank its history. */
async function directChat(aId: string, bId: string) {
  const directKey = directKeyFor(aId, bId);
  const memberIds = aId === bId ? [aId] : [aId, bId];
  const chat = await prisma.waChat.upsert({
    where: { directKey },
    update: {},
    create: {
      type: "DIRECT",
      directKey,
      createdById: aId,
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
  });
  await resetHistory(chat.id);
  return chat;
}

type SayExtras = {
  replyToId?: string;
  editedAt?: Date;
  deletedAt?: Date;
  forwardScore?: number;
};

async function say(
  chatId: string,
  senderId: string,
  body: string,
  mAgo: number,
  extras: SayExtras = {},
) {
  return prisma.waMessage.create({
    data: { chatId, senderId, body, createdAt: minutesAgo(mAgo), ...extras },
  });
}

/**
 * A group event in the timeline. Mirrors `writeSystemMessage` /`systemMeta` in
 * `src/lib/wpp/messages.ts` — action plus operands, never a pre-formatted
 * sentence, so the same row renders in each viewer's language.
 */
async function systemSay(
  chatId: string,
  action: WaSystemAction,
  meta: {
    actorId?: string | null;
    actorName?: string;
    targets?: { id: string; name: string }[];
    value?: string;
  },
  mAgo: number,
) {
  return prisma.waMessage.create({
    data: {
      chatId,
      kind: "SYSTEM",
      body: "",
      systemAction: action,
      systemMeta: JSON.stringify(meta),
      createdAt: minutesAgo(mAgo),
    },
  });
}

/** Point the chat list's denormalised sort key at the newest message. */
async function touch(chatId: string) {
  const newest = await prisma.waMessage.findFirst({
    where: { chatId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (newest) {
    await prisma.waChat.update({
      where: { id: chatId },
      data: { lastMessageAt: newest.createdAt },
    });
  }
}

/** Save `contact` in `owner`'s address book under a nickname. */
async function saveContact(ownerId: string, contactId: string, alias: string) {
  await prisma.waContact.upsert({
    where: { ownerId_contactId: { ownerId, contactId } },
    update: { alias },
    create: { ownerId, contactId, alias },
  });
}

async function main() {
  // Creates accounts with a known, published password. Refuse to run against
  // production unless explicitly forced.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "true") {
    throw new Error(
      "Refusing to seed in production (it sets a known password on the demo accounts). " +
        "Set ALLOW_PROD_SEED=true to override.",
    );
  }

  console.log("Creating accounts…");
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const users = {} as Record<AccountKey, { id: string; name: string; phone: string }>;
  for (const [key, a] of Object.entries(accounts) as [AccountKey, Account][]) {
    const data = {
      name: a.name,
      about: a.about,
      passwordHash,
      locale: a.locale,
      theme: a.theme,
      wallpaper: a.wallpaper,
      lastSeenAt: secondsAgo(a.lastSeenSec),
      lastSeenPrivacy: a.lastSeenPrivacy ?? ("EVERYONE" as const),
      avatarPrivacy: a.avatarPrivacy ?? ("EVERYONE" as const),
      aboutPrivacy: a.aboutPrivacy ?? ("EVERYONE" as const),
      readReceipts: a.readReceipts ?? true,
      deactivatedAt: null,
    };
    const phone = e164(a.phone);
    users[key] = await prisma.waUser.upsert({
      where: { phone },
      update: data,
      create: { phone, ...data },
      select: { id: true, name: true, phone: true },
    });
  }
  const { sofia, mateo, emma, nico, olivia } = users;

  // ── Address books ─────────────────────────────────────────────────────────
  // WhatsApp shows the *saved* name for people in your contacts and the raw
  // phone number for everyone else, so the aliases here deliberately differ
  // from the account names — if you see "Mateo ❤️" the contact lookup worked,
  // if you see "Mateo Fernández" it fell through to the account name.
  console.log("Saving contacts…");
  await saveContact(sofia.id, mateo.id, "Mateo ❤️");
  await saveContact(mateo.id, sofia.id, "Sofi");
  await saveContact(sofia.id, emma.id, "Emma (trabajo)");
  await saveContact(emma.id, sofia.id, "Sofía – work");
  await saveContact(sofia.id, nico.id, "Nico Duarte");
  await saveContact(nico.id, sofia.id, "Sofi Ramírez");
  await saveContact(sofia.id, olivia.id, "Olivia cerámica");
  await saveContact(olivia.id, sofia.id, "Sofía (pottery)");
  await saveContact(mateo.id, emma.id, "Emma Clarke");
  await saveContact(emma.id, mateo.id, "Mateo (asado)");
  await saveContact(mateo.id, nico.id, "Nico");
  await saveContact(nico.id, mateo.id, "Mateo Fer");
  // One-way on purpose: Emma has Nicolás saved, he has not saved her. Because
  // his "last seen" and "about" are CONTACTS-only, Emma sees neither — while
  // Sofía, who *is* in his address book, sees both.
  await saveContact(emma.id, nico.id, "Nicolás (asado)");
  // Mateo ↔ Olivia are left unsaved in both directions — they only know each
  // other from a Marketplace sale — so their chat renders raw phone numbers.

  console.log("Blocking…");
  // Olivia blocked Nicolás. They share no chat, so this only shows up in
  // Settings → Blocked contacts and in the "you can't start a chat" path.
  await prisma.waBlock.upsert({
    where: { blockerId_blockedId: { blockerId: olivia.id, blockedId: nico.id } },
    update: {},
    create: { blockerId: olivia.id, blockedId: nico.id },
  });

  // ── Read cursors: the point of this seed ──────────────────────────────────
  // `computeTick` (src/lib/wpp/messages.ts) reads the *other* participant's
  // cursors, so the four chats below are arranged to show every tick state at
  // once when you log in as Sofía (+5491100000001):
  //
  //   Sofía ↔ Mateo   her cursor sits behind his last three messages
  //                   → unread badge (3), and it is the pinned chat
  //   Sofía ↔ Emma    Emma's lastReadAt is past everything Sofía sent
  //                   → blue double ticks
  //   Sofía ↔ Nicolás his lastDeliveredAt is current, lastReadAt is not
  //                   → grey double ticks ("delivered")
  //   Sofía ↔ Olivia  cursors are current but her read receipts are off, so
  //                   the ticks stay grey no matter what — the reciprocal rule
  //
  // Nothing else is unread for Sofía, so the badge in the chat list is
  // unambiguous.

  // ── Sofía ↔ Mateo — unread, pinned, and the feature showcase ──────────────
  console.log("Seeding chats…");
  const withMateo = await directChat(sofia.id, mateo.id);
  await say(withMateo.id, mateo.id, "Buen día Sofi ☀️ ¿Seguís con la idea de ir a Bariloche en octubre?", 300);
  await say(withMateo.id, sofia.id, "Sí! Ya miré pasajes, están 180 lucas ida y vuelta", 297);
  const micro = await say(withMateo.id, mateo.id, "¿Y si vamos en micro? Son 20 horas pero sale la mitad", 295);
  await say(withMateo.id, sofia.id, "20 horas… ¿lo decís en serio? 😅", 292, {
    replyToId: micro.id,
  });
  await say(withMateo.id, mateo.id, "Medio en serio. Dejame ver si consigo algo con millas.", 288);
  await say(withMateo.id, sofia.id, "Dale. Yo sigo mirando cabañas.", 285);
  const cabin = await say(
    withMateo.id,
    mateo.id,
    "Encontré una en Colonia Suiza: Av. Los Notros 2340, para 4, 95.000 la noche",
    240,
  );
  const love = await say(withMateo.id, sofia.id, "Esa está buenísima 😍", 238);
  await say(withMateo.id, sofia.id, "Reservala antes de que se llene", 235);
  // Edited: the body is the corrected text, `editedAt` is what renders the
  // "edited" marker next to the timestamp.
  const booked = await say(withMateo.id, mateo.id, "Listo, señé tres noches", 120, {
    editedAt: minutesAgo(119),
  });
  await say(withMateo.id, sofia.id, "Sos un capo. ¿Cuánto te transfiero?", 118);
  await say(withMateo.id, mateo.id, "47.500 cada uno", 115, { replyToId: love.id });
  // Deleted for everyone: the row survives with its body intact so replies that
  // quote it still resolve — `serializeWaMessage` blanks it on the way out.
  await say(withMateo.id, mateo.id, "Mi alias es matefer.mp", 60, {
    deletedAt: minutesAgo(58),
  });
  await say(withMateo.id, mateo.id, "Perdón, borré el anterior, tenía mal el alias 🙈", 12);
  await say(withMateo.id, mateo.id, "Te lo paso bien: mate.fernandez.mp", 10);
  await say(withMateo.id, mateo.id, "¿Te llamo a la noche?", 8);

  // One reaction per person per message — the unique on (messageId, userId).
  await prisma.waReaction.createMany({
    data: [
      { messageId: booked.id, userId: sofia.id, emoji: "🎉" },
      { messageId: love.id, userId: mateo.id, emoji: "❤️" },
    ],
  });
  // Starred: the cabin address, the one message worth finding again.
  await prisma.waMessageStar.create({
    data: { messageId: cabin.id, userId: sofia.id },
  });

  await member(withMateo.id, sofia.id, {
    lastReadAt: minutesAgo(20), // behind his last three → 3 unread
    pinnedAt: minutesAgo(4000),
  });
  await member(withMateo.id, mateo.id); // caught up
  await touch(withMateo.id);

  // ── Sofía ↔ Emma — fully read (blue ticks), with an unsent draft ───────────
  const withEmma = await directChat(sofia.id, emma.id);
  await say(withEmma.id, emma.id, "Hi Sofi! Quick question — is the design review still on for Thursday?", 400);
  await say(withEmma.id, sofia.id, "Hola Emma! Sí, jueves 3pm. Te mando el invite ahora", 398);
  await say(withEmma.id, emma.id, "Perfect, thanks 🙏", 395);
  const homework = await say(withEmma.id, emma.id, "Also — Spanish homework: ¿cómo se dice 'deadline'?", 390);
  await say(withEmma.id, sofia.id, "'Fecha límite'. Aunque en la oficina todos decimos 'deadline' igual 😄", 300, {
    replyToId: homework.id,
  });
  await say(withEmma.id, emma.id, "Of course you do 😂", 298);
  await say(withEmma.id, emma.id, "Ok, switching back to English before I hurt myself", 295);
  await say(withEmma.id, sofia.id, "You're doing great, en serio", 200);
  await say(withEmma.id, emma.id, "I'll take it. See you Thursday!", 198);
  await say(withEmma.id, sofia.id, "Emma, I moved the review to 4pm — does that still work?", 120);
  await say(withEmma.id, emma.id, "4pm works. I'll bring the Figma link.", 100);
  await say(withEmma.id, sofia.id, "Gracias! 🙌", 95);

  await member(withEmma.id, sofia.id, {
    lastReadAt: minutesAgo(90),
    draft: "Ah, y una cosa más: ¿invitamos a Nico a la review?",
  });
  await member(withEmma.id, emma.id, { lastReadAt: minutesAgo(90) });
  await touch(withEmma.id);

  // ── Sofía ↔ Nicolás — delivered but not read (grey double ticks) ───────────
  const withNico = await directChat(sofia.id, nico.id);
  await say(withNico.id, nico.id, "Sofi, ¿tenés el número del gasista?", 180);
  await say(withNico.id, sofia.id, "Sí, esperá que lo busco", 178);
  await say(withNico.id, sofia.id, "Rubén, 11 5555 0142. Decile que vas de mi parte", 175);
  await say(withNico.id, nico.id, "Gracias!! Se me apagó el calefón otra vez", 170);
  await say(withNico.id, nico.id, "Vino y me cobró 30 lucas la visita 😐", 120);
  await say(withNico.id, sofia.id, "Es lo que están cobrando ahora, lamentablemente", 118);
  await say(withNico.id, nico.id, "En fin. Después te cuento cómo sale", 90);
  await say(withNico.id, sofia.id, "¿Anduvo bien al final?", 45);
  await say(withNico.id, sofia.id, "Che, ¿vas al asado del sábado?", 40);
  await say(withNico.id, sofia.id, "Avisame así llevo carne para vos también 🥩", 38);

  await member(withNico.id, sofia.id);
  await member(withNico.id, nico.id, {
    lastDeliveredAt: minutesAgo(2), // his client is connected…
    lastReadAt: minutesAgo(60), // …but he hasn't opened the chat
  });
  await touch(withNico.id);

  // ── Sofía ↔ Olivia — archived, and read receipts are off on her side ───────
  const withOlivia = await directChat(sofia.id, olivia.id);
  await say(withOlivia.id, olivia.id, "Hey Sofía — it's Olivia from the pottery class 🙂", 6000);
  await say(withOlivia.id, sofia.id, "Olivia! Hola, te guardo el número", 5995);
  await say(withOlivia.id, olivia.id, "Are you going back next term?", 5990);
  await say(withOlivia.id, sofia.id, "Creo que sí, aunque el horario me complica", 5985);
  await say(withOlivia.id, olivia.id, "There's a Saturday morning slot now", 5900);
  await say(withOlivia.id, sofia.id, "Oh, that could actually work", 5895);
  await say(withOlivia.id, olivia.id, "I'll send you the link when they publish it", 5890);
  await say(withOlivia.id, sofia.id, "Perfecto, gracias!", 5880);
  await say(withOlivia.id, olivia.id, "No worries 👍", 5875);
  await say(withOlivia.id, sofia.id, "Hasta la próxima 👋", 5870);

  await member(withOlivia.id, sofia.id, { archivedAt: minutesAgo(4000) });
  await member(withOlivia.id, olivia.id);
  await touch(withOlivia.id);

  // ── Mateo ↔ Olivia — neither has saved the other ──────────────────────────
  // Both sides show the formatted phone number instead of a name, which is the
  // whole point of keeping this pair out of each other's address books.
  const marketplace = await directChat(mateo.id, olivia.id);
  await say(marketplace.id, olivia.id, "Hi, is the bike still available? Saw it on Marketplace", 600);
  await say(marketplace.id, mateo.id, "Hola! Yes, still available", 598);
  await say(marketplace.id, olivia.id, "Great. Is 180.000 negotiable?", 595);
  await say(marketplace.id, mateo.id, "I can do 165.000 if you pick it up this week", 590);
  await say(marketplace.id, olivia.id, "Deal. Where are you based?", 585);
  await say(marketplace.id, mateo.id, "Villa Crespo, Corrientes y Dorrego", 580);
  await say(marketplace.id, olivia.id, "Is Thursday evening ok?", 500);
  await say(marketplace.id, mateo.id, "Thursday 19:00 works", 495);
  await say(marketplace.id, olivia.id, "See you then 🚲", 490);
  await say(marketplace.id, mateo.id, "Dale 👍", 485);

  await member(marketplace.id, mateo.id);
  await member(marketplace.id, olivia.id);
  await touch(marketplace.id);

  // ── "Message yourself" ────────────────────────────────────────────────────
  // A DIRECT chat whose only member is Sofía. `directKeyFor(id, id)` is
  // "<id>:<id>" — the same key `findOrCreateDirectChat` computes when you tap
  // your own name in the contact picker.
  const notes = await directChat(sofia.id, sofia.id);
  await say(notes.id, sofia.id, "Cargar la SUBE antes del lunes", 900);
  await say(notes.id, sofia.id, "Idea de regalo para mamá: el mate que trajo Emma", 700);
  await say(notes.id, sofia.id, "Carbón, chimichurri y hielo para el sábado", 30);
  await member(notes.id, sofia.id);
  await touch(notes.id);

  // ── The group ─────────────────────────────────────────────────────────────
  console.log("Seeding the group…");
  const GROUP_SUBJECT = "Asado del sábado 🔥";
  // Fixed rather than `newInviteToken()`: a re-run shouldn't invalidate a link
  // you already pasted somewhere, and the demo invite URL stays stable at
  // /wpp/invite/seedAsadoDemoInvite01.
  const INVITE_TOKEN = "seedAsadoDemoInvite01";
  const groupData = {
    subject: GROUP_SUBJECT,
    description: "Sábado 21:30 en casa de Sofi. Traer algo para compartir 🍷",
    inviteToken: INVITE_TOKEN,
    onlyAdminsCanSend: false,
    onlyAdminsCanEditInfo: true,
  };
  // Groups have no natural unique key, so look one up by subject + creator
  // before creating — that pair is what makes this seed re-runnable.
  const existingGroup = await prisma.waChat.findFirst({
    where: { type: "GROUP", subject: GROUP_SUBJECT, createdById: sofia.id },
    select: { id: true },
  });
  const group = existingGroup
    ? await prisma.waChat.update({ where: { id: existingGroup.id }, data: groupData })
    : await prisma.waChat.create({
        data: { type: "GROUP", createdById: sofia.id, ...groupData },
      });
  await resetHistory(group.id);

  const createdAgo = 2880; // two days ago
  // The history starts the way every real group does: the creation event, then
  // the participants being added. Both are SYSTEM rows with no sender.
  await systemSay(group.id, "group.created", { actorId: sofia.id, actorName: sofia.name }, createdAgo);
  await systemSay(
    group.id,
    "member.added",
    {
      actorId: sofia.id,
      actorName: sofia.name,
      targets: [
        { id: mateo.id, name: mateo.name },
        { id: emma.id, name: emma.name },
        { id: nico.id, name: nico.name },
      ],
    },
    createdAgo - 1,
  );
  await say(group.id, sofia.id, "Bueno gente, sábado 21:30 en casa. Confirmen 🙋", 2870);
  await say(group.id, mateo.id, "Yo llevo la carne. ¿Somos 4 o cae alguien más?", 2865);
  const emmaIn = await say(group.id, emma.id, "I'm in! What should I bring?", 2860);
  await say(group.id, sofia.id, "Emma, traé el postre 🍰", 2855, { replyToId: emmaIn.id });
  await say(group.id, nico.id, "Yo pongo el vino y el carbón", 1440);
  await systemSay(
    group.id,
    "admin.granted",
    {
      actorId: sofia.id,
      actorName: sofia.name,
      targets: [{ id: mateo.id, name: mateo.name }],
    },
    1380,
  );
  await say(group.id, mateo.id, "Gracias por el ascenso 😎", 1370);
  await say(group.id, emma.id, "Sofi, what time exactly? 21:00 or 21:30?", 600);
  await say(group.id, sofia.id, "21:30 real, 21:00 hora argentina 😂", 595);
  await say(group.id, nico.id, "Confirmo que voy. ¿Alguien pasa por Palermo?", 120);
  await say(group.id, mateo.id, "Yo paso, te escribo", 100);

  const joined = minutesAgo(createdAgo);
  // Mateo's ADMIN role is the one the `admin.granted` message above records —
  // the timeline and the membership table have to agree.
  await member(group.id, sofia.id, {
    role: "ADMIN",
    joinedAt: joined,
    mutedUntil: new Date(NOW + MUTE_FOREVER_MS), // "mute always"
  });
  await member(group.id, mateo.id, { role: "ADMIN", joinedAt: joined });
  await member(group.id, emma.id, { joinedAt: joined });
  await member(group.id, nico.id, { joinedAt: joined });
  await touch(group.id);

  // ── Status (24 h) ─────────────────────────────────────────────────────────
  // No unique key to upsert on, so the demo rows are replaced wholesale — which
  // also refreshes `expiresAt` on every run instead of leaving stale, expired
  // statuses behind.
  console.log("Posting status updates…");
  const demoIds = Object.values(users).map((u) => u.id);
  await prisma.waStatus.deleteMany({ where: { userId: { in: demoIds } } });
  const expiresAt = new Date(NOW + STATUS_TTL_MS);
  const sofiaStatus = await prisma.waStatus.create({
    data: {
      userId: sofia.id,
      kind: "TEXT",
      body: "De vuelta en Buenos Aires ✈️",
      backgroundColor: STATUS_BACKGROUNDS[4],
      createdAt: minutesAgo(200),
      expiresAt,
    },
  });
  await prisma.waStatus.create({
    data: {
      userId: emma.id,
      kind: "TEXT",
      body: "Finally learning Spanish. Send help.",
      backgroundColor: STATUS_BACKGROUNDS[0],
      createdAt: minutesAgo(80),
      expiresAt,
    },
  });
  await prisma.waStatusView.create({
    data: { statusId: sofiaStatus.id, viewerId: mateo.id, viewedAt: minutesAgo(150) },
  });

  console.log("\nSeed complete ✅");
  console.log(`Sign in at /wpp with any of these numbers (password: ${PASSWORD}):`);
  for (const key of Object.keys(accounts) as AccountKey[]) {
    console.log(`  • ${users[key].phone}  ${users[key].name}`);
  }
  console.log("\nStart with Sofía — hers is the account the unread counts and");
  console.log("tick states were arranged around.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

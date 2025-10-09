// === IMPORTS & SETUP ======================================================
const { setGlobalOptions, logger } = require("firebase-functions/v2");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({
  region: "europe-west3",
  maxInstances: 10,
});

// === HELPER ===============================================================

// HTML → Plaintext
function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Emojis / Zero-Width / Diakritika weg → robustere Prüfung
const EMOJI_REGEX =
  /([\u2700-\u27BF]|[\uE000-\uF8FF]|[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]|\u24C2|[\u2B50\u23F0\u2764\uFE0F]|\p{Extended_Pictographic}|\p{Emoji_Component})/gu;

function normalizeForCheck(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/\u200B|\u200C|\u200D|\uFEFF/gu, "")
    .replace(EMOJI_REGEX, "")
    .toLowerCase();
}

// tolerantes Pattern (Leetspeak, Sonderzeichen, Punkte dazwischen)
function makeLoose(word) {
  const chars = [...word.toLowerCase()];
  const map = {
    a: "[a4@àáâäãåæ]",
    b: "[b8ß]",
    c: "[c(¢ćčç]",
    d: "[dð]",
    e: "[e3€èéêëę]",
    f: "[fƒ]",
    g: "[g9ğ]",
    h: "[h#]",
    i: "[i1!íìîïı|]",
    j: "[j]",
    k: "[kκ]",
    l: "[l1|ł]",
    m: "[mµ]",
    n: "[nñń]",
    o: "[o0°öóòôõøœ]",
    p: "[pþ]",
    q: "[q9]",
    r: "[r®]",
    s: "[s5$śš]",
    t: "[t7+†]",
    u: "[uüúùû]",
    v: "[v]",
    w: "[wvv]",
    x: "[x×✕]",
    y: "[yÿý]",
    z: "[z2žźż]",
  };
  const between = "[\\W_]*"; // erlaubte Trennzeichen
  const parts = chars.map((ch) =>
    map[ch] ? map[ch] + between : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + between
  );

  // Lockerere Ränder: erlaubt Buchstaben/Zahlen direkt davor/danach (z.B. superziganehaus)
  return new RegExp(`${parts.join("")}`, "i");
}

// Wörterlisten (Auszug – erweiterbar)
const INSULT_TERMS = [
  "fick dich", "fick", "hurensohn", "hurensohnkind", "hure", "fotze", "arschloch",
  "verpiss dich", "schlampe", "wixer", "wixxer", "missgeburt", "drecksau",
  "idiot", "depp", "dummkopf", "spast", "spasst", "behindert",
  "fuck you", "fuck", "asshole", "bitch", "slut", "cunt", "motherfucker", "dumbass",
  "kill yourself",
];

const HATE_SLUR_TERMS = [
  "zigeuner", "zigane", "gypsy",
  "nigger", "negro", "chink", "spic", "kike", "faggot",
  "raghead", "camel jockey",
];

// Final: Regexe bauen
const BAD_PATTERNS = [
  ...INSULT_TERMS.map(makeLoose),
  ...HATE_SLUR_TERMS.map(makeLoose),
];

function matchAny(text) {
  const hits = [];
  for (const rx of BAD_PATTERNS) {
    if (rx.test(text)) hits.push(rx.toString());
  }
  return hits;
}

function buildRawTextFromPost(post) {
  const tagsText = Array.isArray(post.tags) ? post.tags.join(" ") : "";
  return [
    post.title || "",
    post.bodyText || "",
    stripHtml(post.bodyHtml || post.html || ""),
    tagsText,
  ].join(" ");
}

// === AUTO-MODERATION: BEI REPORT =========================================
exports.autoModerateOnReport = onDocumentCreated(
  "posts/{postId}/reports/{reportId}",
  async (event) => {
    const { postId, reportId } = event.params;
    const report = event.data?.data() || {};

    const postRef = db.doc(`posts/${postId}`);
    const postSnap = await postRef.get();
    if (!postSnap.exists) {
      logger.warn("Post nicht gefunden für Report", { postId, reportId });
      return;
    }
    const post = postSnap.data() || {};

    const rawText = buildRawTextFromPost(post);
    const plain = normalizeForCheck(rawText);

    const reason = String(report.reason || "").toLowerCase();
    const matches = matchAny(plain);
    const reasonHintsInsult =
      reason.includes("beleidig") || reason.includes("insult") || reason.includes("hate");

    const shouldRemove = matches.length > 0 || reasonHintsInsult;

    if (shouldRemove) {
      await postRef.set(
        {
          removed: true,
          removedAt: admin.firestore.FieldValue.serverTimestamp(),
          moderation: {
            status: "removed",
            decidedBy: "auto",
            decidedAt: admin.firestore.FieldValue.serverTimestamp(),
            reportId,
            reasonDetected: matches.length ? "insult_or_slur" : "reason_hint_only",
            patternHits: matches,
          },
        },
        { merge: true }
      );

      await db.doc(`posts/${postId}/reports/${reportId}`).set(
        {
          status: "resolved_auto",
          resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      logger.info("✅ Post auto-removed (report)", { postId, matches });
    } else {
      await postRef.set(
        {
          moderation: {
            status: "needs_review",
            decidedBy: "auto",
            decidedAt: admin.firestore.FieldValue.serverTimestamp(),
            reportId,
            reasonDetected: "none",
          },
        },
        { merge: true }
      );
      logger.info("⚠️ Post nur geflaggt (report)", { postId });
    }
  }
);

// === AUTO-MODERATION: BEI ERSTELLUNG =====================================
exports.autoModerateOnPostCreate = onDocumentCreated(
  "posts/{postId}",
  async (event) => {
    const { postId } = event.params;
    const post = event.data?.data() || {};

    const rawText = buildRawTextFromPost(post);
    const plain = normalizeForCheck(rawText);
    const matches = matchAny(plain);

    if (matches.length > 0) {
      await db.doc(`posts/${postId}`).set(
        {
          removed: true,
          removedAt: admin.firestore.FieldValue.serverTimestamp(),
          moderation: {
            status: "removed",
            decidedBy: "auto",
            decidedAt: admin.firestore.FieldValue.serverTimestamp(),
            reportId: "system",
            reasonDetected: "insult_or_slur",
            patternHits: matches,
          },
        },
        { merge: true }
      );
      logger.info("✅ Post auto-removed (create)", { postId, matches });
    } else {
      await db.doc(`posts/${postId}`).set(
        {
          moderation: {
            status: "clean",
            decidedBy: "auto",
            decidedAt: admin.firestore.FieldValue.serverTimestamp(),
            reportId: "system",
            reasonDetected: "none",
          },
        },
        { merge: true }
      );
    }
  }
);

// === ADMIN SLASH COMMANDS =================================================
exports.adminSlash = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Nicht eingeloggt.");

  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Keine Berechtigung.");
  }

  const raw = String(req.data?.command || "").trim();
  if (!raw.startsWith("/")) return { message: "❓ Kein Command erkannt." };

  const [cmd, ...args] = raw.split(/\s+/);
  switch (cmd.toLowerCase()) {
    case "/clearchat":
      await clearChat();
      return { message: "✅ Chat geleert." };

    case "/deletethread":
    case "/deletepost": {
      const id = args[0];
      if (!id) return { message: "⚠️ usage: /deleteThread <thread_id>" };
      await deleteThread(id);
      return { message: `🗑️ Thread ${id} gelöscht.` };
    }

    case "/muteuser": {
      const who = args[0];
      const dur = args[1] || "30m";
      if (!who) return { message: "⚠️ usage: /muteUser <username|uid> [dauer]" };
      const ms = parseDuration(dur);
      if (ms <= 0) return { message: "⚠️ Ungültige Dauer." };
      const untilTs = Date.now() + ms;
      const updated = await muteUser(who, untilTs);
      if (!updated) return { message: "⚠️ User nicht gefunden." };
      return { message: `🔇 ${updated} bis ${new Date(untilTs).toLocaleString()}` };
    }

    case "/maintenance": {
      const scope = (args[0] || "all").toLowerCase();
      const stateArg = (args[1] || "on").toLowerCase();
      const state = stateArg === "off" ? false : true;
      if (!["all", "forum", "ai", "docs"].includes(scope)) {
        return { message: "⚠️ usage: /maintenance <all|forum|ai|docs> [on|off]" };
      }
      await setMaintenance(scope, state);
      return { message: `🛠 Maintenance ${scope}: ${state ? "ON" : "OFF"}` };
    }

    case "/log": {
      const limit = Number(args[0]) || 25;
      const logs = await getLastMessages(limit);
      return { message: "🧾 Log:\n" + logs.join("\n") };
    }

    default:
      return { message: `❓ Unbekannter Befehl: ${cmd}` };
  }
});

// === SLASH-HELPERS ========================================================
async function clearChat() {
  const snap = await db.collection("chatMessages").limit(500).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

async function deleteThread(threadId) {
  const ref = db.collection("threads").doc(threadId);
  const snap = await ref.get();
  if (!snap.exists) return;
  await ref.set(
    { deleted: true, deletedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

async function muteUser(usernameOrUid, untilTs) {
  // UID?
  if (/^[A-Za-z0-9_-]{20,}$/.test(usernameOrUid)) {
    const docu = await db.collection("users").doc(usernameOrUid).get();
    if (docu.exists) {
      await docu.ref.set({ mutedUntil: untilTs }, { merge: true });
      return docu.data()?.username || usernameOrUid;
    }
  }
  // Username
  const q = await db.collection("users").where("username", "==", usernameOrUid).limit(1).get();
  if (q.empty) return null;
  const doce = q.docs[0];
  await doce.ref.set({ mutedUntil: untilTs }, { merge: true });
  return doce.data()?.username || doce.id;
}

async function setMaintenance(scope, on) {
  await db
    .collection("system")
    .doc("maintenance")
    .set({ [scope]: on, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

async function getLastMessages(n) {
  const snap = await db.collection("chatMessages").orderBy("timestamp", "desc").limit(n).get();
  return snap.docs.reverse().map((d) => {
    const x = d.data();
    const t = x.timestamp?.toDate ? x.timestamp.toDate().toLocaleTimeString() : "";
    return `[${t}] ${x.author}: ${x.text}`;
  });
}

function parseDuration(s) {
  const m = String(s).trim().match(/^(\d+)([smhd])?$/i);
  if (!m) return 0;
  const val = parseInt(m[1], 10);
  const unit = (m[2] || "m").toLowerCase();
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return val * (multipliers[unit] || 0);
}
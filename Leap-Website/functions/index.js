// === IMPORTS & SETUP ======================================================
const { setGlobalOptions, logger } = require("firebase-functions/v2");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({
  region: "europe-west3",
  maxInstances: 10,
});

// === HELFER: TEXT-AUFBAU & NORMALISIERUNG ================================

// HTML → Plaintext
function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Alle Strings aus einem Objekt einsammeln (auch verschachtelt)
function collectStringsDeep(obj, out = []) {
  if (!obj || typeof obj !== "object") return out;
  for (const v of Object.values(obj)) {
    if (v == null) continue;
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) {
      v.forEach((x) =>
        typeof x === "string" ? out.push(x) : collectStringsDeep(x, out)
      );
    } else if (typeof v === "object") {
      collectStringsDeep(v, out);
    }
  }
  return out;
}

function buildRawTextFromPost(post) {
  const chunks = collectStringsDeep(post).map((s) => stripHtml(s));
  return chunks.join(" ");
}

// Emojis raus (Unicode-Property nötig: /u-Flag ist gesetzt)
const EMOJI_REGEX =
  /([\u2700-\u27BF]|[\uE000-\uF8FF]|[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]|\u24C2|\p{Extended_Pictographic})/gu;

function normalizeForCheck(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}+/gu, "") // ä -> a, é -> e
    .replace(/\u200B|\u200C|\u200D|\uFEFF/gu, "") // Zero-width
    .replace(EMOJI_REGEX, "") // Emojis weg
    .toLowerCase(); // WICHTIG: keine Ziffern entfernen!
}

// Leetspeak-Map → nur a-z0-9 behalten → lange Wiederholungen kürzen
function canonicalizeSqueezed(text) {
  const map = {
    "@": "a",
    "4": "a",
    "à": "a",
    "á": "a",
    "â": "a",
    "ä": "a",
    "ã": "a",
    "å": "a",
    "€": "e",
    "3": "e",
    "è": "e",
    "é": "e",
    "ê": "e",
    "ë": "e",
    "1": "i",
    "!": "i",
    "|": "i",
    "ì": "i",
    "í": "i",
    "î": "i",
    "ï": "i",
    "0": "o",
    "°": "o",
    "ò": "o",
    "ó": "o",
    "ô": "o",
    "õ": "o",
    "ö": "o",
    "$": "s",
    "5": "s",
    "7": "t",
    "+": "t",
    "ß": "ss",
  };
  const base = normalizeForCheck(text).replace(/./g, (ch) => map[ch] ?? ch);
  const only = base.replace(/[^a-z0-9]/g, "");
  return only.replace(/([a-z0-9])\1+/g, "$1");
}

// Lockere Regex: erlaubt beliebige Non-Word-Zeichen + bis zu 4 extra Buchstaben/Ziffern
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
    w: "[w]",
    x: "[x×✕]",
    y: "[yÿý]",
    z: "[z2žźż]",
  };

  const between = "(?:[^a-z0-9]*[a-z0-9]{0,4})?";

  const parts = chars.map(
    (ch) =>
      (map[ch] ?? ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) + between
  );

  return new RegExp(parts.join(""), "iu");
}

// === BAD-WORD-LISTEN ======================================================

const INSULT_TERMS = [
  "fick dich",
  "fick",
  "hurensohn",
  "hurensohnkind",
  "hure",
  "fotze",
  "arschloch",
  "verpiss dich",
  "schlampe",
  "wixer",
  "wixxer",
  "missgeburt",
  "drecksau",
  "idiot",
  "depp",
  "dummkopf",
  "spast",
  "spasst",
  "behindert",
  "fuck you",
  "fuck",
  "asshole",
  "bitch",
  "slut",
  "cunt",
  "motherfucker",
  "dumbass",
  "kill yourself",
];

const HATE_SLUR_TERMS = [
  "zigeuner",
  "zigane",
  "gypsy",
  "nigger",
  "negro",
  "chink",
  "spic",
  "kike",
  "faggot",
  "raghead",
  "camel jockey",
];

// Vorberechnet: Regex + „squeezed“-Needle
const BAD_LEXEMES = [...INSULT_TERMS, ...HATE_SLUR_TERMS].map((term) => {
  const squeezed = canonicalizeSqueezed(term).replace(/\s+/g, "");
  return { term, rx: makeLoose(term), squeezed };
});

// 2-Wege-Check
function matchAny(text) {
  const plain = normalizeForCheck(text);
  const squeezed = canonicalizeSqueezed(text);
  const hits = [];

  for (const { term, rx, squeezed: needle } of BAD_LEXEMES) {
    if (rx.test(plain)) {
      hits.push(term);
      continue;
    }
    if (needle && squeezed.includes(needle)) {
      hits.push(term);
    }
  }

  return Array.from(new Set(hits));
}

// Helper: neueste Posts holen, robust mit Fallback falls createdAt fehlt
async function getRecentPosts(limit) {
  try {
    return await db
      .collection("posts")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
  } catch (e) {
    logger.warn("createdAt ordering failed – falling back to __name__", e);
    return await db
      .collection("posts")
      .orderBy(admin.firestore.FieldPath.documentId(), "desc")
      .limit(limit)
      .get();
  }
}

// Gleiche Logik wie im Frontend: 6-stellige Kurz-ID aus Doc-ID
function computeShortIdFromDocId(docId) {
  let hash = 0;
  const src = String(docId || "");
  for (let i = 0; i < src.length; i++) {
    hash = (hash * 31 + src.charCodeAt(i)) >>> 0;
  }
  const num = hash % 1_000_000; // 0–999999
  return num; // Number
}

// Tags aus einem Post ins "tags"-Verzeichnis hochzählen
async function updateTagStatsFromPost(post) {
  const tags = Array.isArray(post.tags) ? post.tags : [];
  if (!tags.length) return;

  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();

  for (const rawTag of tags) {
    const tag = String(rawTag || "").trim().toLowerCase();
    if (!tag) continue;

    const hits = matchAny(tag);
    if (hits.length > 0) {
      logger.warn("Tag verworfen wegen beleidigendem Inhalt", { tag, hits });
      continue;
    }

    const ref = db.collection("tags").doc(tag);

    batch.set(
      ref,
      {
        name: tag,
        count: admin.firestore.FieldValue.increment(1),
        updatedAt: now,
        createdAt: now,
      },
      { merge: true }
    );
  }

  await batch.commit();
}

// === AUTO-MODERATION: BEI REPORT =========================================
exports.autoModerateOnReport = onDocumentCreated(
  "posts/{postId}/reports/{reportId}",
  async (event) => {
    const { postId, reportId } = event.params;

    const postRef = db.doc(`posts/${postId}`);
    const postSnap = await postRef.get();
    if (!postSnap.exists) {
      logger.warn("Post nicht gefunden für Report", { postId, reportId });
      return;
    }

    const post = postSnap.data() || {};
    const rawText = buildRawTextFromPost(post);
    const matches = matchAny(rawText);

    const report = event.data?.data() || {};
    const reason = String(report.reason || "").toLowerCase();
    const reasonHintsInsult =
      reason.includes("beleidig") ||
      reason.includes("insult") ||
      reason.includes("hate");

    const shouldRemove = matches.length > 0;

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
            reasonDetected: "insult_or_slur",
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
          removed: false,
          moderation: {
            status: reasonHintsInsult ? "needs_review" : "review_pending",
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

    // Bereits moderiert? (z. B. Seeder)
    if (post?.moderation?.status) {
      logger.info("Skip: already moderated", { postId });
      return;
    }

    // 🔹 Ban-Check für Threads
    if (post.authorUid) {
      try {
        const userSnap = await db
          .collection("users")
          .doc(post.authorUid)
          .get();
        if (userSnap.exists) {
          const userData = userSnap.data() || {};
          const bannedObj = userData.banned || {};
          const bannedActive = !!bannedObj.active;
          const bannedUntil = bannedObj.until;
          const nowMs = Date.now();

          const bannedUntilNum =
            typeof bannedUntil === "number"
              ? bannedUntil
              : bannedUntil && bannedUntil.toMillis
              ? bannedUntil.toMillis()
              : null;

          const bannedStillActive =
            bannedActive && (!bannedUntilNum || bannedUntilNum > nowMs);

          if (bannedStillActive) {
            await db.doc(`posts/${postId}`).set(
              {
                removed: true,
                removedAt: admin.firestore.FieldValue.serverTimestamp(),
                moderation: {
                  status: "removed",
                  decidedBy: "auto",
                  decidedAt: admin.firestore.FieldValue.serverTimestamp(),
                  reportId: "system",
                  reasonDetected: "banned_user",
                  patternHits: [],
                },
              },
              { merge: true }
            );
            logger.warn("Post auto-removed (banned user)", {
              postId,
              authorUid: post.authorUid,
            });
            return;
          }
        }
      } catch (e) {
        logger.warn("could not load user for post moderation", {
          postId,
          e,
        });
      }
    }

    // createdAt nachziehen (hilft für Rechecks/Sortierung)
    if (!post.createdAt) {
      try {
        await db.doc(`posts/${postId}`).set(
          { createdAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
      } catch (e) {
        logger.warn("could not set createdAt", { postId, e });
      }
    }

    // Leichtes Rate-Limit (10s zwischen Posts desselben Users)
    try {
      if (post.authorUid) {
        const uref = db.collection("users").doc(post.authorUid);
        const usnap = await uref.get();
        const now = Date.now();
        const last =
          usnap.exists && typeof usnap.data().lastPostAt === "number"
            ? usnap.data().lastPostAt
            : 0;

        if (now - Number(last) < 10_000) {
          await db.doc(`posts/${postId}`).set(
            {
              removed: true,
              removedAt: admin.firestore.FieldValue.serverTimestamp(),
              moderation: {
                status: "removed",
                decidedBy: "auto",
                decidedAt: admin.firestore.FieldValue.serverTimestamp(),
                reportId: "system",
                reasonDetected: "rate_limit",
              },
            },
            { merge: true }
          );
          logger.warn("Post auto-removed (rate_limit)", {
            postId,
            authorUid: post.authorUid,
          });
          return;
        }
        await uref.set({ lastPostAt: now }, { merge: true });
      }
    } catch (e) {
      logger.warn("rate-limit check failed (ignored)", e);
    }

    const rawText = buildRawTextFromPost(post);
    const matches = matchAny(rawText);

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
          removed: false,
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

      try {
        await updateTagStatsFromPost(post);
      } catch (e) {
        logger.warn("updateTagStatsFromPost failed", { postId, e });
      }

      logger.info("👌 Post clean (create)", { postId });
    }
  }
);

// === AUTO-MODERATION: LIVECHAT (nur Ban/Mute) =============================
exports.autoModerateChat = onDocumentCreated(
  "chatMessages/{msgId}",
  async (event) => {
    const { msgId } = event.params;
    const data = event.data?.data() || {};

    const uid = data.uid;
    const text = String(data.text || "").trim();

    if (!uid || !text) {
      return;
    }

    const nowMs = Date.now();
    const nowTs = admin.firestore.Timestamp.now();
    const msgRef = event.data.ref;

    const userRef = db.collection("users").doc(uid);
    let userData = null;

    try {
      const userSnap = await userRef.get();
      if (userSnap.exists) {
        userData = userSnap.data() || {};
      }
    } catch (e) {
      logger.warn("could not load user for chat moderation", { uid, e });
    }

    let bannedStillActive = false;
    let mutedStillActive = false;

    if (userData) {
      const bannedObj = userData.banned || {};
      const bannedActive = !!bannedObj.active;
      const bannedUntil = bannedObj.until;

      const bannedUntilNum =
        typeof bannedUntil === "number"
          ? bannedUntil
          : bannedUntil && bannedUntil.toMillis
          ? bannedUntil.toMillis()
          : null;

      bannedStillActive =
        bannedActive && (!bannedUntilNum || bannedUntilNum > nowMs);

      if (userData.mutedPermanent) {
        mutedStillActive = true;
      } else if (
        typeof userData.mutedUntil === "number" &&
        userData.mutedUntil > nowMs
      ) {
        mutedStillActive = true;
      }
    }

    if (bannedStillActive || mutedStillActive) {
      await msgRef.set(
        {
          removed: true,
          removedAt: nowTs,
          moderation: {
            status: "removed",
            decidedBy: "chat_auto",
            decidedAt: nowTs,
            reasonDetected: bannedStillActive ? "banned_user" : "muted_user",
            patternHits: [],
            spam: {
              rate: false,
              repeat: false,
            },
          },
        },
        { merge: true }
      );

      logger.warn("💬 Chat-Nachricht geblockt (Ban/Mute aktiv)", {
        msgId,
        uid,
        bannedStillActive,
        mutedStillActive,
      });

      return;
    }

    // ❗ Keine Spam-/Insult-Logik mehr im Chat → alles andere ist clean
    await msgRef.set(
      {
        removed: false,
        moderation: {
          status: "clean",
          decidedBy: "chat_auto",
          decidedAt: nowTs,
          reasonDetected: "none",
          patternHits: [],
        },
      },
      { merge: true }
    );

    logger.info("💬 Chat-Message als clean markiert", {
      msgId,
      uid,
      text,
    });
  }
);

// === ADMIN SLASH COMMANDS ================================================
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

    case "/delete":
    case "/deletethread":
    case "/deletepost": {
      const rawId = args[0];
      if (!rawId) {
        return { message: "⚠️ usage: /delete <postId|#shortId>" };
      }

      let deletedId = null;

      if (rawId.startsWith("#")) {
        const short = rawId.slice(1);
        const res = await deleteThreadByShortId(short);
        if (!res) {
          return { message: `⚠️ Kein Thread mit Kurz-ID #${short} gefunden.` };
        }
        deletedId = res;
      } else {
        const ok = await deleteThread(rawId);
        if (!ok) {
          return { message: `⚠️ Thread ${rawId} nicht gefunden.` };
        }
        deletedId = rawId;
      }

      return { message: `🗑️ Thread ${deletedId} gelöscht.` };
    }

    case "/mute": {
      const username = args[0];
      if (!username) {
        return {
          message:
            "⚠️ usage: /mute <username> [dauer] [grund...]\n" +
            "Beispiele:\n" +
            "  /mute Luka 5min Spam\n" +
            "  /mute Luka 1h Beleidigungen\n" +
            "  /mute Luka           (permanent)",
        };
      }

      let durationArg = args[1];
      let reasonStartIndex = 2;
      let untilTs = null;
      let durationLabel = "permanent";

      if (durationArg) {
        const ms = parseDuration(durationArg);
        if (ms <= 0) {
          durationArg = null;
          reasonStartIndex = 1;
        } else {
          untilTs = Date.now() + ms;
          durationLabel = durationArg;
        }
      } else {
        reasonStartIndex = 1;
      }

      const reason = args.slice(reasonStartIndex).join(" ") || null;
      const adminName = userDoc.data()?.username || "Admin";

      const updatedName = await muteUser(
        username,
        untilTs,
        uid,
        adminName,
        reason
      );

      if (!updatedName) {
        return { message: "⚠️ User nicht gefunden." };
      }

      return {
        message:
          `🔇 ${updatedName} wurde ` +
          (untilTs ? `für ${durationLabel}` : "permanent") +
          " gemutet" +
          (reason ? ` (Grund: ${reason})` : "") +
          ".",
      };
    }

    case "/unmute": {
      const username = args[0];
      if (!username) {
        return {
          message: "⚠️ usage: /unmute <username>",
        };
      }

      const updated = await unmuteUser(username);
      if (!updated) {
        return { message: "⚠️ User nicht gefunden." };
      }
      return { message: `🔊 ${updated} wurde entmutet.` };
    }

    case "/maintenance": {
      const scope = (args[0] || "all").toLowerCase();
      const stateArg = (args[1] || "on").toLowerCase();
      const state = stateArg === "off" ? false : true;
      if (!["all", "forum", "ai", "docs"].includes(scope)) {
        return {
          message: "⚠️ usage: /maintenance <all|forum|ai|docs> [on|off]",
        };
      }
      await setMaintenance(scope, state);
      return {
        message: `🛠 Maintenance ${scope}: ${state ? "ON" : "OFF"}`,
      };
    }

    case "/ban": {
      const username = args[0];
      if (!username) {
        return {
          message:
            "⚠️ usage: /ban <username> [dauer] [grund...]\n" +
            "Beispiele:\n" +
            "  /ban Luka 5min Spam\n" +
            "  /ban Luka 1h Beleidigungen\n" +
            "  /ban Luka = perma Trollerei",
        };
      }

      let durationArg = args[1];
      let reasonStartIndex = 2;
      let untilTs = null;
      let durationLabel = "permanent";

      if (durationArg === "=" && args[2]?.toLowerCase() === "perma") {
        untilTs = null;
        durationLabel = "permanent";
        reasonStartIndex = 3;
      } else if (durationArg) {
        const ms = parseDuration(durationArg);
        if (ms <= 0) {
          durationArg = null;
          reasonStartIndex = 1;
        } else {
          untilTs = Date.now() + ms;
          durationLabel = durationArg;
        }
      } else {
        reasonStartIndex = 1;
      }

      const reason =
        args.slice(reasonStartIndex).join(" ") || "Kein Grund angegeben";
      const adminName = userDoc.data()?.username || "Admin";

      const updatedName = await banUser(
        username,
        untilTs,
        uid,
        adminName,
        reason
      );

      if (!updatedName) {
        return { message: "⚠️ User nicht gefunden." };
      }

      return {
        message:
          `⛔ ${updatedName} wurde ` +
          (untilTs ? `für ${durationLabel}` : "permanent") +
          " gebannt" +
          (reason ? ` (Grund: ${reason})` : "") +
          ".",
      };
    }

    case "/unban": {
      const username = args[0];
      if (!username) {
        return { message: "⚠️ usage: /unban <username>" };
      }

      const updated = await unbanUser(username);
      if (!updated) {
        return { message: "⚠️ User nicht gefunden." };
      }
      return { message: `✅ ${updated} wurde entbannt.` };
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

// === ADMIN: TEXT-TEST (manuelle Prüfung) ==================================
exports.testText = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Nicht eingeloggt.");

  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Keine Berechtigung.");
  }

  const text = String(req.data?.text || "");
  const plain = normalizeForCheck(text);
  const squeezed = canonicalizeSqueezed(text);
  const matches = matchAny(text);

  return {
    version: "bw-v2",
    matches,
    plain,
    squeezed,
  };
});

// === RECHECK (letzte N Posts) ============================================
exports.recheckRecentPosts = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Nicht eingeloggt.");

  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Keine Berechtigung.");
  }

  const limit = Number(req.data?.limit || 50);
  const snap = await getRecentPosts(limit);

  let removed = 0,
    flagged = 0,
    clean = 0;
  let batch = db.batch();
  let ops = 0;

  for (const docSnap of snap.docs) {
    const p = docSnap.data() || {};
    const rawText = buildRawTextFromPost(p);
    const matches = matchAny(rawText);

    if (matches.length > 0) {
      batch.set(
        docSnap.ref,
        {
          removed: true,
          removedAt: admin.firestore.FieldValue.serverTimestamp(),
          moderation: {
            status: "removed",
            decidedBy: "recheck",
            decidedAt: admin.firestore.FieldValue.serverTimestamp(),
            reportId: "system_recheck",
            reasonDetected: "insult_or_slur",
            patternHits: matches,
          },
        },
        { merge: true }
      );
      removed++;
      ops++;
    } else {
      if (
        !p?.moderation?.status ||
        ["review_pending", "needs_review"].includes(p.moderation.status)
      ) {
        batch.set(
          docSnap.ref,
          {
            removed: false,
            moderation: {
              status: "clean",
              decidedBy: "recheck",
              decidedAt: admin.firestore.FieldValue.serverTimestamp(),
              reportId: "system_recheck",
              reasonDetected: "none",
            },
          },
          { merge: true }
        );
        clean++;
        ops++;
      } else {
        flagged++;
      }
    }

    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();

  logger.info("🔁 RecheckRecent done", {
    removed,
    flagged,
    clean,
    scanned: snap.size,
  });
  return { removed, flagged, clean, scanned: snap.size };
});

// === OPTIONAL: RECHECK ALLE POSTS (Paging über gesamte Collection) ========
exports.recheckAllPosts = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Nicht eingeloggt.");

  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Keine Berechtigung.");
  }

  const pageSize = Number(req.data?.pageSize || 300);
  let lastDoc = null;
  let totalRemoved = 0,
    totalClean = 0,
    totalScanned = 0;

  while (true) {
    let q = db
      .collection("posts")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageSize);

    if (lastDoc) q = q.startAfter(lastDoc.id);
    const snap = await q.get();
    if (snap.empty) break;

    let batch = db.batch();
    let ops = 0;

    for (const docSnap of snap.docs) {
      const p = docSnap.data() || {};
      const rawText = buildRawTextFromPost(p);
      const matches = matchAny(rawText);

      if (matches.length > 0) {
        batch.set(
          docSnap.ref,
          {
            removed: true,
            removedAt: admin.firestore.FieldValue.serverTimestamp(),
            moderation: {
              status: "removed",
              decidedBy: "recheck_all",
              decidedAt: admin.firestore.FieldValue.serverTimestamp(),
              reportId: "system_recheck_all",
              reasonDetected: "insult_or_slur",
              patternHits: matches,
            },
          },
          { merge: true }
        );
        totalRemoved++;
        ops++;
      } else if (
        !p?.moderation?.status ||
        ["review_pending", "needs_review"].includes(p.moderation.status)
      ) {
        batch.set(
          docSnap.ref,
          {
            removed: false,
            moderation: {
              status: "clean",
              decidedBy: "recheck_all",
              decidedAt: admin.firestore.FieldValue.serverTimestamp(),
              reportId: "system_recheck_all",
              reasonDetected: "none",
            },
          },
          { merge: true }
        );
        totalClean++;
        ops++;
      }

      totalScanned++;

      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }

    if (ops > 0) await batch.commit();
    lastDoc = snap.docs[snap.docs.length - 1];
  }

  logger.info("🧹 RecheckAll done", {
    totalRemoved,
    totalClean,
    totalScanned,
  });
  return {
    removed: totalRemoved,
    clean: totalClean,
    scanned: totalScanned,
  };
});

// === SCHEDULED RECHECK (alle 12h) =========================================
exports.recheckRecentPostsScheduled = onSchedule(
  { schedule: "every 12 hours", timeZone: "Europe/Vienna" },
  async () => {
    const snap = await getRecentPosts(50);

    let removed = 0,
      clean = 0;
    let batch = db.batch();
    let ops = 0;

    for (const docSnap of snap.docs) {
      const p = docSnap.data() || {};
      const rawText = buildRawTextFromPost(p);
      const matches = matchAny(rawText);

      if (matches.length > 0) {
        batch.set(
          docSnap.ref,
          {
            removed: true,
            removedAt: admin.firestore.FieldValue.serverTimestamp(),
            moderation: {
              status: "removed",
              decidedBy: "recheck_scheduled",
              decidedAt: admin.firestore.FieldValue.serverTimestamp(),
              reportId: "system_recheck",
              reasonDetected: "insult_or_slur",
              patternHits: matches,
            },
          },
          { merge: true }
        );
        removed++;
        ops++;
      } else if (
        !p?.moderation?.status ||
        ["review_pending", "needs_review"].includes(p.moderation.status)
      ) {
        batch.set(
          docSnap.ref,
          {
            removed: false,
            moderation: {
              status: "clean",
              decidedBy: "recheck_scheduled",
              decidedAt: admin.firestore.FieldValue.serverTimestamp(),
              reportId: "system_recheck",
              reasonDetected: "none",
            },
          },
          { merge: true }
        );
        clean++;
        ops++;
      }

      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }

    if (ops > 0) await batch.commit();
    logger.info("⏲️ Scheduled recheck done", {
      removed,
      clean,
      scanned: snap.size,
    });
  }
);

// === BACKFILL SHORT IDS ===================================================
exports.backfillShortIds = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Nicht eingeloggt.");
  }

  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Keine Berechtigung.");
  }

  const pageSize = Number(req.data?.pageSize || 300);

  let lastDoc = null;
  let updated = 0;
  let skipped = 0;
  let scanned = 0;

  while (true) {
    let q = db
      .collection("posts")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageSize);

    if (lastDoc) {
      q = q.startAfter(lastDoc.id);
    }

    const snap = await q.get();
    if (snap.empty) break;

    let batch = db.batch();
    let ops = 0;

    for (const docSnap of snap.docs) {
      scanned++;
      const data = docSnap.data() || {};

      if (
        data.shortId !== undefined &&
        data.shortId !== null &&
        data.shortId !== ""
      ) {
        skipped++;
        continue;
      }

      const shortId = computeShortIdFromDocId(docSnap.id);

      batch.set(
        docSnap.ref,
        { shortId },
        { merge: true }
      );
      updated++;
      ops++;

      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }

    if (ops > 0) {
      await batch.commit();
    }

    lastDoc = snap.docs[snap.docs.length - 1];
  }

  logger.info("backfillShortIds DONE", { updated, skipped, scanned });
  return { updated, skipped, scanned };
});

// === SLASH-HELPERS ========================================================
async function clearChat() {
  const snap = await db.collection("chatMessages").limit(500).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

async function deleteThread(threadId) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  let didSomething = false;

  const collections = ["posts", "threads"];
  for (const col of collections) {
    const ref = db.collection(col).doc(threadId);
    const snap = await ref.get();
    if (!snap.exists) continue;

    const existingMod = snap.data()?.moderation || {};

    await ref.set(
      {
        deleted: true,
        removed: true,
        deletedAt: now,
        removedAt: now,
        moderation: {
          ...existingMod,
          status: "removed",
          decidedBy: "admin",
          decidedAt: now,
          reportId: "admin_delete",
          reasonDetected: "admin_manual",
        },
      },
      { merge: true }
    );

    didSomething = true;
  }

  return didSomething;
}

async function deleteThreadByShortId(shortIdInput) {
  const raw = String(shortIdInput).replace(/^#/, "").trim();
  const padded = raw.padStart(6, "0");
  const num = Number(raw);

  let q = null;

  q = await db
    .collection("posts")
    .where("shortId", "==", padded)
    .limit(1)
    .get();

  if (q.empty && raw !== padded) {
    q = await db
      .collection("posts")
      .where("shortId", "==", raw)
      .limit(1)
      .get();
  }

  if (q.empty && Number.isFinite(num)) {
    q = await db
      .collection("posts")
      .where("shortId", "==", num)
      .limit(1)
      .get();
  }

  if (q.empty) return null;

  const docSnap = q.docs[0];
  const now = admin.firestore.FieldValue.serverTimestamp();
  const existingMod = docSnap.data()?.moderation || {};

  await docSnap.ref.set(
    {
      deleted: true,
      removed: true,
      deletedAt: now,
      removedAt: now,
      moderation: {
        ...existingMod,
        status: "removed",
        decidedBy: "admin",
        decidedAt: now,
        reportId: "admin_delete",
        reasonDetected: "admin_manual",
      },
    },
    { merge: true }
  );

  return docSnap.id;
}

async function muteUser(usernameOrUid, untilTs, byUid, byName, reason) {
  const payloadBase = {
    mutedAt: admin.firestore.FieldValue.serverTimestamp(),
    mutedBy: byUid || null,
    mutedByName: byName || null,
    muteReason: reason || null,
  };

  if (/^[A-Za-z0-9_-]{20,}$/.test(usernameOrUid)) {
    const docu = await db.collection("users").doc(usernameOrUid).get();
    if (docu.exists) {
      await docu.ref.set(
        {
          ...payloadBase,
          mutedUntil: untilTs === null ? null : untilTs,
          mutedPermanent: untilTs === null,
        },
        { merge: true }
      );
      return docu.data()?.username || usernameOrUid;
    }
  }

  const q = await db
    .collection("users")
    .where("username", "==", usernameOrUid)
    .limit(1)
    .get();

  if (q.empty) return null;

  const doce = q.docs[0];
  await doce.ref.set(
    {
      ...payloadBase,
      mutedUntil: untilTs === null ? null : untilTs,
      mutedPermanent: untilTs === null,
    },
    { merge: true }
  );
  return doce.data()?.username || doce.id;
}

async function unmuteUser(usernameOrUid) {
  if (/^[A-Za-z0-9_-]{20,}$/.test(usernameOrUid)) {
    const docu = await db.collection("users").doc(usernameOrUid).get();
    if (docu.exists) {
      await docu.ref.set(
        {
          mutedUntil: null,
          mutedPermanent: false,
          muteReason: null,
          mutedBy: null,
          mutedByName: null,
        },
        { merge: true }
      );
      return docu.data()?.username || usernameOrUid;
    }
  }

  const q = await db
    .collection("users")
    .where("username", "==", usernameOrUid)
    .limit(1)
    .get();

  if (q.empty) return null;

  const doce = q.docs[0];
  await doce.ref.set(
    {
      mutedUntil: null,
      mutedPermanent: false,
      muteReason: null,
      mutedBy: null,
      mutedByName: null,
    },
    { merge: true }
  );
  return doce.data()?.username || doce.id;
}

async function banUser(usernameOrUid, untilTs, byUid, byName, reason) {
  const payloadBase = {
    bannedAt: admin.firestore.FieldValue.serverTimestamp(),
    bannedBy: byUid || null,
    bannedByName: byName || null,
    banReason: reason || null,
    "banned.active": true,
    "banned.reason": reason || null,
    "banned.until": untilTs || null,
    "banned.byUid": byUid || null,
    "banned.byName": byName || null,
  };

  if (/^[A-Za-z0-9_-]{20,}$/.test(usernameOrUid)) {
    const docu = await db.collection("users").doc(usernameOrUid).get();
    if (docu.exists) {
      await docu.ref.set(payloadBase, { merge: true });
      return docu.data()?.username || usernameOrUid;
    }
  }

  const q = await db
    .collection("users")
    .where("username", "==", usernameOrUid)
    .limit(1)
    .get();

  if (q.empty) return null;

  const doce = q.docs[0];
  await doce.ref.set(payloadBase, { merge: true });
  return doce.data()?.username || doce.id;
}

async function unbanUser(usernameOrUid) {
  const reset = {
    "banned.active": false,
    "banned.reason": null,
    "banned.until": null,
    "banned.byUid": null,
    "banned.byName": null,
  };

  if (/^[A-Za-z0-9_-]{20,}$/.test(usernameOrUid)) {
    const docu = await db.collection("users").doc(usernameOrUid).get();
    if (docu.exists) {
      await docu.ref.set(reset, { merge: true });
      return docu.data()?.username || usernameOrUid;
    }
  }

  const q = await db
    .collection("users")
    .where("username", "==", usernameOrUid)
    .limit(1)
    .get();

  if (q.empty) return null;

  const doce = q.docs[0];
  await doce.ref.set(reset, { merge: true });
  return doce.data()?.username || doce.id;
}

async function setMaintenance(scope, on) {
  await db
    .collection("system")
    .doc("maintenance")
    .set(
      {
        [scope]: on,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

async function getLastMessages(n) {
  const snap = await db
    .collection("chatMessages")
    .orderBy("timestamp", "desc")
    .limit(n)
    .get();
  return snap.docs.reverse().map((d) => {
    const x = d.data();
    const t = x.timestamp?.toDate
      ? x.timestamp.toDate().toLocaleTimeString()
      : "";
    return `[${t}] ${x.author}: ${x.text}`;
  });
}

function parseDuration(s) {
  const m = String(s).trim().match(/^(\d+)\s*([a-zA-Z]+)?$/);
  if (!m) return 0;

  const val = parseInt(m[1], 10);
  const unitRaw = (m[2] || "m").toLowerCase();
  const key = unitRaw[0];

  const multipliers = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return val * (multipliers[key] || 0);
}

// === ALLE POSTS HARD-DELETE (Admin) =======================================
exports.wipeAllPosts = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Nicht eingeloggt.");

  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Keine Berechtigung.");
  }

  const pageSize = Number(req.data?.pageSize || 300);
  let lastDoc = null;
  let totalDeleted = 0;
  let totalScanned = 0;

  while (true) {
    let q = db
      .collection("posts")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageSize);

    if (lastDoc) {
      q = q.startAfter(lastDoc.id);
    }

    const snap = await q.get();
    if (snap.empty) break;

    let batch = db.batch();
    let ops = 0;

    for (const docSnap of snap.docs) {
      batch.delete(docSnap.ref);
      totalDeleted++;
      totalScanned++;
      ops++;

      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }

    if (ops > 0) {
      await batch.commit();
    }

    lastDoc = snap.docs[snap.docs.length - 1];
  }

  logger.warn("🧨 wipeAllPosts DONE", { totalDeleted, totalScanned });
  return { deleted: totalDeleted, scanned: totalScanned };
});

const DEMO_USERNAMES = [
  "CodeNova",
  "BugHunter",
  "DevLena",
  "ZeroDayTom",
  "PixelPanda",
  "StackSam",
  "SyntaxSophie",
  "BitBasti",
  "LoopLukas",
  "NullPointerNina",
  "FrontendFox",
  "BackendBenny",
  "QueryQueen",
  "LambdaLeo",
  "ConsoleChris",
  "ArrayAnna",
  "ClassCarl",
  "ScriptSven",
  "RuntimeRia",
  "CloudCaro",
];

// === DEMO-POSTS (100 Stück) ===============================================

const SEED_POSTS = [
  // hier einfach deine 100 Seed-Posts von vorhin wieder reinkopieren
];

// === ONE-TIME SEED: 100 Demo-Posts =======================================

exports.seedDemoPostsOnce = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Nicht eingeloggt.");
  }

  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Keine Berechtigung.");
  }

  const now = admin.firestore.Timestamp.now();
  const batch = db.batch();

  for (const seed of SEED_POSTS) {
    const postRef = db.collection("posts").doc();

    const shortId = computeShortIdFromDocId(postRef.id);

    const randomAuthorName =
      DEMO_USERNAMES[Math.floor(Math.random() * DEMO_USERNAMES.length)];

    const post = {
      title: seed.title,
      bodyText: seed.bodyText,
      tags: seed.tags,
      createdAt: now,
      authorUid: uid,
      authorName: randomAuthorName,
      likes: 0,
      views: 0,
      replies: 0,
      removed: false,
      moderation: {
        status: "clean",
        decidedBy: "seed",
        decidedAt: now,
        reasonDetected: "none",
      },
      shortId,
    };

    batch.set(postRef, post);

    try {
      await updateTagStatsFromPost(post);
    } catch (e) {
      logger.warn("updateTagStatsFromPost (seed) failed", { e });
    }
  }

  await batch.commit();
  logger.info("🌱 seedDemoPostsOnce: Demo-Posts erstellt", {
    by: uid,
    count: SEED_POSTS.length,
  });
  return { created: SEED_POSTS.length };
});
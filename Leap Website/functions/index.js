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
// → trifft "huurensohn", "H.u.r.e.n.s.o.h.n", "N1gg3r", "N_1_g_g_e_r", ...
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

// 2-Wege-Check: (a) lose Regex auf normalisiertem Text, (b) includes auf „squeezed“
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

    // Beleidigungs-Check auf dem Tag selber
    const hits = matchAny(tag);
    if (hits.length > 0) {
      logger.warn("Tag verworfen wegen beleidigendem Inhalt", { tag, hits });
      continue;
    }

    const ref = db.collection("tags").doc(tag); // Doc-ID = tag-name (lowercase)

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

      // 👉 nur bei cleanen Posts Tags hochzählen
      try {
        await updateTagStatsFromPost(post);
      } catch (e) {
        logger.warn("updateTagStatsFromPost failed", { postId, e });
      }

      logger.info("👌 Post clean (create)", { postId });
    }
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

    // 🔹 /delete, /deletethread, /deletepost
    //  - /delete <postDocId>
    //  - /delete #123456  (Kurz-ID)
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
          // Dauer unbrauchbar → wir interpretieren ALLES ab args[1] als Grund → perma mute
          durationArg = null;
          reasonStartIndex = 1;
        } else {
          untilTs = Date.now() + ms;
          durationLabel = durationArg;
        }
      } else {
        // kein Dauer-Arg → perma, Grund beginnt an Position 1
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

  const pageSize = Number(req.data?.pageSize || 300); // pro Runde
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

      // schon vorhanden → überspringen
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
        { shortId }, // Number
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

// 🔹 deleteThread: setzt removed/deleted=true, arbeitet auf posts (+ optional threads)
async function deleteThread(threadId) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  let didSomething = false;

  // zuerst in POSTS, weil das dein Feed nutzt
  const collections = ["posts", "threads"]; // threads nur falls du sie noch nutzt
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

// 🔹 per shortId (z.B. #236823) Post finden & löschen
// 🔹 per shortId (z.B. #236823) Post finden & löschen
// 🔹 per shortId (z.B. #236823 oder #052901) Post finden & löschen
// 🔹 per shortId (z.B. #236823 oder #052901) Post finden & löschen
async function deleteThreadByShortId(shortIdInput) {
  const raw = String(shortIdInput).replace(/^#/, "").trim();
  const padded = raw.padStart(6, "0"); // "52901" → "052901"
  const num = Number(raw);

  let q = null;

  // 1. Versuch: padded String wie im UI
  q = await db
    .collection("posts")
    .where("shortId", "==", padded)
    .limit(1)
    .get();

  // 2. Versuch: ungepaddeter String
  if (q.empty && raw !== padded) {
    q = await db
      .collection("posts")
      .where("shortId", "==", raw)
      .limit(1)
      .get();
  }

  // 3. Versuch: als Number
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

  // 1) Direkt über UID?
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

  // 2) ansonsten: nach username suchen
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
  // 1) per UID?
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

  // 2) per username
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
  const key = unitRaw[0]; // s, m, h, d – reicht uns

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

  const pageSize = Number(req.data?.pageSize || 300); // wie viele pro Batch
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
  // 1
  {
    title: "Erste Eindrücke zur neuen Leap-Version",
    bodyText:
      "Ich habe heute auf die neue Leap-Version geupdatet. Das UI wirkt deutlich aufgeräumter und Builds gehen schneller durch. Welche Änderungen habt ihr als erstes bemerkt?",
    tags: ["Diskussion", "Leap-Projekte"],
  },
  // 2
  {
    title: "Mein erstes kleines Leap-Projekt ist live",
    bodyText:
      "Ich habe ein kleines Aufgaben-Board mit Leap und Web-Frontend gebaut. Nichts Großes, aber ich habe mega viel dabei gelernt. Was war euer erstes Leap-Projekt?",
    tags: ["Leap-Projekte", "Fragen & Hilfe"],
  },
  // 3
  {
    title: "Meme: Wenn der Code plötzlich funktioniert",
    bodyText:
      "Ich habe ein Meme gemacht über den Moment, wenn man nichts geändert hat, neu startet und der Bug einfach weg ist. Wohin mit solchen Posts – hier okay?",
    tags: ["Memes & Spaß"],
  },
  // 4
  {
    title: "Java oder C# für ein größeres Leap-Backend?",
    bodyText:
      "Ich plane ein mittelgroßes Projekt mit Leap und schwanke zwischen Java und C#. Welche Sprache nutzt ihr für produktive Backends und warum?",
    tags: ["Java", "C#", "Diskussion"],
  },
  // 5
  {
    title: "Python für kleine Automationen mit Leap nutzen",
    bodyText:
      "Ich möchte Python nutzen, um regelmäßig Daten aus meinem Leap-Projekt aufzubereiten. Habt ihr Beispiel-Ideen für sinnvolle kleine Automationen?",
    tags: ["Python", "Fragen & Hilfe"],
  },
  // 6
  {
    title: "Web-Dashboard für Leap-Daten bauen",
    bodyText:
      "Ich möchte ein Dashboard bauen, das Statistiken aus meinem Leap-Projekt zeigt. Nutzt ihr lieber reine HTML/CSS/JS oder Frameworks wie React?",
    tags: ["Web", "Leap-Projekte"],
  },
  // 7
  {
    title: "SQL-Abfragen im Projekt werden langsam – Tipps?",
    bodyText:
      "Mit wachsender Datenmenge werden meine SELECT-Queries deutlich langsamer. Welche einfachen Optimierungsschritte würdet ihr zuerst ausprobieren?",
    tags: ["SQL", "Fragen & Hilfe"],
  },
  // 8
  {
    title: "Meme: Wenn der Build nur lokal grün ist",
    bodyText:
      "Ein Meme über den Moment, wenn lokal alles grün ist, aber der CI-Server gnadenlos rot zeigt. Wer kennt’s?",
    tags: ["Memes & Spaß"],
  },
  // 9
  {
    title: "Struktur für größere Leap-Projekte finden",
    bodyText:
      "Ab einer gewissen Größe fühlt sich mein Projekt chaotisch an. Wie teilt ihr euren Code in Module, Services und Schichten auf?",
    tags: ["Diskussion", "Leap-Projekte"],
  },
  // 10
  {
    title: "NullPointerException in Java – saubere Strategien?",
    bodyText:
      "Ich bekomme sporadisch NullPointerExceptions in einem Service, den mehrere Threads nutzen. Welche Strategien nutzt ihr, um das systematisch zu finden?",
    tags: ["Java", "Fragen & Hilfe"],
  },
  // 11
  {
    title: "C# Events und Delegates in der Praxis",
    bodyText:
      "Ich will ein kleines Event-System bauen, das UI-Updates triggert, wenn sich Daten im Backend ändern. Wie setzt ihr das in C# elegant um?",
    tags: ["C#", "Leap-Projekte"],
  },
  // 12
  {
    title: "Python-Skripte für wiederkehrende Datenjobs",
    bodyText:
      "Ich schreibe Python-Skripte, die regelmäßig Logs auswerten und in eine DB schreiben. Welche Libraries sind für euch Pflicht in solchen Setups?",
    tags: ["Python", "Leap-Projekte"],
  },
  // 13
  {
    title: "CSS-Finetuning für ein Forum-Layout",
    bodyText:
      "Ich bastle am Layout für ein kleines Leap-Forum. Habt ihr Tipps für saubere Abstände, Typografie und responsive Karten?",
    tags: ["Web", "Fragen & Hilfe"],
  },
  // 14
  {
    title: "SQL JOINs im Kontext eines Forums erklären",
    bodyText:
      "Ich baue ein Forum mit Posts, Usern und Likes. Hat jemand ein einfaches Beispiel, wie man die Tabellen mit JOINs sinnvoll verbindet?",
    tags: ["SQL", "Fragen & Hilfe"],
  },
  // 15
  {
    title: "Wie dokumentiert ihr eure Leap-Projekte?",
    bodyText:
      "Nutzt ihr einfache READMEs, interne Wikis oder spezielle Doku-Tools? Ich suche nach einer Lösung, die auch kleine Teams nutzen.",
    tags: ["Diskussion", "Leap-Projekte"],
  },
  // 16
  {
    title: "Umfrage: Nutzt ihr Leap eher Dark- oder Light-Mode?",
    bodyText:
      "Ich habe ein kleines Dark-Mode-Meme gebastelt. Ernsthaft: Wer von euch nutzt Light Mode länger als 10 Minuten?",
    tags: ["Memes & Spaß", "Diskussion"],
  },
  // 17
  {
    title: "Java Streams im Alltag sinnvoll einsetzen",
    bodyText:
      "Streams sehen cool aus, können aber auch unlesbar werden. Habt ihr Beispiele, wo Streams wirklich lesbarer sind als klassische Schleifen?",
    tags: ["Java", "Fragen & Hilfe"],
  },
  // 18
  {
    title: "C# LINQ – Best Practices und Stolperfallen",
    bodyText:
      "Ich nutze LINQ intensiv, aber manchmal wird die Query-Kette sehr lang. Wie haltet ihr euren LINQ-Code übersichtlich?",
    tags: ["C#", "Fragen & Hilfe"],
  },
  // 19
  {
    title: "Python-Umgebungen sauber organisieren",
    bodyText:
      "Habt ihr Erfahrungen mit venv, Poetry oder Pipenv in Team-Projekten? Wie verhindert ihr Versions-Chaos?",
    tags: ["Python", "Diskussion"],
  },
  // 20
  {
    title: "Responsives Layout für ein Leap-Dashboard",
    bodyText:
      "Ich möchte ein Dashboard bauen, das auch auf Handy gut lesbar ist. Grid, Flexbox oder Framework – was nutzt ihr im Alltag?",
    tags: ["Web", "Fragen & Hilfe"],
  },
  // 21
  {
    title: "SQL-Migrations im Team sauber handhaben",
    bodyText:
      "Wie geht ihr mit Schema-Änderungen um, wenn mehrere Leute am gleichen Projekt arbeiten? Nutzt ihr Migrations-Tools?",
    tags: ["SQL", "Diskussion"],
  },
  // 22
  {
    title: "Suche Mitstreiter für ein gemeinsames Leap-Projekt",
    bodyText:
      "Ich hätte Lust, ein kleines Lernportal mit Badges und Aufgaben in Leap zu bauen. Wer hätte Interesse mitzucoden?",
    tags: ["Leap-Projekte", "Diskussion"],
  },
  // 23
  {
    title: "Exceptions in Java sinnvoll strukturieren",
    bodyText:
      "Checked vs unchecked Exceptions – wie entscheidet ihr, welche ihr wo verwendet? Mein Code wirkt aktuell sehr unruhig.",
    tags: ["Java", "Fragen & Hilfe"],
  },
  // 24
  {
    title: "C# async/await – Deadlocks vermeiden",
    bodyText:
      "Ich nutze async/await in einem Web-API-Projekt und habe Angst vor Deadlocks. Habt ihr einfache Regeln, an die ihr euch haltet?",
    tags: ["C#", "Fragen & Hilfe"],
  },
  // 25
  {
    title: "Python: Dict vs. Dataclass vs. eigene Klassen",
    bodyText:
      "Ab wann lohnt es sich, anstelle von Dictionaries Dataclasses oder echte Klassen zu verwenden? Wie entscheidet ihr das?",
    tags: ["Python", "Diskussion"],
  },
  // 26
  {
    title: "HTML-Grundgerüst für ein Leap-Forum",
    bodyText:
      "Ich suche ein sauberes Grundlayout mit Header, Navigationsleiste und Content-Bereich. Habt ihr minimalistische Beispiele?",
    tags: ["Web", "Fragen & Hilfe"],
  },
  // 27
  {
    title: "Zeitstempel in SQL sauber speichern",
    bodyText:
      "DATETIME, TIMESTAMP oder String? Ich will später nach Datum und Zeitraum filtern können. Was nutzt ihr in euren Projekten?",
    tags: ["SQL", "Fragen & Hilfe"],
  },
  // 28
  {
    title: "Commit-Strategie: klein & oft oder groß & selten?",
    bodyText:
      "Wie granular commitet ihr Features? Viele kleine Commits oder lieber zusammengefasste Änderungen?",
    tags: ["Diskussion", "Leap-Projekte"],
  },
  // 29
  {
    title: "Meme: Wenn Git-Merge-Konflikte eskalieren",
    bodyText:
      "Ich habe ein Meme darüber gemacht, wenn man einen Merge öffnet und die Datei nur noch aus Konflikt-Markern besteht.",
    tags: ["Memes & Spaß"],
  },
  // 30
  {
    title: "Java: Vom println zu richtigem Logging wechseln",
    bodyText:
      "Ich nutze überall System.out.print… und will auf ein vernünftiges Logging-Konzept umstellen. Welche Libraries empfehlt ihr?",
    tags: ["Java", "Fragen & Hilfe"],
  },
  // 31
  {
    title: "C# Interfaces sinnvoll zuschneiden",
    bodyText:
      "Wie granular sollten Interfaces sein? Lieber etwas breiter oder sehr feingranular mit vielen kleinen Interfaces?",
    tags: ["C#", "Diskussion"],
  },
  // 32
  {
    title: "Python-Fehlerhandling ohne Chaos",
    bodyText:
      "Meine Scripts brechen bei Fehlern oft komplett ab oder schlucken alles. Wie findet ihr eine gute Balance?",
    tags: ["Python", "Fragen & Hilfe"],
  },
  // 33
  {
    title: "Card-Komponenten für ein Forum-Frontend bauen",
    bodyText:
      "Ich möchte wiederverwendbare Card-Komponenten für Threads bauen. Nutzt ihr Utility-Classes oder eigene CSS-Komponenten?",
    tags: ["Web", "Diskussion"],
  },
  // 34
  {
    title: "Pagination in SQL effizient umsetzen",
    bodyText:
      "Ich baue eine Listing-Ansicht mit vielen Einträgen. OFFSET/LIMIT oder andere Ansätze – was skaliert besser?",
    tags: ["SQL", "Fragen & Hilfe"],
  },
  // 35
  {
    title: "Code-Reviews in Leap-Projekten organisieren",
    bodyText:
      "Wie macht ihr Code-Reviews? Feste Reviewer, wechselnde Paare oder nach dem Motto “wer Zeit hat”?",
    tags: ["Diskussion", "Leap-Projekte"],
  },
  // 36
  {
    title: "Meme: Wenn das Build beim Release zerbricht",
    bodyText:
      "Ich habe ein Meme gemacht über den Moment, wenn alle Test-Builds laufen und genau das Release-Build crasht.",
    tags: ["Memes & Spaß"],
  },
  // 37
  {
    title: "Java: List, Set oder Map – wann was?",
    bodyText:
      "Ich greife reflexartig zu ArrayList. Habt ihr einfache Regeln, wann Set oder Map mehr Sinn machen?",
    tags: ["Java", "Fragen & Hilfe"],
  },
  // 38
  {
    title: "C#: Dependency Injection im Backend nutzen",
    bodyText:
      "Ich möchte mein C#-Backend mit DI sauberer strukturieren. Welche Container und Patterns nutzt ihr?",
    tags: ["C#", "Leap-Projekte"],
  },
  // 39
  {
    title: "Python-Projekte im Team konsistent halten",
    bodyText:
      "Habt ihr einen Standard für Ordnerstruktur, Linting und Formatierung? Was hat sich bewährt?",
    tags: ["Python", "Diskussion"],
  },
  // 40
  {
    title: "Dark Mode fürs Leap-Frontend implementieren",
    bodyText:
      "Ich möchte einen Theme-Switcher einbauen. Nutzt ihr CSS-Variablen, Utility-Klassen oder etwas anderes?",
    tags: ["Web", "Leap-Projekte"],
  },
  // 41
  {
    title: "SQL: Echtdaten für Tests anonymisieren",
    bodyText:
      "Wir wollen echte Produktionsdaten für Tests verwenden, aber anonymisiert. Wie geht ihr das an?",
    tags: ["SQL", "Fragen & Hilfe"],
  },
  // 42
  {
    title: "Neue Sprache lernen: Kurs, Buch oder Projekt?",
    bodyText:
      "Wenn ihr mit C#, Java oder Python angefangen habt – was war für euch der beste Einstieg?",
    tags: ["Diskussion"],
  },
  // 43
  {
    title: "Meme: Wenn der Linter zum ersten Mal läuft",
    bodyText:
      "Ein Meme über 500+ Linter-Warnungen in einem alten Projekt. Wer hat das schon mal erlebt?",
    tags: ["Memes & Spaß"],
  },
  // 44
  {
    title: "Java: Unit-Tests für Leap-Services",
    bodyText:
      "JUnit, TestNG, Mockito – was nutzt ihr in euren Projekten und warum?",
    tags: ["Java", "Leap-Projekte"],
  },
  // 45
  {
    title: "C#: Exceptions in Web-APIs loggen",
    bodyText:
      "Ich suche ein Setup, mit dem ich Fehler sauber loggen und später auswerten kann. Was setzt ihr ein?",
    tags: ["C#", "Fragen & Hilfe"],
  },
  // 46
  {
    title: "Python für Datenimporte in SQL",
    bodyText:
      "Ich lade mit Python CSV-Dateien in eine SQL-Datenbank. Worauf muss ich achten, damit es stabil bleibt?",
    tags: ["Python", "SQL"],
  },
  // 47
  {
    title: "Barrierefreiheit im Web-Frontend beachten",
    bodyText:
      "Habt ihr einfache Checks, um Accessibility zumindest grob sicherzustellen?",
    tags: ["Web", "Diskussion"],
  },
  // 48
  {
    title: "SQL: Foreign Keys konsequent nutzen?",
    bodyText:
      "Setzt ihr überall FKs oder lasst ihr sie für mehr Flexibilität weg? Was sind eure Erfahrungen?",
    tags: ["SQL", "Diskussion"],
  },
  // 49
  {
    title: "Was war euer erstes Leap-Projekt?",
    bodyText:
      "Viele starten mit einer Todo-App. Was war euer erster Versuch mit Leap – und habt ihr ihn noch?",
    tags: ["Leap-Projekte", "Memes & Spaß"],
  },
  // 50
  {
    title: "Meme: Der Klassiker 'Funktioniert bei mir'",
    bodyText:
      "Ich habe ein Meme über den legendären Kommentar “Bei mir läuft’s” gebaut.",
    tags: ["Memes & Spaß"],
  },
  // 51
  {
    title: "Java: Große DTOs aufteilen oder lassen?",
    bodyText:
      "Ich habe DTOs mit sehr vielen Feldern. Sollte ich sie splitten oder lieber zusammenlassen?",
    tags: ["Java", "Fragen & Hilfe"],
  },
  // 52
  {
    title: "C#: Wann nutzt ihr Records statt Klassen?",
    bodyText:
      "Value Objects, Messages, Config… in welchen Fällen nutzt ihr Records im Alltag?",
    tags: ["C#", "Diskussion"],
  },
  // 53
  {
    title: "Python type hints – Pflicht oder nice to have?",
    bodyText:
      "Schreibt ihr ernsthaft überall type hints oder nur an kritischen Stellen?",
    tags: ["Python", "Diskussion"],
  },
  // 54
  {
    title: "Routing im Single-Page-Frontend",
    bodyText:
      "Baut ihr Routing selbst oder nutzt ihr Framework-Router? Was ist bei euch Standard?",
    tags: ["Web", "Fragen & Hilfe"],
  },
  // 55
  {
    title: "SQL Views für wiederkehrende Reports",
    bodyText:
      "Legt ihr Views für Standard-Reports an oder schreibt ihr die Queries direkt im Code?",
    tags: ["SQL", "Leap-Projekte"],
  },
  // 56
  {
    title: "Erfahrungen mit Pair Programming",
    bodyText:
      "Habt ihr Pair Programming im Alltag ausprobiert? Was funktioniert gut, was nervt?",
    tags: ["Diskussion"],
  },
  // 57
  {
    title: "Meme: Lokal läuft alles – Server nicht",
    bodyText:
      "Ein Meme über den Unterschied zwischen lokaler Dev-Umgebung und Produktion.",
    tags: ["Memes & Spaß"],
  },
  // 58
  {
    title: "Java: Konfigurationswerte organisieren",
    bodyText:
      "Properties, YAML, Environment-Variablen – wie strukturiert ihr Konfiguration in euren Services?",
    tags: ["Java", "Leap-Projekte"],
  },
  // 59
  {
    title: "C#: xUnit oder NUnit für Tests?",
    bodyText:
      "Welche Testframeworks nutzt ihr und warum? Gibt es No-Gos?",
    tags: ["C#", "Fragen & Hilfe"],
  },
  // 60
  {
    title: "Python: Richtiges Logging statt print",
    bodyText:
      "Ich will von print-Statements auf logging-Modul oder Alternativen wechseln. Wie steigt man am besten um?",
    tags: ["Python", "Fragen & Hilfe"],
  },
  // 61
  {
    title: "API-Calls im Frontend sauber kapseln",
    bodyText:
      "Nutzt ihr eigene Service-Layer, Hooks oder direkte Fetch-Calls in Komponenten?",
    tags: ["Web", "Leap-Projekte"],
  },
  // 62
  {
    title: "SQL: Realistische Testdaten generieren",
    bodyText:
      "Wie erzeugt ihr Testdaten, die nah an echten Fällen sind, ohne alles manuell einzutragen?",
    tags: ["SQL", "Fragen & Hilfe"],
  },
  // 63
  {
    title: "Ideen für Community-Projekte mit Leap",
    bodyText:
      "Welche öffentlichen Projekte würdet ihr gern hier in der Community sehen?",
    tags: ["Leap-Projekte", "Diskussion"],
  },
  // 64
  {
    title: "Meme: Stack Overflow Copy & Paste",
    bodyText:
      "Ein Meme über den Moment, wenn man Code blind von Stack Overflow übernimmt.",
    tags: ["Memes & Spaß"],
  },
  // 65
  {
    title: "Java Optional sinnvoll einsetzen",
    bodyText:
      "Nutzt ihr Optional im Domain-Code oder nur an den Rändern? Wo ist es wirklich hilfreich?",
    tags: ["Java", "Diskussion"],
  },
  // 66
  {
    title: "C#: Exceptions in async-Methoden handhaben",
    bodyText:
      "Wie stellt ihr sicher, dass euch keine Fehler in async/await-Aufrufen verloren gehen?",
    tags: ["C#", "Fragen & Hilfe"],
  },
  // 67
  {
    title: "Python: Mehrere Projekte, viele Envs",
    bodyText:
      "Wie behaltet ihr den Überblick, wenn ihr parallel an mehreren Python-Projekten arbeitet?",
    tags: ["Python", "Diskussion"],
  },
  // 68
  {
    title: "Formulare mit sinnvoller Validierung bauen",
    bodyText:
      "Nutzt ihr externe Libraries oder schreibt ihr Validierung selbst? Was spart euch am meisten Zeit?",
    tags: ["Web", "Fragen & Hilfe"],
  },
  // 69
  {
    title: "SQL: Normalisierung vs. Performance",
    bodyText:
      "Wie stark normalisiert ihr im Normalfall und wann denormalisiert ihr bewusst?",
    tags: ["SQL", "Diskussion"],
  },
  // 70
  {
    title: "Wie viel Dokumentation braucht ein Projekt?",
    bodyText:
      "Wo zieht ihr die Grenze zwischen zu wenig und zu viel Doku?",
    tags: ["Diskussion"],
  },
  // 71
  {
    title: "Meme: Bug-Lösungen im Schlaf finden",
    bodyText:
      "Ein Meme darüber, wie Bugs sich über Nacht von selbst in der eigenen Vorstellung lösen.",
    tags: ["Memes & Spaß"],
  },
  // 72
  {
    title: "Java: REST-Clients im Projekt einsetzen",
    bodyText:
      "Welche HTTP-Client-Libraries für Java nutzt ihr in euren Services?",
    tags: ["Java", "Leap-Projekte"],
  },
  // 73
  {
    title: "C#: Konfiguration nach Umgebung trennen",
    bodyText:
      "Wie organisiert ihr Dev, Test und Prod-Konfiguration, ohne durcheinander zu kommen?",
    tags: ["C#", "Leap-Projekte"],
  },
  // 74
  {
    title: "Python: Kleine CLI-Tools mit argparse",
    bodyText:
      "Reicht argparse im Alltag oder nutzt ihr lieber Libraries wie Click oder Typer?",
    tags: ["Python", "Fragen & Hilfe"],
  },
  // 75
  {
    title: "Web: Komponenten-Bibliothek oder Eigenentwicklung?",
    bodyText:
      "Habt ihr eigene kleinen Design-Systeme gebaut oder verlasst ihr euch auf externe Libraries?",
    tags: ["Web", "Diskussion"],
  },
  // 76
  {
    title: "SQL: Backup-Strategie für produktive Datenbanken",
    bodyText:
      "Wie organisiert ihr Backups, damit ihr im Notfall nichts Wichtiges verliert?",
    tags: ["SQL", "Leap-Projekte"],
  },
  // 77
  {
    title: "Roadmap für ein Leap-Lernportal",
    bodyText:
      "Ich plane ein Lernportal mit Aufgaben, Levels und Badges. Welche Features sind aus eurer Sicht Pflicht?",
    tags: ["Leap-Projekte", "Fragen & Hilfe"],
  },
  // 78
  {
    title: "Meme: 'Nur eine kleine Änderung'",
    bodyText:
      "Ein Meme über Feature-Anfragen, die angeblich nur fünf Minuten dauern.",
    tags: ["Memes & Spaß"],
  },
  // 79
  {
    title: "Java: Performance-Probleme im Backend finden",
    bodyText:
      "Welche Profiler oder Tools nutzt ihr, um langsame Stellen im Code zu finden?",
    tags: ["Java", "Fragen & Hilfe"],
  },
  // 80
  {
    title: "C#: Nullable Reference Types – nutzen oder nicht?",
    bodyText:
      "Aktiviert ihr NRT standardmäßig in neuen Projekten oder lasst ihr sie lieber aus?",
    tags: ["C#", "Diskussion"],
  },
  // 81
  {
    title: "Python für Datenanalyse in Leap-Projekten",
    bodyText:
      "Pandas, NumPy, Matplotlib – wer nutzt das in Kombination mit Leap und wie sieht das Setup aus?",
    tags: ["Python", "Leap-Projekte"],
  },
  // 82
  {
    title: "State Management im Frontend organisieren",
    bodyText:
      "Ab wann lohnt sich ein globaler Store? Oder reicht Context/Props in vielen Fällen?",
    tags: ["Web", "Diskussion"],
  },
  // 83
  {
    title: "SQL: Transaktionen sinnvoll einsetzen",
    bodyText:
      "In welchen Fällen kapselt ihr Operationen bewusst in Transaktionen?",
    tags: ["SQL", "Fragen & Hilfe"],
  },
  // 84
  {
    title: "Remote vs. vor Ort an Leap-Projekten arbeiten",
    bodyText:
      "Wo könnt ihr euch besser konzentrieren – im Büro oder im Homeoffice?",
    tags: ["Diskussion"],
  },
  // 85
  {
    title: "Meme: Wenn die Doku komplett veraltet ist",
    bodyText:
      "Ein Meme über Dokumentation, die mit dem aktuellen Code nichts mehr zu tun hat.",
    tags: ["Memes & Spaß"],
  },
  // 86
  {
    title: "Java: Große Enums strukturieren",
    bodyText:
      "Habt ihr Strategien, um riesige Enums übersichtlich zu halten?",
    tags: ["Java", "Fragen & Hilfe"],
  },
  // 87
  {
    title: "C#: Serilog, NLog oder etwas anderes?",
    bodyText:
      "Welche Logging-Library nutzt ihr produktiv und warum gerade die?",
    tags: ["C#", "Fragen & Hilfe"],
  },
  // 88
  {
    title: "Python: Sehr große JSON-Dateien verarbeiten",
    bodyText:
      "Wie geht ihr mit JSON-Dateien im Gigabyte-Bereich um, ohne alles in den RAM zu laden?",
    tags: ["Python", "Fragen & Hilfe"],
  },
  // 89
  {
    title: "Web: Frontend-Performance analysieren",
    bodyText:
      "Welche Werkzeuge nutzt ihr, um langsame Seiten zu finden und zu optimieren?",
    tags: ["Web", "Fragen & Hilfe"],
  },
  // 90
  {
    title: "SQL: Indizes prüfen und aufräumen",
    bodyText:
      "Wie erkennt ihr unnötige oder doppelte Indizes und beseitigt sie?",
    tags: ["SQL", "Leap-Projekte"],
  },
  // 91
  {
    title: "Clean-Code-Guidelines für Leap-Projekte",
    bodyText:
      "Habt ihr interne Regeln oder eine kleine Checkliste, an die ihr euch haltet?",
    tags: ["Leap-Projekte", "Diskussion"],
  },
  // 92
  {
    title: "Meme: Das mysteriöse 'Works on my machine'-Build",
    bodyText:
      "Ein Meme darüber, wenn niemand weiß, wie das letzte grüne Build entstanden ist.",
    tags: ["Memes & Spaß"],
  },
  // 93
  {
    title: "Java: Optional in API-Responses abbilden",
    bodyText:
      "Habt ihr Best Practices, wie man Optional in REST-APIs sauber modelliert?",
    tags: ["Java", "Fragen & Hilfe"],
  },
  // 94
  {
    title: "C#: Sehr große Solutions strukturieren",
    bodyText:
      "Viele kleine Projekte oder wenige große? Wie geht ihr an riesige Solutions ran?",
    tags: ["C#", "Diskussion"],
  },
  // 95
  {
    title: "Python für CI/CD-Pipelines nutzen",
    bodyText:
      "Wer nutzt Python-Skripte, um Build- oder Deployment-Pipelines zu steuern?",
    tags: ["Python", "Leap-Projekte"],
  },
  // 96
  {
    title: "Design-Systeme zwischen Leap-Projekten teilen",
    bodyText:
      "Habt ihr eigene Komponenten-/Design-Sammlungen, die ihr wiederverwendet?",
    tags: ["Web", "Leap-Projekte"],
  },
  // 97
  {
    title: "SQL: Daten in Archivtabelle auslagern",
    bodyText:
      "Wie archiviert ihr alte Datensätze, ohne das Hauptsystem zu verlangsamen?",
    tags: ["SQL", "Diskussion"],
  },
  // 98
  {
    title: "Welche Sprache macht euch im Alltag am meisten Spaß?",
    bodyText:
      "Java, C#, Python, JavaScript oder etwas Exotisches – womit arbeitet ihr am liebsten in Verbindung mit Leap?",
    tags: ["Diskussion"],
  },
  // 99
  {
    title: "Meme: Junior findet den Bug in 2 Minuten",
    bodyText:
      "Ein Meme über den Moment, wenn der neue Kollege den Fehler sofort sieht, den man selbst übersehen hat.",
    tags: ["Memes & Spaß"],
  },
  // 100
  {
    title: "Was wünscht ihr euch im Leap-Forum?",
    bodyText:
      "Welche Features und Bereiche sollte dieses Forum bekommen, damit ihr langfristig Lust habt, hier aktiv zu sein?",
    tags: ["Leap-Projekte", "Fragen & Hilfe"],
  },
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

    // 🔹 HIER: shortId berechnen wie überall sonst
    const shortId = computeShortIdFromDocId(postRef.id);

    const randomAuthorName =
      DEMO_USERNAMES[
        Math.floor(Math.random() * DEMO_USERNAMES.length)
      ];

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

      // 🔹 neu:
      shortId, // Number
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
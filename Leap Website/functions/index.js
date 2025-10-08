// === IMPORTS & SETUP ======================================================
const { setGlobalOptions, logger } = require("firebase-functions/v2");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({
  region: "europe-west3",
  maxInstances: 10,
});

// === HELPER FUNKTIONEN ====================================================

function stripHtml(html) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// beleidigende/toxische Muster (DE/EN)
const BAD_PATTERNS = [
  // Deutsch
  /\bfick(?:\s*dich)?\b/i,
  /\bhuren(?:sohn|kind)\b/i,
  /\bwix+er\b/i,
  /\bmissgeburt\b/i,
  /\bfotze\b/i,
  /\barschloch\b/i,
  /\bverpiss\s*dich\b/i,
  /\bschlampe\b/i,
  /\bmongo\b/i,
  /\bspasst\b/i,
  /\bspast\b/i,
  /\bdrecksau\b/i,
  /\bdumm(?:kopf)?\b/i,
  /\bidiot\b/i,
  /\bdepp\b/i,
  /\bbehindert(?:er|e|es)?\b/i,
  // Englisch
  /\bfuck(?:\s*you)?\b/i,
  /\basshole\b/i,
  /\bretard\b/i,
  /\bbitch\b/i,
  /\bslut\b/i,
  /\bcunt\b/i,
  /\bmotherfucker\b/i,
  /\bdumbass\b/i,
  // Hate / harassment
  /\bkill\s*yourself\b/i,
  /\bdie\b/i,
];

// === AUTO-MODERATION BEI REPORTS ==========================================
exports.autoModerateOnReport = onDocumentCreated(
  "posts/{postId}/reports/{reportId}",
  async (event) => {
    const { postId, reportId } = event.params;
    const report = event.data?.data() || {};

    const postRef = db.doc(`posts/${postId}`);
    const postSnap = await postRef.get();
    if (!postSnap.exists) {
      logger.warn("Post nicht gefunden", { postId, reportId });
      return;
    }

    const post = postSnap.data() || {};
    const plain = [
      post.title || "",
      post.bodyText || "",
      stripHtml(post.bodyHtml || post.html || ""),
    ]
      .join(" ")
      .toLowerCase();

    const reason = String(report.reason || "").toLowerCase();
    const matches = BAD_PATTERNS.filter((rx) => rx.test(plain));
    const reasonHintsInsult =
      reason.includes("beleidig") ||
      reason.includes("insult") ||
      reason.includes("hate");

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
            reasonDetected: matches.length ? "insult" : "reason_hint_only",
            patternHits: matches.map((m) => String(m)),
          },
        },
        { merge: true }
      );

      await db
        .doc(`posts/${postId}/reports/${reportId}`)
        .set(
          {
            status: "resolved_auto",
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

      logger.info("✅ Post auto-removed", { postId });
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
      logger.info("⚠️ Post nur geflaggt", { postId });
    }
  }
);

// === ADMIN SLASH COMMANDS =================================================
exports.adminSlash = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new Error("Nicht eingeloggt.");

  // Admin prüfen
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== "admin") {
    throw new Error("Keine Berechtigung.");
  }

  const raw = String(req.data?.command || "").trim();
  if (!raw.startsWith("/")) return { message: "❓ Kein Command erkannt." };

  const [cmd, ...args] = tokenize(raw);

  switch (cmd.toLowerCase()) {
    case "/clearchat":
      await clearChat();
      return { message: "✅ Chat geleert." };

    case "/deletethread": {
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
      const until = Date.now() + ms;
      const updated = await muteUser(who, until);
      return {
        message: updated
          ? `🔇 ${updated} bis ${new Date(until).toLocaleString()}`
          : "⚠️ User nicht gefunden.",
      };
    }

    case "/maintenance": {
      const scope = (args[0] || "all").toLowerCase();
      let state = (args[1] || "on").toLowerCase();
      if (!["on", "off"].includes(state)) state = "on";
      await setMaintenance(scope, state === "on");
      return { message: `🛠 Maintenance ${scope}: ${state.toUpperCase()}` };
    }

    case "/log": {
      const logs = await getLastMessages(25);
      return { message: "🧾 Log:\n" + logs.join("\n") };
    }

    default:
      return { message: `❓ Unbekannter Befehl: ${cmd}` };
  }
});

// === HELPER FUNKTIONEN ====================================================

function tokenize(s) {
  return s.split(/\s+/);
}

async function clearChat() {
  const snap = await db.collection("chatMessages").limit(500).get();
  const batch = db.batch();
  snap.forEach((d) => batch.delete(d.ref));
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
  let q = db.collection("users").where("username", "==", usernameOrUid).limit(1);
  if (/^[A-Za-z0-9]{20,28}$/.test(usernameOrUid)) {
    const direct = await db.collection("users").doc(usernameOrUid).get();
    if (direct.exists) {
      await direct.ref.update({ mutedUntil: untilTs });
      return direct.data()?.username || direct.id;
    }
  }
  const snap = await q.get();
  if (snap.empty) return null;
  const docRef = snap.docs[0].ref;
  await docRef.update({ mutedUntil: untilTs });
  return snap.docs[0].data()?.username || docRef.id;
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
  const m = String(s).trim().match(/^(\d+)([smhd])?$/i);
  if (!m) return 30 * 60 * 1000; // default 30m
  const val = parseInt(m[1], 10);
  const unit = (m[2] || "m").toLowerCase();
  const f = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit];
  return val * f;
}
// functions/index.js
const { setGlobalOptions, logger } = require("firebase-functions/v2");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Globale Defaults (Region = europe-west3, maxInstances optional)
setGlobalOptions({
  region: "europe-west3",
  maxInstances: 10,
});

/**
 * Strippt HTML → Plaintext
 */
function stripHtml(html) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Große, erweiterbare Liste „beleidigender“/toxischer Muster (DE/EN)
 * → du kannst hier später einfach erweitern
 */
const BAD_PATTERNS = [
  // deftig deutsch
  /\bfick(?:\s*dich)?\b/i,
  /\bhuren(?:sohn|kind)\b/i,
  /\bwix+er\b/i, /\bwixer\b/i,
  /\bmissgeburt\b/i,
  /\bfotze\b/i,
  /\barschloch\b/i,
  /\bverpiss\s*dich\b/i,
  /\bschlampe\b/i,
  /\bmongo\b/i,
  /\bspasst\b/i, /\bspast\b/i,
  /\bdrecksau\b/i,
  /\bdumm(?:kopf)?\b/i,
  /\bidiot\b/i, /\bdepp\b/i,
  /\bbehindert(?:er|e|es)?\b/i,
  // englisch
  /\bfuck(?:\s*you)?\b/i,
  /\basshole\b/i,
  /\bretard\b/i,
  /\bbitch\b/i,
  /\bslut\b/i,
  /\bcunt\b/i,
  /\bmotherfucker\b/i,
  /\bdumbass\b/i,
  // hate-/harassment-catchalls
  /\bkill\s*yourself\b/i,
  /\bdie\b/i,
];

/**
 * Report-Auto-Moderation
 * Trigger: posts/{postId}/reports/{reportId} (Firestore)
 * Firestore-Location ist bei dir „eur3“ (Multi-Region in EU).
 * Das passt – Eventarc verknüpft das automatisch.
 */
exports.autoModerateOnReport = onDocumentCreated(
  "posts/{postId}/reports/{reportId}",
  async (event) => {
    const { postId, reportId } = event.params;
    const report = event.data?.data() || {};

    // 1) Post laden
    const postRef = db.doc(`posts/${postId}`);
    const postSnap = await postRef.get();
    if (!postSnap.exists) {
      logger.warn("Post nicht gefunden für Report", { postId, reportId });
      return;
    }
    const post = postSnap.data() || {};

    // 2) Text normalisieren
    const plain = [
      String(post.title || ""),
      String(post.bodyText || ""),
      stripHtml(String(post.bodyHtml || post.html || "")),
    ]
      .join(" ")
      .toLowerCase();

    const reason = String(report.reason || "").toLowerCase();

    // 3) Regelbasierte Erkennung
    const matches = BAD_PATTERNS.filter((rx) => rx.test(plain));
    const reasonHintsInsult =
      reason.includes("beleidig") ||
      reason.includes("insult") ||
      reason.includes("hate");

    const shouldRemove = matches.length > 0 || reasonHintsInsult;

    // 4) Aktion: Soft-Delete + Moderations-Metadaten
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

      logger.info("Post auto-removed", { postId, reportId });
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
      logger.info("Post flagged for manual review", { postId, reportId });
    }
  }
);
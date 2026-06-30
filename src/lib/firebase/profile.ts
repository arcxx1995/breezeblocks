import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { AuthSnapshot } from "@/lib/firebase/auth";

export async function ensureSignedProfile(player: AuthSnapshot) {
  if (!player.uid || player.provider !== "google") return;

  const db = getFirebaseDb();
  if (!db) return;

  await setDoc(
    doc(db, "users", player.uid),
    {
      userId: player.uid,
      authProvider: "google",
      displayName: player.displayName,
      avatarUrl: player.avatarUrl,
      totalWins: 0,
      totalLosses: 0,
      totalDraws: 0,
      totalGamesPlayed: 0,
      totalBoxesWon: 0,
      highestBoxesSingleGame: 0,
      updatedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    },
    { merge: true },
  );
}

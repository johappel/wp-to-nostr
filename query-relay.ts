#!/usr/bin/env -S deno run --allow-net --allow-env=NOSTR_RELAY,NOSTR_PRIVATE_KEY
/**
 * query-relay.ts
 *
 * Fragt alle kind:31923-Events (Calendar) vom Relay ab,
 * optional gefiltert nach einem Public Key.
 *
 * Lokal (ohne Filter – alle Events):
 *   deno task query-relay
 *
 * Mit Filter (nur von deinem Public Key):
 *   NOSTR_PRIVATE_KEY=nsec1... deno task query-relay
 *   oder:
 *   PUBLIC_KEY=<hex> deno task query-relay
 */

import { getPublicKey, SimplePool } from "nostr-tools";
import { decode } from "nostr-tools/nip19";

const NOSTR_RELAY = Deno.env.get("NOSTR_RELAY") ?? "wss://relay-rpi.edufeed.org";
const PRIVKEY_RAW = Deno.env.get("NOSTR_PRIVATE_KEY");
const PUBKEY_RAW = Deno.env.get("PUBLIC_KEY");

function resolvePubkey(): string | null {
  // Option 1: PUBLIC_KEY direkt angegeben
  if (PUBKEY_RAW) {
    const trimmed = PUBKEY_RAW.trim();
    if (/^[0-9a-f]{64}$/i.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    throw new Error("PUBLIC_KEY muss eine 64-stellige Hex-Zeichenkette sein.");
  }

  // Option 2: Aus NOSTR_PRIVATE_KEY berechnen
  if (PRIVKEY_RAW) {
    const trimmed = PRIVKEY_RAW.trim();
    let privkey: Uint8Array;

    if (trimmed.startsWith("nsec")) {
      const decoded = decode(trimmed);
      if (decoded.type !== "nsec") throw new Error("Ungültiger nsec-Schlüssel.");
      privkey = decoded.data as Uint8Array;
    } else if (/^[0-9a-f]{64}$/i.test(trimmed)) {
      privkey = Uint8Array.from(
        trimmed.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
      );
    } else {
      throw new Error("NOSTR_PRIVATE_KEY muss nsec1… oder 64-stellige Hex sein.");
    }

    return getPublicKey(privkey);
  }

  // Option 3: Kein Filter – alle Events
  return null;
}

async function main() {
  const pubkey = resolvePubkey();

  console.log(`\n🔍 Query Relay für kind:31923-Events\n`);
  console.log(`   Relay  : ${NOSTR_RELAY}`);
  if (pubkey) {
    console.log(`   Author : ${pubkey}`);
  } else {
    console.log(`   Filter : keine (alle Events)`);
  }
  console.log();

  const pool = new SimplePool();
  try {
    console.log("⏳ Abrufen vom Relay...\n");

    // NIP-01 Filter: kind:31923, optional mit Author-Filter
    const filter = pubkey
      ? { kinds: [31923], authors: [pubkey] }
      : { kinds: [31923] };

    const events = await pool.querySync([NOSTR_RELAY], filter);

    if (events.length === 0) {
      console.log("❌ Keine Events gefunden.\n");
      return;
    }

    console.log(`✅ ${events.length} Events gefunden\n`);

    // Sortieren nach created_at (neueste zuerst)
    events.sort((a, b) => b.created_at - a.created_at);

    for (const evt of events) {
      const title = evt.tags.find((t) => t[0] === "title")?.[1] ?? "(kein Titel)";
      const dTag = evt.tags.find((t) => t[0] === "d")?.[1] ?? "(kein d-Tag)";
      const startSec = Number(evt.tags.find((t) => t[0] === "start")?.[1] ?? 0);
      const startStr = startSec ? new Date(startSec * 1000).toISOString() : "?";
      const hash = evt.tags.find((t) => t[0] === "x")?.[1] ?? "(kein Hash)";

      console.log(`  📌 "${title}"`);
      console.log(`     d-Tag : ${dTag}`);
      console.log(`     Start : ${startStr}`);
      console.log(`     Hash  : ${hash ? `${hash.slice(0, 16)}…` : hash}`);
      console.log(`     Event ID: ${evt.id.slice(0, 16)}…`);
      console.log();
    }

    console.log(`📊 Zusammenfassung:`);
    console.log(`   Insgesamt: ${events.length} Events auf dem Relay`);
  } finally {
    pool.close([NOSTR_RELAY]);
  }
}

main().catch((err) => {
  console.error(`❌ Fehler: ${(err as Error).message}`);
  Deno.exit(1);
});

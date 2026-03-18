#!/usr/bin/env -S deno run --allow-net --allow-env=NOSTR_RELAY,NOSTR_PRIVATE_KEY,PUBLIC_KEY
/**
 * query-relay.ts
 *
 * Fragt alle kind:31923-Events (Calendar) vom Relay ab.
 *
 * Verwendung:
 *   deno task query-relay                        # alle Events
 *   deno task query-relay -- --limit=10          # max. 10 Events
 *   deno task query-relay -- --tag=religion      # nur t-Tag "religion"
 *   deno task query-relay -- --search=Vortrag    # Titelsuche
 *   deno task query-relay -- --relay=wss://...
 *   PUBLIC_KEY=<hex> deno task query-relay
 *   NOSTR_PRIVATE_KEY=nsec1... deno task query-relay
 */

import { getPublicKey, SimplePool } from "nostr-tools";
import { decode } from "nostr-tools/nip19";
import { parseArgs } from "jsr:@std/cli/parse-args";

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
  const args = parseArgs(Deno.args, {
    string: ["limit", "tag", "search", "relay"],
    default: {},
  });

  const relay   = (args.relay as string | undefined) ?? NOSTR_RELAY;
  const limit   = args.limit   ? Number(args.limit)          : undefined;
  const tagFilter = args.tag   ? (args.tag as string).toLowerCase() : undefined;
  const search  = args.search  ? (args.search as string).toLowerCase() : undefined;

  const pubkey = resolvePubkey();

  console.log(`\n🔍 Query Relay für kind:31923-Events\n`);
  console.log(`   Relay  : ${relay}`);
  if (pubkey)    console.log(`   Author : ${pubkey}`);
  if (tagFilter) console.log(`   Tag    : ${tagFilter}`);
  if (search)    console.log(`   Suche  : "${search}"`);
  if (limit)     console.log(`   Limit  : ${limit}`);
  console.log();

  const pool = new SimplePool();
  try {
    console.log("⏳ Abrufen vom Relay...\n");

    // NIP-01 Filter: kind:31923, optional mit Author- und Tag-Filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = { kinds: [31923] };
    if (pubkey)    filter["authors"] = [pubkey];
    if (tagFilter) filter["#t"]      = [tagFilter];
    if (limit)     filter["limit"]   = limit;

    let events = await pool.querySync([relay], filter);

    // Titelsuche (client-seitig, da Relay kein Volltextsuche macht)
    if (search) {
      events = events.filter((e) => {
        const title = e.tags.find((t) => t[0] === "title")?.[1] ?? "";
        return title.toLowerCase().includes(search);
      });
    }

    if (events.length === 0) {
      console.log("❌ Keine Events gefunden.\n");
      return;
    }

    // Sortieren nach Start-Timestamp (neueste zuerst)
    events.sort((a, b) => {
      const aStart = Number(a.tags.find((t) => t[0] === "start")?.[1] ?? 0);
      const bStart = Number(b.tags.find((t) => t[0] === "start")?.[1] ?? 0);
      return bStart - aStart;
    });

    // Limit client-seitig nochmal anwenden (Relay hält es nicht immer ein)
    const displayed = limit ? events.slice(0, limit) : events;
    console.log(`✅ ${events.length} Events gefunden${limit ? ` (zeige ${displayed.length})` : ""}\n`);

    for (const evt of displayed) {
      const title    = evt.tags.find((t) => t[0] === "title")?.[1]  ?? "(kein Titel)";
      const dTag     = evt.tags.find((t) => t[0] === "d")?.[1]      ?? "(kein d-Tag)";
      const startSec = Number(evt.tags.find((t) => t[0] === "start")?.[1] ?? 0);
      const startStr = startSec ? new Date(startSec * 1000).toISOString() : "?";
      const tTags    = evt.tags.filter((t) => t[0] === "t").map((t) => t[1]).join(", ");

      console.log(`  📌 "${title}"`);
      console.log(`     d-Tag : ${dTag}`);
      console.log(`     Start : ${startStr}`);
      if (tTags)  console.log(`     Tags  : ${tTags}`);
      console.log(`     ID    : ${evt.id.slice(0, 16)}…`);
      console.log();
    }

    console.log(`📊 Zusammenfassung: ${events.length} Events auf dem Relay`);
  } finally {
    pool.close([relay]);
  }
}

main().catch((err) => {
  console.error(`❌ Fehler: ${(err as Error).message}`);
  Deno.exit(1);
});

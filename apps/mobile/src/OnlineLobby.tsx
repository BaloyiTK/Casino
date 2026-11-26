import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { applyGameAction, createRoom, getGameSession, getRoom, isSupabaseConfigured, joinRoom, joinPublicRoom, listPublicRooms, watchRoom, type OnlineGameSession, type RoomSummary, type RoomVisibility } from "./rooms";
import OnlineGame from "./OnlineGame";
import type { GameMode } from "./game";

const ACTIVE_ROOM_KEY = "casino.activeRoomId";

async function readActiveRoomId(): Promise<string | null> {
  if (Platform.OS === "web") return typeof localStorage !== "undefined" ? localStorage.getItem(ACTIVE_ROOM_KEY) : null;
  return SecureStore.getItemAsync(ACTIVE_ROOM_KEY);
}

async function saveActiveRoomId(roomId: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") localStorage.setItem(ACTIVE_ROOM_KEY, roomId);
    return;
  }
  await SecureStore.setItemAsync(ACTIVE_ROOM_KEY, roomId);
}

async function clearActiveRoomId(): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") localStorage.removeItem(ACTIVE_ROOM_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(ACTIVE_ROOM_KEY);
}

export default function OnlineLobby() {
  const [mode, setMode] = useState<GameMode>("two");
  const [visibility, setVisibility] = useState<RoomVisibility>("public");
  const [displayName, setDisplayName] = useState("Player");
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [gameSession, setGameSession] = useState<OnlineGameSession | null>(null);
  const [publicRooms, setPublicRooms] = useState<RoomSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refreshRooms() {
    try { setPublicRooms(await listPublicRooms()); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load public rooms."); }
  }

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void refreshRooms();
    const refreshInterval = setInterval(() => { void refreshRooms(); }, 8000);
    return () => clearInterval(refreshInterval);
  }, []);

  // Restore the player's active room after app reload/restart. A playing room
  // is rehydrated from the server so the current match and private hand return.
  useEffect(() => {
    let mounted = true;
    const restore = async () => {
      if (!isSupabaseConfigured) return;
      try {
        const roomId = await readActiveRoomId();
        if (!roomId || !mounted) return;
        const restoredRoom = await getRoom(roomId);
        if (!mounted) return;
        setRoom(restoredRoom);
        if (restoredRoom.status === "playing") {
          const restoredSession = await getGameSession(roomId, "get");
          if (mounted) setGameSession(restoredSession);
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : "Could not restore your previous match.");
      }
    };
    void restore();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!room) return;
    let mounted = true;
    const refresh = async () => {
      try {
        const latest = await getRoom(room.room_id);
        if (!mounted) return;
        setRoom(latest);
        if (latest.status === "playing") {
          const session = await getGameSession(room.room_id, "get");
          if (mounted) setGameSession(session);
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : "Could not refresh room.");
      }
    };
    void refresh();
    const refreshInterval = setInterval(() => { void refresh(); }, 5000);
    const unsubscribe = watchRoom(room.room_id, () => { void refresh(); });
    return () => { mounted = false; clearInterval(refreshInterval); unsubscribe(); };
  }, [room?.room_id]);

  async function create() {
    setBusy(true); setError("");
    try { const created = await createRoom(mode, visibility, displayName); await saveActiveRoomId(created.room_id); setRoom(created); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not create room."); }
    finally { setBusy(false); }
  }

  async function join(code: string) {
    setBusy(true); setError("");
    try {
      const result = await joinRoom(code, displayName);
      await saveActiveRoomId(result.room_id);
      setRoom(await getRoom(result.room_id));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not join room."); }
    finally { setBusy(false); }
  }

  async function joinPublic(roomId: string) {
    setBusy(true); setError("");
    try {
      const result = await joinPublicRoom(roomId, displayName);
      await saveActiveRoomId(result.room_id);
      setRoom(await getRoom(result.room_id));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not join that public slot."); }
    finally { setBusy(false); }
  }

  async function startGame() {
    if (!room) return;
    setBusy(true); setError("");
    try {
      const session = await getGameSession(room.room_id, "start");
      setGameSession(session);
      setRoom(await getRoom(room.room_id));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start the game."); }
    finally { setBusy(false); }
  }

  async function submitAction(action: "draft" | "end-turn" | "create-build" | "top-up-build" | "capture-build" | "capture-loose" | "recover-build" | "shiya" | "request-build-transfer" | "approve-build-transfer" | "reject-build-transfer" | "forfeit", cardId?: string, combination?: { handCardIds: string[]; floorCardIds: string[]; opponentPileCardIds: string[] }, buildId?: string, targetCardId?: string, capturedBuildId?: string) {
    if (!room) return;
    setBusy(true); setError("");
    try {
      setGameSession(await applyGameAction(room.room_id, action, cardId, combination, buildId, targetCardId, capturedBuildId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply that move.");
      try { setGameSession(await getGameSession(room.room_id, "get")); } catch { /* Keep the original action error visible. */ }
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!room) return;
    await Share.share({ message: "Join my Casino game. Room code: " + room.room_code });
  }


  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.kicker}>{gameSession ? "LIVE GAME" : room ? "WAITING LOBBY" : "THE TABLE IS YOURS"}</Text>
        <Text style={styles.hero}>{gameSession ? "Your game is underway." : room ? "Your table is ready." : "Every card has a purpose."}</Text>
        {room ? (gameSession ? (
          <OnlineGame session={gameSession} room={room} busy={busy} onDraft={(cardId) => void submitAction("draft", cardId)} onEndTurn={() => void submitAction("end-turn")} onCreateBuild={(combination) => void submitAction("create-build", undefined, combination)} onTopUp={(buildId, handCardIds) => void submitAction("top-up-build", undefined, { handCardIds, floorCardIds: [], opponentPileCardIds: [] }, buildId)} onCaptureBuild={(buildId, selection) => void submitAction("capture-build", undefined, selection, buildId)} onCaptureLoose={(handCardId, floorCardId) => void submitAction("capture-loose", handCardId, undefined, undefined, floorCardId)} onRecoverBuild={(capturedBuildId, selection) => void submitAction("recover-build", undefined, selection, undefined, undefined, capturedBuildId)} onShiya={(buildId) => void submitAction("shiya", undefined, undefined, buildId)} onRequestTransfer={(buildId) => void submitAction("request-build-transfer", undefined, undefined, buildId)} onApproveTransfer={(buildId) => void submitAction("approve-build-transfer", undefined, undefined, buildId)} onRejectTransfer={(buildId) => void submitAction("reject-build-transfer", undefined, undefined, buildId)} onForfeit={() => void submitAction("forfeit")} />
        ) : (
          <View style={styles.panel}>
            <Text style={styles.label}>{(room.visibility ?? "private").toUpperCase()} ROOM · {room.game_mode === "two" ? "TWO HANDS" : "FOUR HANDS"}</Text>
            {room.visibility === "private" ? (
              <>
                <Text style={styles.code}>{room.room_code}</Text>
                <Pressable onPress={share} style={styles.primary}><Text style={styles.primaryText}>SHARE INVITE</Text></Pressable>
              </>
            ) : null}
            <Text style={styles.label}>PLAYERS · {room.occupied_slots}/{room.max_players}</Text>
            {(room.players ?? []).map(p => (
              <View key={p.seat} style={styles.playerRow}>
                <Text style={styles.playerName}>Seat {p.seat} · {p.display_name}</Text>
                {p.is_host ? <Text style={styles.host}>HOST</Text> : null}
              </View>
            ))}
            {Array.from({ length: Math.max(0, room.max_players - room.occupied_slots) }, (_, i) => (
              <View key={i} style={styles.openSlot}><Text style={styles.muted}>Seat {room.occupied_slots + i + 1} · Waiting for player</Text></View>
            ))}
            {room.status === "playing" ? <Text style={styles.muted}>The host has started the game. Your private hand is loading…</Text> : <Text style={styles.muted}>Waiting for every player slot to be filled.</Text>}
            {room.status === "waiting" && room.occupied_slots === room.max_players && room.players?.some((p) => p.is_host && p.is_me) ? (
              <Pressable onPress={() => void startGame()} disabled={busy} style={styles.primary}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>SHUFFLE & DEAL</Text>}</Pressable>
            ) : null}
            <Pressable onPress={() => { void clearActiveRoomId(); setRoom(null); setGameSession(null); setError(""); void refreshRooms(); }} style={styles.secondary}><Text style={styles.secondaryText}>BACK TO LOBBY</Text></Pressable>
          </View>
        )) : (
          <>
            <View style={styles.panel}>
              <Text style={styles.label}>PLAYER NAME</Text>
              <TextInput value={displayName} onChangeText={setDisplayName} maxLength={24} placeholder="Enter your name" style={styles.input} />
              <Text style={styles.label}>CHOOSE GAME</Text>
              <View style={styles.options}>
                <Pressable onPress={() => setMode("two")} style={[styles.option, mode === "two" && styles.optionActive]}>
                  <Text style={styles.optionTitle}>Two Hands</Text><Text style={styles.muted}>1 vs 1 · 2 players</Text>
                </Pressable>
                <Pressable onPress={() => setMode("four")} style={[styles.option, mode === "four" && styles.optionActive]}>
                  <Text style={styles.optionTitle}>Four Hands</Text><Text style={styles.muted}>2 vs 2 · 4 players</Text>
                </Pressable>
              </View>
              <Text style={styles.label}>ROOM VISIBILITY</Text>
              <View style={styles.options}>
                <Pressable onPress={() => setVisibility("public")} style={[styles.option, visibility === "public" && styles.optionActive]}><Text style={styles.optionTitle}>Public</Text><Text style={styles.muted}>Visible in the lobby</Text></Pressable>
                <Pressable onPress={() => setVisibility("private")} style={[styles.option, visibility === "private" && styles.optionActive]}><Text style={styles.optionTitle}>Private</Text><Text style={styles.muted}>Invite by code</Text></Pressable>
              </View>
              <Pressable onPress={create} disabled={busy || !displayName.trim() || !isSupabaseConfigured} style={styles.primary}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>CREATE {visibility.toUpperCase()} ROOM</Text>}
              </Pressable>
              {!isSupabaseConfigured ? <Text style={styles.warning}>Add the Supabase project URL and anon key. See docs/ONLINE_MULTIPLAYER_SETUP.md.</Text> : null}
            </View>
            <View style={styles.panel}>
              <Text style={styles.label}>JOIN WITH ROOM CODE</Text>
              <TextInput value={joinCode} onChangeText={setJoinCode} autoCapitalize="characters" maxLength={6} placeholder="6-character code" style={styles.input} />
              <Pressable onPress={() => void join(joinCode)} disabled={busy || joinCode.trim().length !== 6 || !isSupabaseConfigured} style={styles.secondary}><Text style={styles.secondaryText}>JOIN ROOM</Text></Pressable>
            </View>
            <View style={styles.panel}>
              <View style={styles.lobbyHeader}><Text style={styles.label}>PUBLIC TABLES</Text><Pressable onPress={() => void refreshRooms()}><Text style={styles.refresh}>REFRESH ↻</Text></Pressable></View>
              {publicRooms.length ? publicRooms.map(r => (
                <View key={r.room_id} style={styles.publicRoom}>
                  <View style={styles.publicRoomInfo}>
                    <Text style={styles.optionTitle}>{r.game_mode === "two" ? "Two Hands" : "Four Hands"}</Text>
                    <Text style={styles.muted}>{r.occupied_slots}/{r.max_players} players seated</Text>
                  </View>
                  <View style={styles.publicSlot}>
                    <View><Text style={styles.slotTitle}>OPEN SLOT</Text><Text style={styles.muted}>{r.max_players - r.occupied_slots} {r.max_players - r.occupied_slots === 1 ? "seat" : "seats"} available</Text></View>
                    <Pressable onPress={() => void joinPublic(r.room_id)} disabled={busy || !displayName.trim()} style={styles.join}><Text style={styles.primaryText}>JOIN TABLE</Text></Pressable>
                  </View>
                </View>
              )) : <Text style={styles.muted}>No public tables with open slots right now.</Text>}
            </View>
          </>
        )}
        {!!error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.footer}>40 CARDS · ACE TO 10 · NO FACE CARDS</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f2eb" },
  page: { padding: 22, paddingBottom: 48 },
  kicker: { color: "#9a8050", fontSize: 10, fontWeight: "800", letterSpacing: 2, marginTop: 24 },
  hero: { color: "#1b2a22", fontSize: 37, lineHeight: 43, fontWeight: "300", marginTop: 12, marginBottom: 22 },
  panel: { backgroundColor: "#fbfaf6", borderWidth: 1, borderColor: "#dedfd5", padding: 17, marginBottom: 13 },
  label: { color: "#8d7955", fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginBottom: 11, marginTop: 5 },
  input: { borderWidth: 1, borderColor: "#dedfd5", backgroundColor: "#fffefa", padding: 13, color: "#1b2a22", marginBottom: 15 },
  options: { flexDirection: "row", gap: 9, marginBottom: 16 },
  option: { flex: 1, borderWidth: 1, borderColor: "#dedfd5", padding: 12 },
  optionActive: { borderColor: "#245b43", backgroundColor: "#f0f4ed" },
  optionTitle: { color: "#1b2a22", fontSize: 12, fontWeight: "800" },
  muted: { color: "#7c877e", fontSize: 10, marginTop: 5, lineHeight: 15 },
  primary: { backgroundColor: "#174c39", padding: 16, alignItems: "center", justifyContent: "center", minHeight: 48, marginTop: 5 },
  primaryText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  secondary: { backgroundColor: "#e5e4db", padding: 15, alignItems: "center", marginTop: 8 },
  secondaryText: { color: "#1b2a22", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  warning: { color: "#8b6330", fontSize: 10, lineHeight: 15, marginTop: 12 },
  code: { color: "#174c39", fontSize: 38, fontWeight: "800", letterSpacing: 8, textAlign: "center", paddingVertical: 16 },
  playerRow: { borderTopWidth: 1, borderColor: "#e5e4db", paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  playerName: { color: "#1b2a22", fontSize: 12, fontWeight: "700" },
  host: { color: "#9a8050", fontSize: 9, fontWeight: "800" },
  openSlot: { borderWidth: 1, borderStyle: "dashed", borderColor: "#cbd2c7", padding: 12, marginBottom: 7 },
  publicRoom: { borderTopWidth: 1, borderColor: "#e5e4db", paddingVertical: 12 },
  publicRoomInfo: { marginBottom: 10 },
  publicSlot: { borderWidth: 1, borderStyle: "dashed", borderColor: "#cbd2c7", padding: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  slotTitle: { color: "#245b43", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  lobbyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  refresh: { color: "#245b43", fontSize: 9, fontWeight: "800" },
  join: { backgroundColor: "#174c39", paddingHorizontal: 15, paddingVertical: 10 },
  error: { color: "#a83232", fontSize: 11, marginVertical: 10 },
  footer: { color: "#929b91", textAlign: "center", fontSize: 9, letterSpacing: 1.2, marginTop: 15 }
});

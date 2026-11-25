import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { OnlineGameSession, RoomSummary } from "./rooms";

type Props = {
  session: OnlineGameSession;
  room: RoomSummary;
  busy: boolean;
  onDraft: (cardId: string) => void;
  onEndTurn: () => void;
  onCreateBuild: (combination: { handCardIds: string[]; floorCardIds: string[]; opponentPileCardIds: string[] }) => void;
  onTopUp: (buildId: string, handCardIds: string[]) => void;
  onCaptureBuild: (buildId: string, selection: { handCardIds: string[]; floorCardIds: string[]; opponentPileCardIds: string[] }) => void;
  onCaptureLoose: (handCardId: string, floorCardId: string) => void;
};

function cardLabel(card: { rank: number; suit: string }) {
  return `${card.rank === 1 ? "A" : card.rank}${card.suit}`;
}

export default function OnlineGame({ session, room, busy, onDraft, onEndTurn, onCreateBuild, onTopUp, onCaptureBuild, onCaptureLoose }: Props) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [buildMode, setBuildMode] = useState(false);
  const [buildHandIds, setBuildHandIds] = useState<string[]>([]);
  const [buildFloorIds, setBuildFloorIds] = useState<string[]>([]);
  const [topUpBuildId, setTopUpBuildId] = useState<string | null>(null);
  const [topUpHandIds, setTopUpHandIds] = useState<string[]>([]);
  const [captureBuildId, setCaptureBuildId] = useState<string | null>(null);
  const [captureHandIds, setCaptureHandIds] = useState<string[]>([]);
  const [captureFloorIds, setCaptureFloorIds] = useState<string[]>([]);
  const [capturePileIds, setCapturePileIds] = useState<string[]>([]);
  const myTurn = session.currentSeat === session.ownSeat && session.phase === "playing";
  useEffect(() => { setSelectedCardId(null); setBuildMode(false); setBuildHandIds([]); setBuildFloorIds([]); setTopUpBuildId(null); setTopUpHandIds([]); setCaptureBuildId(null); setCaptureHandIds([]); setCaptureFloorIds([]); setCapturePileIds([]); }, [session.version]);
  const toggleId = (ids: string[], id: string) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
  const buildValue = [...session.ownHand.filter((card) => buildHandIds.includes(card.id)), ...session.floor.filter((card) => buildFloorIds.includes(card.id))].reduce((sum, card) => sum + card.rank, 0);
  const topUpBuild = session.builds.find((build) => build.id === topUpBuildId);
  const selectedHandCard = session.ownHand.find((card) => card.id === selectedCardId);
  const topUpTotal = session.ownHand.filter((card) => topUpHandIds.includes(card.id)).reduce((sum, card) => sum + card.rank, 0);
  const captureBuild = session.builds.find((build) => build.id === captureBuildId);
  const captureTotal = [...session.ownHand.filter((card) => captureHandIds.includes(card.id)), ...session.floor.filter((card) => captureFloorIds.includes(card.id)), ...session.capturedPiles.flatMap((pile) => pile.topCard && capturePileIds.includes(pile.topCard.id) ? [pile.topCard] : [])].reduce((sum, card) => sum + card.rank, 0);
  const clearBuildSelection = () => { setBuildHandIds([]); setBuildFloorIds([]); setBuildMode(false); };
  const players = room.players ?? [];
  const nameForSeat = (seat: number) =>
    players.find((player) => player.seat === seat)?.display_name ?? `Player ${seat}`;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.kicker}>{session.gameMode === "two" ? "TWO HANDS" : "FOUR HANDS"} · ROUND {session.round}</Text>
      <Text style={styles.title}>{session.phase === "playing" ? "The game is dealt." : session.phase === "round-complete" ? "Round complete." : "Game complete."}</Text>
      <View style={styles.turnPanel}>
        <Text style={styles.turnLabel}>{session.phase !== "playing" ? "MATCH STATUS" : myTurn ? "YOUR TURN" : "CURRENT TURN"}</Text>
        <Text style={styles.turnName}>{session.phase === "game-complete" ? "Game finished" : session.phase === "round-complete" ? "Round finished" : nameForSeat(session.currentSeat)}</Text>
        <Text style={styles.muted}>Seat {session.currentSeat} · {session.deckCount} cards remain in the deck</Text>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.tableLabel}>THE FLOOR</Text>
          <Text style={styles.tableLabel}>{session.floor.length} CARDS</Text>
        </View>
        {session.floor.length ? (
          <View style={styles.cardGrid}>
            {session.floor.map((card) => (
              <Pressable key={card.id} disabled={!myTurn || busy || (!buildMode && !captureBuildId && (!selectedHandCard || selectedHandCard.rank !== card.rank))} onPress={() => captureBuildId ? setCaptureFloorIds((ids) => toggleId(ids, card.id)) : buildMode ? setBuildFloorIds((ids) => toggleId(ids, card.id)) : selectedCardId ? onCaptureLoose(selectedCardId, card.id) : undefined} style={[styles.floorCard, (buildFloorIds.includes(card.id) || captureFloorIds.includes(card.id)) && styles.selectedCard]}>
                <Text style={[styles.cardFace, (card.suit === "♥" || card.suit === "♦") && styles.red]}>{cardLabel(card)}</Text>
                {buildMode || captureBuildId ? <Text style={styles.cardIndex}>{captureBuildId ? captureFloorIds.includes(card.id) ? "CAPTURE" : "ADD" : buildFloorIds.includes(card.id) ? "SELECTED" : "ADD"}</Text> : selectedHandCard?.rank === card.rank ? <Text style={styles.cardIndex}>MATCH · CAPTURE</Text> : null}
              </Pressable>
            ))}
          </View>
        ) : <Text style={styles.emptyFloor}>The floor is clear.</Text>}
      </View>

      <View style={styles.buildsPanel}>
        <View style={styles.tableHeader}>
          <Text style={styles.buildsHeading}>ACTIVE BUILDS</Text>
          <Text style={styles.buildsHeading}>{session.builds.length} BUILDS</Text>
        </View>
        {session.builds.length ? session.builds.map((build) => (
          <View key={build.id} style={styles.buildRow}>
            <View>
              <Text style={styles.buildValue}>VALUE {build.value}</Text>
              <Text style={styles.buildOwner}>Owned by {nameForSeat(build.ownerSeat)} · Team {build.team}</Text>
              {session.gameMode === "four" && build.ownerSeat !== session.ownSeat && build.team === (session.ownSeat % 2 === 1 ? 1 : 2) ? <Pressable disabled={!myTurn || busy} onPress={() => { setBuildMode(false); setTopUpBuildId(build.id); setTopUpHandIds([]); setSelectedCardId(null); }} style={styles.topUpButton}><Text style={styles.topUpButtonText}>TOP UP PARTNER BUILD</Text></Pressable> : null}
            </View>
            {!(session.gameMode === "four" && build.ownerSeat !== session.ownSeat && build.team === (session.ownSeat % 2 === 1 ? 1 : 2)) ? <Pressable disabled={!myTurn || busy} onPress={() => { setBuildMode(false); setTopUpBuildId(null); setCaptureBuildId(build.id); setCaptureHandIds([]); setCaptureFloorIds([]); setCapturePileIds([]); setSelectedCardId(null); }} style={styles.topUpButton}><Text style={styles.topUpButtonText}>CAPTURE BUILD</Text></Pressable> : null}
            <View style={styles.buildCards}>
              {build.cards.map((card) => <Text key={card.id} style={[styles.buildCard, (card.suit === "♥" || card.suit === "♦") && styles.red]}>{cardLabel(card)}</Text>)}
            </View>
          </View>
        )) : <Text style={styles.emptyFloor}>No active builds.</Text>}
      </View>

      <View style={styles.buildsPanel}>
        <Text style={styles.buildsHeading}>OPPONENT CAPTURED PILES · VISIBLE TOP CARDS</Text>
        {session.capturedPiles.filter((pile) => pile.count > 0 && (session.gameMode === "two" ? pile.seat !== session.ownSeat : (pile.seat % 2) !== (session.ownSeat % 2))).map((pile) => (
          <Pressable key={pile.seat} disabled={!myTurn || busy || !captureBuildId || !pile.topCard} onPress={() => pile.topCard && setCapturePileIds((ids) => toggleId(ids, pile.topCard!.id))} style={[styles.opponent, pile.topCard && capturePileIds.includes(pile.topCard.id) && styles.selectedCard]}>
            <Text style={styles.opponentName}>Seat {pile.seat} · {pile.count} captured</Text>
            <Text style={styles.buildValue}>{pile.topCard ? cardLabel(pile.topCard) : "—"}{pile.topCard && capturePileIds.includes(pile.topCard.id) ? " · SELECTED" : ""}</Text>
          </Pressable>
        ))}
        {!session.capturedPiles.some((pile) => pile.count > 0 && (session.gameMode === "two" ? pile.seat !== session.ownSeat : (pile.seat % 2) !== (session.ownSeat % 2))) ? <Text style={styles.emptyFloor}>No opponent pile cards are available.</Text> : null}
      </View>

      <Text style={styles.section}>YOUR HAND · {session.ownHandCount} CARDS</Text>
      <View style={styles.hand}>
        {session.ownHand.map((card, index) => (
          <Pressable key={card.id} onPress={() => buildMode ? setBuildHandIds((ids) => toggleId(ids, card.id)) : topUpBuildId ? setTopUpHandIds((ids) => toggleId(ids, card.id)) : captureBuildId ? setCaptureHandIds((ids) => toggleId(ids, card.id)) : setSelectedCardId(card.id)} disabled={!myTurn || busy} style={[styles.ownCard, (buildMode ? buildHandIds.includes(card.id) : topUpBuildId ? topUpHandIds.includes(card.id) : captureBuildId ? captureHandIds.includes(card.id) : selectedCardId === card.id) && styles.selectedCard]}>
            <Text style={[styles.cardFace, (card.suit === "♥" || card.suit === "♦") && styles.red]}>{cardLabel(card)}</Text>
            <Text style={styles.cardIndex}>{buildMode ? buildHandIds.includes(card.id) ? "BUILD" : index + 1 : topUpBuildId ? topUpHandIds.includes(card.id) ? "TOP UP" : index + 1 : captureBuildId ? captureHandIds.includes(card.id) ? "CAPTURE" : index + 1 : index + 1}</Text>
          </Pressable>
        ))}
      </View>

      {session.phase === "playing" ? (
        <View style={styles.actions}>
          <Text style={styles.actionHint}>{!myTurn ? "Waiting for the current player." : buildMode ? "Select at least one card from your hand and any loose floor cards." : selectedCardId ? "Selected card is ready to draft." : "Select a card to draft, or start creating a build."}</Text>
          {buildMode ? (
            <View style={styles.buildPanel}>
              <Text style={styles.buildTotal}>BUILD VALUE: {buildValue}</Text>
              <Text style={styles.actionHint}>{buildHandIds.length} hand card(s) · {buildFloorIds.length} floor card(s)</Text>
              <View style={styles.actionRow}>
                <Pressable onPress={() => onCreateBuild({ handCardIds: buildHandIds, floorCardIds: buildFloorIds, opponentPileCardIds: [] })} disabled={!myTurn || busy || buildHandIds.length === 0 || buildValue < 1 || buildValue > 10} style={[styles.actionButton, (!myTurn || busy || buildHandIds.length === 0 || buildValue < 1 || buildValue > 10) && styles.disabled]}><Text style={styles.actionText}>CREATE BUILD</Text></Pressable>
                <Pressable onPress={clearBuildSelection} disabled={busy} style={styles.endButton}><Text style={styles.actionText}>CANCEL</Text></Pressable>
              </View>
            </View>
          ) : topUpBuildId ? (
            <View style={styles.buildPanel}>
              <Text style={styles.buildTotal}>PARTNER BUILD TOP-UP</Text>
              <Text style={styles.actionHint}>Build value: {topUpBuild?.value ?? "Unavailable"} · Your selected total: {topUpTotal}</Text>
              <Text style={styles.actionHint}>Select one card equal to the build value, or multiple cards that add up exactly to it. Ownership and build value stay unchanged.</Text>
              <View style={styles.actionRow}>
                <Pressable onPress={() => onTopUp(topUpBuildId, topUpHandIds)} disabled={!myTurn || busy || topUpHandIds.length === 0 || !topUpBuild || topUpTotal !== topUpBuild.value} style={[styles.actionButton, (!myTurn || busy || topUpHandIds.length === 0 || !topUpBuild || topUpTotal !== topUpBuild.value) && styles.disabled]}><Text style={styles.actionText}>ADD TO BUILD</Text></Pressable>
                <Pressable onPress={() => { setTopUpBuildId(null); setTopUpHandIds([]); }} disabled={busy} style={styles.endButton}><Text style={styles.actionText}>CANCEL</Text></Pressable>
              </View>
            </View>
          ) : captureBuildId ? (
            <View style={styles.buildPanel}>
              <Text style={styles.buildTotal}>CAPTURE BUILD</Text>
              <Text style={styles.actionHint}>Target value: {captureBuild?.value ?? "Unavailable"} · Selected total: {captureTotal}</Text>
              <Text style={styles.actionHint}>Select at least one card from your hand. Add eligible loose floor cards or visible opponent pile tops until the total matches the build exactly.</Text>
              <View style={styles.actionRow}>
                <Pressable onPress={() => onCaptureBuild(captureBuildId, { handCardIds: captureHandIds, floorCardIds: captureFloorIds, opponentPileCardIds: capturePileIds })} disabled={!myTurn || busy || !captureBuild || captureHandIds.length === 0 || captureTotal !== captureBuild.value} style={[styles.actionButton, (!myTurn || busy || !captureBuild || captureHandIds.length === 0 || captureTotal !== captureBuild.value) && styles.disabled]}><Text style={styles.actionText}>CAPTURE</Text></Pressable>
                <Pressable onPress={() => { setCaptureBuildId(null); setCaptureHandIds([]); setCaptureFloorIds([]); setCapturePileIds([]); }} disabled={busy} style={styles.endButton}><Text style={styles.actionText}>CANCEL</Text></Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.actionRow}>
              <Pressable onPress={() => selectedCardId && onDraft(selectedCardId)} disabled={!myTurn || !selectedCardId || busy} style={[styles.actionButton, (!myTurn || !selectedCardId || busy) && styles.disabled]}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>DRAFT TO FLOOR</Text>}
              </Pressable>
              <Pressable onPress={() => { setBuildMode(true); setSelectedCardId(null); }} disabled={!myTurn || busy} style={[styles.endButton, (!myTurn || busy) && styles.disabled]}><Text style={styles.actionText}>BUILD</Text></Pressable>
              <Pressable onPress={onEndTurn} disabled={!myTurn || busy} style={[styles.endButton, (!myTurn || busy) && styles.disabled]}><Text style={styles.actionText}>END TURN →</Text></Pressable>
            </View>
          )}
        </View>
      ) : <Text style={styles.muted}>Scoring and final results are not enabled yet.</Text>}

      <Text style={styles.section}>OTHER PLAYERS</Text>
      {session.opponents.map((opponent) => (
        <View key={opponent.seat} style={styles.opponent}>
          <View>
            <Text style={styles.opponentName}>{nameForSeat(opponent.seat)}</Text>
            <Text style={styles.muted}>Seat {opponent.seat} · {opponent.handCount} cards</Text>
          </View>
          <View style={styles.backCards}>
            {Array.from({ length: Math.min(opponent.handCount, 5) }, (_, i) => (
              <View key={i} style={styles.backCard}><Text style={styles.backMark}>✦</Text></View>
            ))}
          </View>
        </View>
      ))}

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>PRIVATE HAND PROTECTION</Text>
        <Text style={styles.muted}>Only your own cards are sent to this device. Other players' card identities and the remaining deck stay on the server.</Text>
      </View>
      <Text style={styles.footer}>CARD ORDER IS PRESERVED · NO AUTOMATIC SORTING</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 22, paddingBottom: 50, backgroundColor: "#f3f2eb" },
  kicker: { color: "#9a8050", fontSize: 10, fontWeight: "800", letterSpacing: 2, marginTop: 24 },
  title: { color: "#1b2a22", fontSize: 34, lineHeight: 40, fontWeight: "300", marginTop: 12, marginBottom: 22 },
  turnPanel: { backgroundColor: "#174c39", padding: 18, marginBottom: 14 },
  turnLabel: { color: "#d6c59e", fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  turnName: { color: "#fff", fontSize: 24, fontWeight: "700", marginTop: 5 },
  muted: { color: "#9da99f", fontSize: 10, lineHeight: 15, marginTop: 5 },
  table: { backgroundColor: "#245b43", padding: 16, minHeight: 130, marginBottom: 22 },
  tableHeader: { flexDirection: "row", justifyContent: "space-between" },
  tableLabel: { color: "#d6c59e", fontSize: 9, fontWeight: "800", letterSpacing: 1.3 },
  emptyFloor: { color: "#c5d2c8", textAlign: "center", marginTop: 35, fontSize: 12 },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 16 },
  floorCard: { backgroundColor: "#fffefa", borderRadius: 5, width: 42, height: 58, alignItems: "center", justifyContent: "center" },
  buildsPanel: { backgroundColor: "#fbfaf6", borderWidth: 1, borderColor: "#dedfd5", padding: 14, marginBottom: 20 },
  buildsHeading: { color: "#8d7955", fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  buildRow: { borderTopWidth: 1, borderColor: "#e5e4db", paddingVertical: 11, marginTop: 10 },
  buildValue: { color: "#174c39", fontSize: 15, fontWeight: "800" },
  buildOwner: { color: "#7c877e", fontSize: 10, marginTop: 3 },
  topUpButton: { backgroundColor: "#e9ede5", borderWidth: 1, borderColor: "#b9c8b8", paddingHorizontal: 9, paddingVertical: 7, marginTop: 8, alignSelf: "flex-start" },
  topUpButtonText: { color: "#245b43", fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  buildCards: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 8 },
  buildCard: { color: "#1b2a22", backgroundColor: "#f0f0e8", paddingHorizontal: 8, paddingVertical: 5, fontSize: 12, fontWeight: "800" },
  section: { color: "#8d7955", fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginBottom: 11, marginTop: 5 },
  hand: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 },
  ownCard: { backgroundColor: "#fffefa", borderWidth: 1, borderColor: "#d9d9cf", borderRadius: 5, width: 55, height: 78, alignItems: "center", justifyContent: "center" },
  selectedCard: { borderColor: "#b28b45", borderWidth: 2, transform: [{ translateY: -4 }] },
  buildPanel: { marginTop: 10, padding: 12, backgroundColor: "#f0f4ed", borderWidth: 1, borderColor: "#cbd7c9" },
  buildTotal: { color: "#174c39", fontSize: 18, fontWeight: "800", marginBottom: 5 },
  actions: { backgroundColor: "#fbfaf6", borderWidth: 1, borderColor: "#dedfd5", padding: 14, marginBottom: 20 },
  actionHint: { color: "#7c877e", fontSize: 10, marginBottom: 11 },
  actionRow: { flexDirection: "row", gap: 8 },
  actionButton: { flex: 1, backgroundColor: "#174c39", padding: 13, alignItems: "center", justifyContent: "center", minHeight: 45 },
  endButton: { flex: 1, backgroundColor: "#9a8050", padding: 13, alignItems: "center", justifyContent: "center", minHeight: 45 },
  actionText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  disabled: { opacity: 0.4 },
  cardFace: { color: "#1b2a22", fontSize: 18, fontWeight: "800" },
  red: { color: "#b43b3b" },
  cardIndex: { color: "#a0a69e", fontSize: 8, marginTop: 7 },
  opponent: { backgroundColor: "#fbfaf6", borderWidth: 1, borderColor: "#dedfd5", padding: 13, marginBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  opponentName: { color: "#1b2a22", fontSize: 12, fontWeight: "800" },
  backCards: { flexDirection: "row" },
  backCard: { width: 22, height: 32, borderRadius: 3, backgroundColor: "#174c39", borderWidth: 1, borderColor: "#d6c59e", alignItems: "center", justifyContent: "center", marginLeft: -5 },
  backMark: { color: "#d6c59e", fontSize: 9 },
  notice: { backgroundColor: "#e9ede5", borderLeftWidth: 3, borderLeftColor: "#245b43", padding: 14, marginTop: 13 },
  noticeTitle: { color: "#245b43", fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  footer: { color: "#929b91", textAlign: "center", fontSize: 8, letterSpacing: 1, marginTop: 20 }
});

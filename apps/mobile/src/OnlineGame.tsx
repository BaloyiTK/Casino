import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { OnlineGameSession, RoomSummary } from "./rooms";

type Props = {
  session: OnlineGameSession;
  room: RoomSummary;
};

function cardLabel(card: { rank: number; suit: string }) {
  return `${card.rank === 1 ? "A" : card.rank}${card.suit}`;
}

export default function OnlineGame({ session, room }: Props) {
  const myTurn = session.currentSeat === session.ownSeat;
  const players = room.players ?? [];
  const nameForSeat = (seat: number) =>
    players.find((player) => player.seat === seat)?.display_name ?? `Player ${seat}`;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.kicker}>{session.gameMode === "two" ? "TWO HANDS" : "FOUR HANDS"} · ROUND {session.round}</Text>
      <Text style={styles.title}>The game is dealt.</Text>
      <View style={styles.turnPanel}>
        <Text style={styles.turnLabel}>{myTurn ? "YOUR TURN" : "CURRENT TURN"}</Text>
        <Text style={styles.turnName}>{nameForSeat(session.currentSeat)}</Text>
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
              <View key={card.id} style={styles.floorCard}>
                <Text style={[styles.cardFace, (card.suit === "♥" || card.suit === "♦") && styles.red]}>{cardLabel(card)}</Text>
              </View>
            ))}
          </View>
        ) : <Text style={styles.emptyFloor}>The floor is clear.</Text>}
      </View>

      <Text style={styles.section}>YOUR HAND · {session.ownHandCount} CARDS</Text>
      <View style={styles.hand}>
        {session.ownHand.map((card, index) => (
          <View key={card.id} style={styles.ownCard}>
            <Text style={[styles.cardFace, (card.suit === "♥" || card.suit === "♦") && styles.red]}>{cardLabel(card)}</Text>
            <Text style={styles.cardIndex}>{index + 1}</Text>
          </View>
        ))}
      </View>

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
  section: { color: "#8d7955", fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginBottom: 11, marginTop: 5 },
  hand: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 },
  ownCard: { backgroundColor: "#fffefa", borderWidth: 1, borderColor: "#d9d9cf", borderRadius: 5, width: 55, height: 78, alignItems: "center", justifyContent: "center" },
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

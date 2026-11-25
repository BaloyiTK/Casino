import { useMemo, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View
} from "react-native";
import {
  type Card,
  type GameMode,
  type GameState,
  cardLabel,
  endTurn,
  isRed,
  playToFloor,
  startGame
} from "./src/game";

function PlayingCard({
  card,
  selected = false,
  faceDown = false,
  onPress
}: {
  card?: Card;
  selected?: boolean;
  faceDown?: boolean;
  onPress?: () => void;
}) {
  if (faceDown) {
    return <View style={[styles.card, styles.cardBack]}><Text style={styles.cardBackMark}>♠</Text></View>;
  }
  if (!card) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cardLabel(card)}
      onPress={onPress}
      style={[styles.card, isRed(card) ? styles.redCard : styles.blackCard, selected && styles.selectedCard]}
    >
      <Text style={styles.cardRank}>{card.rank === 1 ? "A" : card.rank}</Text>
      <Text style={styles.cardSuit}>{card.suit}</Text>
      <Text style={styles.cardBottom}>{card.rank === 1 ? "A" : card.rank}{card.suit}</Text>
    </Pressable>
  );
}

export default function App() {
  const [mode, setMode] = useState<GameMode>("two");
  const [game, setGame] = useState<GameState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const activePlayer = game?.players[game.currentPlayer];
  const cardsInHands = useMemo(
    () => game?.players.reduce((total, player) => total + player.hand.length, 0) ?? 0,
    [game]
  );

  function beginGame() {
    setGame(startGame(mode));
    setSelected(null);
  }

  function draftCard() {
    if (!game || !selected) return;
    setGame(playToFloor(game, selected));
    setSelected(null);
  }

  function finishTurn() {
    if (!game) return;
    setGame(endTurn(game));
    setSelected(null);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#102b22" />
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Text style={styles.brandMark}>♠</Text>
            <Text style={styles.brand}>CASINO</Text>
          </View>
          <Text style={styles.headerCaption}>OUR RULES. OUR GAME.</Text>
        </View>

        {!game ? (
          <ScrollView contentContainerStyle={styles.welcome}>
            <Text style={styles.kicker}>THE TABLE IS YOURS</Text>
            <Text style={styles.hero}>Every card{"\n"}has a <Text style={styles.heroItalic}>purpose.</Text></Text>
            <Text style={styles.intro}>A custom South African Casino card game. Choose your table and deal the cards.</Text>
            <View style={styles.setupPanel}>
              <Text style={styles.sectionLabel}>CHOOSE YOUR GAME</Text>
              <Pressable onPress={() => setMode("two")} style={[styles.modeOption, mode === "two" && styles.modeActive]}>
                <Text style={styles.modeNumber}>02</Text>
                <View style={styles.modeCopy}><Text style={styles.modeTitle}>Two Hands</Text><Text style={styles.modeSub}>1 vs 1 · Two rounds</Text></View>
                <Text style={styles.radio}>{mode === "two" ? "●" : "○"}</Text>
              </Pressable>
              <Pressable onPress={() => setMode("four")} style={[styles.modeOption, mode === "four" && styles.modeActive]}>
                <Text style={styles.modeNumber}>04</Text>
                <View style={styles.modeCopy}><Text style={styles.modeTitle}>Four Hands</Text><Text style={styles.modeSub}>2 vs 2 · One round</Text></View>
                <Text style={styles.radio}>{mode === "four" ? "●" : "○"}</Text>
              </Pressable>
              <Pressable onPress={beginGame} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>SHUFFLE & DEAL</Text><Text style={styles.primaryButtonArrow}>↗</Text>
              </Pressable>
              <Text style={styles.footnote}>40 CARDS · ACE TO 10 · NO FACE CARDS</Text>
            </View>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.gameContent}>
            <View style={styles.gameTitleRow}>
              <View>
                <Text style={styles.kicker}>ROUND {game.round} · {game.mode === "two" ? "TWO HANDS" : "FOUR HANDS"}</Text>
                <Text style={styles.gameTitle}>The table</Text>
              </View>
              <View style={styles.stats}><Text style={styles.statValue}>{game.deck.length}<Text style={styles.statLabel}> DECK</Text></Text><Text style={styles.statValue}>{game.floor.length}<Text style={styles.statLabel}> FLOOR</Text></Text></View>
            </View>

            <View style={styles.felt}>
              <View style={styles.floorHeader}><Text style={styles.floorLabel}>THE FLOOR</Text><Text style={styles.floorLabel}>{game.floor.length} CARDS</Text></View>
              <View style={styles.floorCards}>
                {game.floor.length ? game.floor.map((card) => <PlayingCard key={card.id} card={card} />) : <Text style={styles.emptyFloor}>The table is clear</Text>}
              </View>
              <Text style={styles.tableMessage}>{game.message}</Text>
            </View>

            <Text style={styles.sectionLabel}>PLAYERS</Text>
            {game.players.map((player) => {
              const isActive = player.id === game.currentPlayer;
              return (
                <View key={player.id} style={[styles.playerPanel, isActive && styles.playerActive]}>
                  <View style={styles.playerTop}>
                    <View style={styles.playerAvatar}><Text style={styles.avatarText}>{player.id + 1}</Text></View>
                    <View style={styles.playerInfo}>
                      <Text style={styles.playerName}>{player.name}</Text>
                      <Text style={styles.playerMeta}>{game.mode === "four" ? `TEAM ${player.team + 1}` : player.id === 0 ? "YOU" : "OPPONENT"} · {player.hand.length} CARDS</Text>
                    </View>
                    {isActive && <Text style={styles.turnTag}>YOUR TURN</Text>}
                  </View>
                  {isActive ? (
                    <View style={styles.hand}>
                      {player.hand.map((card) => <PlayingCard key={card.id} card={card} selected={selected === card.id} onPress={() => setSelected(card.id)} />)}
                      {!player.hand.length && <Text style={styles.emptyHand}>No cards remaining</Text>}
                    </View>
                  ) : (
                    <View style={styles.hand}>{Array.from({ length: Math.min(player.hand.length, 10) }, (_, index) => <PlayingCard key={index} faceDown />)}</View>
                  )}
                </View>
              );
            })}

            <View style={styles.actionArea}>
              <Text style={styles.selectionHint}>{selected ? "Card selected" : "Select a card from your hand"}</Text>
              <View style={styles.actionRow}>
                <Pressable onPress={draftCard} disabled={!selected} style={[styles.actionButton, styles.playButton, !selected && styles.disabledButton]}>
                  <Text style={styles.actionButtonText}>PLAY CARD</Text>
                </Pressable>
                <Pressable onPress={finishTurn} style={[styles.actionButton, styles.endButton]}>
                  <Text style={styles.endButtonText}>END TURN →</Text>
                </Pressable>
              </View>
              {game.phase !== "playing" && (
                <Pressable onPress={() => setGame(null)} style={styles.backButton}><Text style={styles.backButtonText}>BACK TO SETUP</Text></Pressable>
              )}
            </View>
            <Text style={styles.integrityNote}>{cardsInHands + game.deck.length + game.floor.length} / 40 cards currently outside captured piles and builds</Text>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#102b22" },
  screen: { flex: 1, backgroundColor: "#f3f2eb" },
  header: { height: 66, paddingHorizontal: 22, backgroundColor: "#102b22", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: { color: "#d3b77b", fontSize: 23 },
  brand: { color: "#f7f4e9", fontSize: 14, fontWeight: "800", letterSpacing: 3 },
  headerCaption: { color: "#b9c9be", fontSize: 9, letterSpacing: 1.5 },
  welcome: { padding: 25, paddingTop: 42, paddingBottom: 50 },
  kicker: { color: "#9a8050", fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  hero: { color: "#1b2a22", fontSize: 49, lineHeight: 53, fontWeight: "300", letterSpacing: -2, marginTop: 18 },
  heroItalic: { color: "#1c593f", fontStyle: "italic", fontWeight: "500" },
  intro: { color: "#6f7b72", fontSize: 14, lineHeight: 22, marginTop: 18, marginBottom: 28, maxWidth: 330 },
  setupPanel: { backgroundColor: "#fbfaf6", borderWidth: 1, borderColor: "#dedfd5", padding: 19 },
  sectionLabel: { color: "#8d7955", fontSize: 10, fontWeight: "700", letterSpacing: 1.6, marginBottom: 12, marginTop: 8 },
  modeOption: { borderWidth: 1, borderColor: "#dedfd5", padding: 15, flexDirection: "row", alignItems: "center", marginBottom: 9, gap: 13 },
  modeActive: { borderColor: "#245b43", backgroundColor: "#f0f4ed" },
  modeNumber: { color: "#9a8050", fontSize: 22, fontWeight: "300" },
  modeCopy: { flex: 1 },
  modeTitle: { color: "#1b2a22", fontWeight: "700", fontSize: 13 },
  modeSub: { color: "#7c877e", fontSize: 11, marginTop: 4 },
  radio: { color: "#245b43", fontSize: 17 },
  primaryButton: { marginTop: 12, backgroundColor: "#174c39", paddingHorizontal: 17, paddingVertical: 17, flexDirection: "row", justifyContent: "space-between" },
  primaryButtonText: { color: "#fff", fontWeight: "800", fontSize: 11, letterSpacing: 1.2 },
  primaryButtonArrow: { color: "#d9c18c", fontSize: 16 },
  footnote: { color: "#929b91", textAlign: "center", fontSize: 9, letterSpacing: 1.2, marginTop: 16 },
  gameContent: { padding: 17, paddingBottom: 45 },
  gameTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18 },
  gameTitle: { color: "#1b2a22", fontSize: 37, fontWeight: "300", marginTop: 5 },
  stats: { flexDirection: "row", gap: 12, paddingBottom: 7 },
  statValue: { color: "#1b2a22", fontWeight: "800", fontSize: 14 },
  statLabel: { color: "#7b867e", fontSize: 8, letterSpacing: 1 },
  felt: { backgroundColor: "#174c39", borderWidth: 5, borderColor: "#d7d0be", padding: 15, minHeight: 210, marginBottom: 22 },
  floorHeader: { flexDirection: "row", justifyContent: "space-between" },
  floorLabel: { color: "#cbd8ce", fontSize: 9, letterSpacing: 1.3 },
  floorCards: { minHeight: 132, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 7, paddingVertical: 15 },
  emptyFloor: { color: "#c1d1c5", fontSize: 12, letterSpacing: 1 },
  tableMessage: { color: "#d7e1d9", fontSize: 10, textAlign: "center", lineHeight: 15 },
  playerPanel: { backgroundColor: "#fbfaf6", borderWidth: 1, borderColor: "#dedfd5", padding: 13, marginBottom: 10 },
  playerActive: { borderColor: "#6d9278", borderTopWidth: 3 },
  playerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  playerAvatar: { width: 31, height: 31, borderRadius: 16, backgroundColor: "#e8ede5", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#245b43", fontSize: 12, fontWeight: "700" },
  playerInfo: { flex: 1 },
  playerName: { color: "#1b2a22", fontWeight: "700", fontSize: 12 },
  playerMeta: { color: "#818c82", fontSize: 9, marginTop: 3, letterSpacing: 0.7 },
  turnTag: { color: "#245b43", fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  hand: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 13, minHeight: 58 },
  card: { width: 39, height: 57, borderRadius: 5, borderWidth: 1, borderColor: "#deded5", backgroundColor: "#fffefa", alignItems: "center", justifyContent: "center", position: "relative", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 2, elevation: 2 },
  redCard: { color: "#b93636" },
  blackCard: { color: "#1b2922" },
  cardRank: { position: "absolute", top: 3, left: 5, fontSize: 10, fontWeight: "800", color: "inherit" as never },
  cardSuit: { fontSize: 20, color: "#1b2922" },
  cardBottom: { position: "absolute", bottom: 3, right: 4, fontSize: 8, color: "#1b2922", transform: [{ rotate: "180deg" }] },
  cardBack: { backgroundColor: "#315b48", borderColor: "#e8e2d2", borderWidth: 2, justifyContent: "center" },
  cardBackMark: { color: "#e1d6b9", fontSize: 18 },
  selectedCard: { transform: [{ translateY: -7 }], borderColor: "#c8a96b", borderWidth: 2 },
  emptyHand: { color: "#7d897f", fontSize: 11, paddingTop: 12 },
  actionArea: { marginTop: 10 },
  selectionHint: { color: "#78847b", fontSize: 11, marginBottom: 9 },
  actionRow: { flexDirection: "row", gap: 9 },
  actionButton: { flex: 1, alignItems: "center", paddingVertical: 15 },
  playButton: { backgroundColor: "#174c39" },
  disabledButton: { backgroundColor: "#aab5aa" },
  endButton: { backgroundColor: "#e5e4db" },
  actionButtonText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  endButtonText: { color: "#1b2a22", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  backButton: { padding: 13, alignItems: "center", marginTop: 12, borderWidth: 1, borderColor: "#cbd2c7" },
  backButtonText: { color: "#245b43", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  integrityNote: { color: "#9aa399", fontSize: 9, textAlign: "center", marginTop: 20 }
});

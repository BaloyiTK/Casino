import { useEffect, useRef, useState } from "react";
import { Alert, Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
  onRecoverBuild: (capturedBuildId: string, selection: { handCardIds: string[]; floorCardIds: string[]; opponentPileCardIds: string[] }) => void;
  onShiya: (buildId: string) => void;
  onRequestTransfer: (buildId: string) => void;
  onApproveTransfer: (buildId: string) => void;
  onRejectTransfer: (buildId: string) => void;
  onForfeit: () => void;
};

type Pip = { x: number; y: number; inverted?: boolean };

// Bicycle-style double-ended number-card layouts: every rank has exactly
// its value in pips, with the lower-half pips turned for the opposite reader.
function pipPositions(rank: number): Pip[] {
  const pair = (y: number, inverted = false): Pip[] => [
    { x: 31, y, inverted }, { x: 69, y, inverted },
  ];
  const center = (y: number, inverted = false): Pip => ({ x: 50, y, inverted });
  switch (rank) {
    case 1: return [center(50)];
    case 2: return [center(29), center(71, true)];
    case 3: return [center(23), center(50), center(77, true)];
    case 4: return [...pair(27), ...pair(73, true)];
    case 5: return [...pair(25), center(50), ...pair(75, true)];
    case 6: return [...pair(22), ...pair(50), ...pair(78, true)];
    case 7: return [...pair(19), ...pair(39), center(51), ...pair(81, true)].slice(0, 7);
    case 8: return [...pair(18), ...pair(38), ...pair(62, true), ...pair(82, true)];
    case 9: return [...pair(16), ...pair(33), center(50), ...pair(67, true), ...pair(84, true)].slice(0, 9);
    case 10: return [...pair(15), ...pair(32), center(43), center(57, true), ...pair(68, true), ...pair(85, true)];
    default: return [];
  }
}

function PlayingCardFace({ rank, suit, compact = false }: { rank: number; suit: string; compact?: boolean }) {
  const symbol = suit === "H" || suit === "hearts" ? "♥" : suit === "D" || suit === "diamonds" ? "♦" : suit === "S" || suit === "spades" ? "♠" : suit === "C" || suit === "clubs" ? "♣" : suit;
  const redSuit = symbol === "♥" || symbol === "♦";
  const value = rank === 1 ? "A" : String(rank);
  const pips = pipPositions(rank);
  return (
    <View style={[styles.cardFaceInner, compact && styles.cardFaceCompact]}>
      <View style={styles.cardCorner}>
        <Text style={[styles.cardCornerRank, redSuit && styles.red]}>{value}</Text>
        <Text style={[styles.cardCornerSuit, redSuit && styles.red]}>{symbol}</Text>
      </View>
      <View pointerEvents="none" style={styles.cardPips}>
        {pips.map((pip, index) => (
          <Text key={index} style={[
            styles.cardPip,
            compact && styles.cardPipCompact,
            redSuit && styles.red,
            { left: `${pip.x}%`, top: `${pip.y}%`, transform: [{ rotate: pip.inverted ? "180deg" : "0deg" }] },
          ]}>{symbol}</Text>
        ))}
      </View>
      <View style={[styles.cardCorner, styles.cardCornerBottom]}>
        <Text style={[styles.cardCornerRank, redSuit && styles.red]}>{value}</Text>
        <Text style={[styles.cardCornerSuit, redSuit && styles.red]}>{symbol}</Text>
      </View>
    </View>
  );
}


function DraggableHandCard({
  rank,
  suit,
  disabled,
  onTap,
  onDrop
}: {
  rank: number;
  suit: string;
  disabled: boolean;
  onTap: () => void;
  onDrop: (x: number, y: number) => void;
}) {
  const position = useRef(new Animated.ValueXY()).current;
  const handlers = useRef({ disabled, onTap, onDrop });
  handlers.current = { disabled, onTap, onDrop };
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !handlers.current.disabled,
    onMoveShouldSetPanResponder: (_event, gesture) =>
      !handlers.current.disabled && (Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3),
    onPanResponderGrant: () => position.setOffset({ x: 0, y: 0 }),
    onPanResponderMove: (_event, gesture) => position.setValue({ x: gesture.dx, y: gesture.dy }),
    onPanResponderRelease: (_event, gesture) => {
      position.flattenOffset();
      const moved = Math.abs(gesture.dx) > 18 || Math.abs(gesture.dy) > 18;
      if (moved) handlers.current.onDrop(gesture.moveX, gesture.moveY);
      else handlers.current.onTap();
      Animated.spring(position, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: true,
        speed: 22,
        bounciness: 7
      }).start();
    },
    onPanResponderTerminate: () => {
      position.flattenOffset();
      Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
    }
  })).current;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.ownCard,
        styles.draggableCard,
        disabled && styles.disabled,
        { transform: [{ translateX: position.x }, { translateY: position.y }, { scale: 1.04 }] }
      ]}
    >
      <PlayingCardFace rank={rank} suit={suit} />
    </Animated.View>
  );
}

export default function OnlineGame({ session, room, busy, onDraft, onEndTurn, onCreateBuild, onTopUp, onCaptureBuild, onCaptureLoose, onRecoverBuild, onShiya, onRequestTransfer, onApproveTransfer, onRejectTransfer, onForfeit }: Props) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const tableRef = useRef<View>(null);
  const [buildMode, setBuildMode] = useState(false);
  const [buildHandIds, setBuildHandIds] = useState<string[]>([]);
  const [buildFloorIds, setBuildFloorIds] = useState<string[]>([]);
  const [topUpBuildId, setTopUpBuildId] = useState<string | null>(null);
  const [topUpHandIds, setTopUpHandIds] = useState<string[]>([]);
  const [captureBuildId, setCaptureBuildId] = useState<string | null>(null);
  const [captureHandIds, setCaptureHandIds] = useState<string[]>([]);
  const [captureFloorIds, setCaptureFloorIds] = useState<string[]>([]);
  const [capturePileIds, setCapturePileIds] = useState<string[]>([]);
  const [recoverBuildId, setRecoverBuildId] = useState<string | null>(null);
  const [recoverHandIds, setRecoverHandIds] = useState<string[]>([]);
  const [recoverFloorIds, setRecoverFloorIds] = useState<string[]>([]);
  const [recoverPileIds, setRecoverPileIds] = useState<string[]>([]);
  const myTurn = session.currentSeat === session.ownSeat && session.phase === "playing";
  useEffect(() => { setSelectedCardId(null); setBuildMode(false); setBuildHandIds([]); setBuildFloorIds([]); setTopUpBuildId(null); setTopUpHandIds([]); setCaptureBuildId(null); setCaptureHandIds([]); setCaptureFloorIds([]); setCapturePileIds([]); setRecoverBuildId(null); setRecoverHandIds([]); setRecoverFloorIds([]); setRecoverPileIds([]); }, [session.version]);
  const toggleId = (ids: string[], id: string) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
  const buildValue = [...session.ownHand.filter((card) => buildHandIds.includes(card.id)), ...session.floor.filter((card) => buildFloorIds.includes(card.id))].reduce((sum, card) => sum + card.rank, 0);
  const topUpBuild = session.builds.find((build) => build.id === topUpBuildId);
  const selectedHandCard = session.ownHand.find((card) => card.id === selectedCardId);
  const topUpTotal = session.ownHand.filter((card) => topUpHandIds.includes(card.id)).reduce((sum, card) => sum + card.rank, 0);
  const captureBuild = session.builds.find((build) => build.id === captureBuildId);
  const recoverBuild = session.recoverableBuilds.find((build) => build.id === recoverBuildId);
  const recoverTotal = [...session.ownHand.filter((card) => recoverHandIds.includes(card.id)), ...session.floor.filter((card) => recoverFloorIds.includes(card.id)), ...session.capturedPiles.flatMap((pile) => pile.topCard && recoverPileIds.includes(pile.topCard.id) ? [pile.topCard] : [])].reduce((sum, card) => sum + card.rank, 0);
  const captureTotal = [...session.ownHand.filter((card) => captureHandIds.includes(card.id)), ...session.floor.filter((card) => captureFloorIds.includes(card.id)), ...session.capturedPiles.flatMap((pile) => pile.topCard && capturePileIds.includes(pile.topCard.id) ? [pile.topCard] : [])].reduce((sum, card) => sum + card.rank, 0);
  const clearBuildSelection = () => { setBuildHandIds([]); setBuildFloorIds([]); setBuildMode(false); };
  const players = room.players ?? [];
  const nameForSeat = (seat: number) =>
    players.find((player) => player.seat === seat)?.display_name ?? `Player ${seat}`;

  const seatHandCount = (seat: number) => seat === session.ownSeat ? session.ownHandCount : session.opponents.find((player) => player.seat === seat)?.handCount ?? 0;
  const seatCapturedCount = (seat: number) => session.capturedPiles.find((pile) => pile.seat === seat)?.count ?? 0;
  const seatCard = (seat: number, position: "top" | "side" | "bottom") => (
    <View key={seat} style={[styles.seatCard, position === "side" && styles.seatCardSide, position === "bottom" && styles.seatCardBottom]}>
      <View style={styles.seatIdentity}>
        <View style={styles.avatarCircle}><Text style={styles.avatarInitial}>{nameForSeat(seat).trim().split(/\s+/).map((part) => part[0]).slice(0,2).join("").toUpperCase()}</Text></View>
        <View style={styles.seatInfo}>
          <Text style={styles.seatName}>P{seat} · {seat === session.ownSeat ? "YOU" : nameForSeat(seat).toUpperCase()}</Text>
          <Text style={styles.seatSub}>{nameForSeat(seat)} · TEAM {session.gameMode === "two" ? seat : seat % 2 === 1 ? 1 : 2}</Text>
          <Text style={styles.seatStats}>{seatHandCount(seat)} CARDS IN HAND · CAPTURED × {seatCapturedCount(seat)}</Text>
        </View>
      </View>
      <View style={styles.seatBacks}>{Array.from({ length: Math.min(seatHandCount(seat), 5) }, (_, index) => <View key={index} style={styles.seatBackCard}><Text style={styles.seatBackMark}>✦</Text></View>)}</View>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.kicker}>{session.gameMode === "two" ? "TWO HANDS" : "FOUR HANDS"} · ROUND {session.round}</Text>
      <Text style={styles.title}>{session.phase === "playing" ? "The game is dealt." : session.phase === "round-complete" ? "Round complete." : "Game complete."}</Text>
      <View style={styles.turnPanel}>
        <Text style={styles.turnLabel}>{session.phase !== "playing" ? "MATCH STATUS" : myTurn ? "YOUR TURN" : "CURRENT TURN"}</Text>
        <Text style={styles.turnName}>{session.phase === "game-complete" ? "Game finished" : session.phase === "round-complete" ? "Round finished" : nameForSeat(session.currentSeat)}</Text>
        <Text style={styles.muted}>Seat {session.currentSeat} · {session.deckCount} cards remain in the deck</Text>
        {session.message ? <Text style={styles.resultMessage}>{session.message}</Text> : null}
      </View>

      <View style={styles.casinoHeader}>
        <View><Text style={styles.casinoBrand}>♠ CASINO</Text><Text style={styles.casinoRoom}>{session.gameMode === "two" ? "TWO HANDS" : "FOUR HANDS"} · ROOM {room.room_code}</Text></View>
        <Text style={styles.casinoTeams}>{session.gameMode === "four" ? "TEAM 1: P1 + P3  |  TEAM 2: P2 + P4" : "TWO PLAYER MATCH"}</Text>
      </View>
      {session.gameMode === "four" ? seatCard(3, "top") : seatCard(session.ownSeat === 1 ? 2 : 1, "top")}
      <View style={styles.tableLayout}>
      {session.gameMode === "four" ? seatCard(2, "side") : null}
      <View ref={tableRef} collapsable={false} style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.tableLabel}>THE FLOOR</Text>
          <Text style={styles.tableLabel}>{session.floor.length} CARDS</Text>
        </View>
        {session.floor.length ? (
          <View style={styles.cardGrid}>
            {session.floor.map((card) => (
              <Pressable key={card.id} disabled={!myTurn || busy || (!buildMode && !captureBuildId && !recoverBuildId && (!selectedHandCard || selectedHandCard.rank !== card.rank))} onPress={() => captureBuildId ? setCaptureFloorIds((ids) => toggleId(ids, card.id)) : recoverBuildId ? setRecoverFloorIds((ids) => toggleId(ids, card.id)) : buildMode ? setBuildFloorIds((ids) => toggleId(ids, card.id)) : selectedCardId ? onCaptureLoose(selectedCardId, card.id) : undefined} style={[styles.floorCard, (buildFloorIds.includes(card.id) || captureFloorIds.includes(card.id) || recoverFloorIds.includes(card.id)) && styles.selectedCard]}>
                <PlayingCardFace rank={card.rank} suit={card.suit} compact />
                {buildMode || captureBuildId || recoverBuildId ? <Text style={styles.cardIndex}>{captureBuildId ? captureFloorIds.includes(card.id) ? "CAPTURE" : "ADD" : recoverBuildId ? recoverFloorIds.includes(card.id) ? "RECOVER" : "ADD" : buildFloorIds.includes(card.id) ? "SELECTED" : "ADD"}</Text> : selectedHandCard?.rank === card.rank ? <Text style={styles.cardIndex}>MATCH · CAPTURE</Text> : null}
              </Pressable>
            ))}
          </View>
        ) : <Text style={styles.emptyFloor}>The floor is clear.</Text>}
      </View>
      {session.gameMode === "four" ? seatCard(4, "side") : null}
      </View>
      {seatCard(session.ownSeat, "bottom")}

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
              {session.gameMode === "four" && build.ownerSeat !== session.ownSeat && build.team === (session.ownSeat % 2 === 1 ? 1 : 2) ? (() => {
                const request = session.ownershipRequests.find((item) => item.buildId === build.id && item.status === "pending");
                const previous = session.ownershipRequests.find((item) => item.buildId === build.id && item.requesterSeat === session.ownSeat && item.status !== "pending");
                return request
                  ? <Text style={styles.actionHint}>{request.requesterSeat === session.ownSeat ? "Ownership request sent · waiting for partner" : "Your partner has requested this build"}</Text>
                  : previous ? <Text style={styles.actionHint}>Last request {previous.status}</Text>
                  : <Pressable disabled={busy} onPress={() => onRequestTransfer(build.id)} style={styles.topUpButton}><Text style={styles.topUpButtonText}>REQUEST OWNERSHIP</Text></Pressable>;
              })() : null}
              {session.gameMode === "four" && build.ownerSeat === session.ownSeat ? (() => {
                const request = session.ownershipRequests.find((item) => item.buildId === build.id && item.ownerSeat === session.ownSeat && item.status === "pending");
                return request ? <View>
                  <Text style={styles.actionHint}>Seat {request.requesterSeat} requests ownership of this build.</Text>
                  <View style={styles.actionRow}>
                    <Pressable disabled={busy} onPress={() => onApproveTransfer(build.id)} style={styles.actionButton}><Text style={styles.actionText}>APPROVE</Text></Pressable>
                    <Pressable disabled={busy} onPress={() => onRejectTransfer(build.id)} style={styles.endButton}><Text style={styles.actionText}>DECLINE</Text></Pressable>
                  </View>
                </View> : null;
              })() : null}
            {session.gameMode === "four" && build.ownerSeat !== session.ownSeat && build.team === (session.ownSeat % 2 === 1 ? 1 : 2) ? <Pressable disabled={!myTurn || busy} onPress={() => onShiya(build.id)} style={styles.topUpButton}><Text style={styles.topUpButtonText}>SHIYA · TAKE OWNERSHIP</Text></Pressable> : null}
            </View>
            {!(session.gameMode === "four" && build.ownerSeat !== session.ownSeat && build.team === (session.ownSeat % 2 === 1 ? 1 : 2)) ? <Pressable disabled={!myTurn || busy} onPress={() => { setBuildMode(false); setTopUpBuildId(null); setCaptureBuildId(build.id); setCaptureHandIds([]); setCaptureFloorIds([]); setCapturePileIds([]); setSelectedCardId(null); }} style={styles.topUpButton}><Text style={styles.topUpButtonText}>CAPTURE BUILD</Text></Pressable> : null}
            <View style={styles.buildCards}>
              {build.cards.map((card) => <View key={card.id} style={styles.buildCard}><PlayingCardFace rank={card.rank} suit={card.suit} compact /></View>)}
            </View>
          </View>
        )) : <Text style={styles.emptyFloor}>No active builds.</Text>}
      </View>

      <View style={styles.buildsPanel}>
        <Text style={styles.buildsHeading}>CAPTURED BUILDS · RECOVERY</Text>
        {session.recoverableBuilds.filter((item) => {
          const myTeam = session.gameMode === "two" ? session.ownSeat : (session.ownSeat % 2 === 1 ? 1 : 2);
          return item.originalTeam === myTeam && (item.originalOwnerSeat === session.ownSeat || !item.partnerRecoveryBlocked);
        }).map((item) => (
          <View key={item.id} style={styles.buildRow}>
            <View>
              <Text style={styles.buildValue}>VALUE {item.value}</Text>
              <Text style={styles.buildOwner}>Originally owned by {nameForSeat(item.originalOwnerSeat)} · Captured by {nameForSeat(item.capturedBySeat)}</Text>
              <Pressable disabled={!myTurn || busy || session.builds.some((build) => build.ownerSeat === session.ownSeat)} onPress={() => {
                setBuildMode(false); setTopUpBuildId(null); setCaptureBuildId(null); setSelectedCardId(null);
                setRecoverBuildId(item.id); setRecoverHandIds([]); setRecoverFloorIds([]); setRecoverPileIds([]);
              }} style={styles.topUpButton}><Text style={styles.topUpButtonText}>RECOVER BUILD</Text></Pressable>
            </View>
          </View>
        ))}
        {!session.recoverableBuilds.some((item) => {
          const myTeam = session.gameMode === "two" ? session.ownSeat : (session.ownSeat % 2 === 1 ? 1 : 2);
          return item.originalTeam === myTeam && (item.originalOwnerSeat === session.ownSeat || !item.partnerRecoveryBlocked);
        }) ? <Text style={styles.emptyFloor}>No captured builds are currently available for your team to recover.</Text> : null}
        {session.recoverableBuilds.some((item) => {
          const myTeam = session.gameMode === "two" ? session.ownSeat : (session.ownSeat % 2 === 1 ? 1 : 2);
          return item.originalTeam === myTeam && item.originalOwnerSeat !== session.ownSeat && item.partnerRecoveryBlocked;
        }) ? <Text style={styles.actionHint}>A matching-value draft has blocked partner recovery for a captured build. Its original owner may still recover it.</Text> : null}
      </View>

      <View style={styles.buildsPanel}>
        <Text style={styles.buildsHeading}>OPPONENT CAPTURED PILES · VISIBLE TOP CARDS</Text>
        {session.capturedPiles.filter((pile) => pile.count > 0 && (session.gameMode === "two" ? pile.seat !== session.ownSeat : (pile.seat % 2) !== (session.ownSeat % 2))).map((pile) => (
          <Pressable key={pile.seat} disabled={!myTurn || busy || (!captureBuildId && !recoverBuildId) || !pile.topCard} onPress={() => pile.topCard && (recoverBuildId ? setRecoverPileIds((ids) => toggleId(ids, pile.topCard!.id)) : setCapturePileIds((ids) => toggleId(ids, pile.topCard!.id)))} style={[styles.opponent, pile.topCard && (capturePileIds.includes(pile.topCard.id) || recoverPileIds.includes(pile.topCard.id)) && styles.selectedCard]}>
            <Text style={styles.opponentName}>Seat {pile.seat} · {pile.count} captured</Text>
            <View style={styles.pileCardPreview}>{pile.topCard ? <PlayingCardFace rank={pile.topCard.rank} suit={pile.topCard.suit} compact /> : <Text>—</Text>}{pile.topCard && (capturePileIds.includes(pile.topCard.id) || recoverPileIds.includes(pile.topCard.id)) ? <Text style={styles.actionHint}>SELECTED</Text> : null}</View>
          </Pressable>
        ))}
        {!session.capturedPiles.some((pile) => pile.count > 0 && (session.gameMode === "two" ? pile.seat !== session.ownSeat : (pile.seat % 2) !== (session.ownSeat % 2))) ? <Text style={styles.emptyFloor}>No opponent pile cards are available.</Text> : null}
      </View>

      <Text style={styles.section}>YOUR HAND · {session.ownHandCount} CARDS</Text>
      <View style={styles.hand}>
        {session.ownHand.map((card) => {
          const specialSelectionMode = buildMode || Boolean(topUpBuildId) || Boolean(captureBuildId) || Boolean(recoverBuildId);
          const selected = buildMode ? buildHandIds.includes(card.id) : topUpBuildId ? topUpHandIds.includes(card.id) : captureBuildId ? captureHandIds.includes(card.id) : recoverBuildId ? recoverHandIds.includes(card.id) : selectedCardId === card.id;
          if (specialSelectionMode) {
            return (
              <Pressable key={card.id} onPress={() => buildMode ? setBuildHandIds((ids) => toggleId(ids, card.id)) : topUpBuildId ? setTopUpHandIds((ids) => toggleId(ids, card.id)) : captureBuildId ? setCaptureHandIds((ids) => toggleId(ids, card.id)) : setRecoverHandIds((ids) => toggleId(ids, card.id))} disabled={!myTurn || busy} style={[styles.ownCard, selected && styles.selectedCard]}>
                <PlayingCardFace rank={card.rank} suit={card.suit} />
              </Pressable>
            );
          }
          return (
            <DraggableHandCard
              key={card.id}
              rank={card.rank}
              suit={card.suit}
              disabled={!myTurn || busy}
              onTap={() => setSelectedCardId(card.id)}
              onDrop={(x, y) => {
                if (!myTurn || busy) return;
                tableRef.current?.measureInWindow((left, top, width, height) => {
                  if (x >= left && x <= left + width && y >= top && y <= top + height) {
                    setSelectedCardId(null);
                    onDraft(card.id);
                  }
                });
              }}
            />
          );
        })}
      </View>

      {session.phase === "playing" ? (
        <View style={styles.actions}>
          <Text style={styles.actionHint}>{!myTurn ? "Waiting for the current player." : buildMode ? "Select at least one card from your hand and any loose floor cards." : recoverBuildId ? "Select a valid combination containing at least one card from your hand to recover the captured build." : "Swipe a card from your hand onto the table to draft it, or choose BUILD."}</Text>
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
          ) : recoverBuildId ? (
            <View style={styles.buildPanel}>
              <Text style={styles.buildTotal}>RECOVER BUILD · VALUE {recoverBuild?.value ?? "Unavailable"}</Text>
              <Text style={styles.actionHint}>Selected total: {recoverTotal}. Include at least one card from your hand. You may add eligible loose floor cards and visible opponent pile tops when an active build already exists.</Text>
              <View style={styles.actionRow}>
                <Pressable onPress={() => onRecoverBuild(recoverBuildId, { handCardIds: recoverHandIds, floorCardIds: recoverFloorIds, opponentPileCardIds: recoverPileIds })} disabled={!myTurn || busy || !recoverBuild || recoverHandIds.length === 0 || recoverTotal !== recoverBuild.value || session.floor.some((card) => card.rank === recoverBuild.value) || session.builds.some((build) => build.value === recoverBuild.value)} style={[styles.actionButton, (!myTurn || busy || !recoverBuild || recoverHandIds.length === 0 || recoverTotal !== recoverBuild.value || session.floor.some((card) => card.rank === recoverBuild.value) || session.builds.some((build) => build.value === recoverBuild.value)) && styles.disabled]}><Text style={styles.actionText}>CONFIRM RECOVERY</Text></Pressable>
                <Pressable onPress={() => { setRecoverBuildId(null); setRecoverHandIds([]); setRecoverFloorIds([]); setRecoverPileIds([]); }} disabled={busy} style={styles.endButton}><Text style={styles.actionText}>CANCEL</Text></Pressable>
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
              <Pressable onPress={() => { setBuildMode(true); setSelectedCardId(null); }} disabled={!myTurn || busy} style={[styles.actionButton, (!myTurn || busy) && styles.disabled]}><Text style={styles.actionText}>BUILD</Text></Pressable>
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
      {session.phase === "playing" ? <Pressable disabled={busy} onPress={() => Alert.alert("Forfeit match?", session.gameMode === "two" ? "If you forfeit, the other player wins immediately." : "If you forfeit, your team loses and the opposing team wins immediately.", [{ text: "KEEP PLAYING", style: "cancel" }, { text: "FORFEIT MATCH", style: "destructive", onPress: onForfeit }])} style={[styles.forfeitButton, busy && styles.disabled]}><Text style={styles.forfeitText}>FORFEIT MATCH</Text></Pressable> : null}
      <Text style={styles.footer}>CARD ORDER IS PRESERVED · NO AUTOMATIC SORTING</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, paddingBottom: 36, backgroundColor: "#001b0b" },
  casinoHeader: { backgroundColor: "#001707", borderBottomWidth: 2, borderBottomColor: "#d9ae37", paddingHorizontal: 8, paddingVertical: 9, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  casinoBrand: { color: "#ffd65b", fontSize: 25, fontWeight: "900", letterSpacing: 2 },
  casinoRoom: { color: "#fff8e7", fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  casinoTeams: { color: "#fff3d2", fontSize: 9, fontWeight: "800", textAlign: "right", flexShrink: 1 },
  seatCard: { backgroundColor: "#00300f", borderWidth: 2, borderColor: "#d9b43d", borderRadius: 12, padding: 9, marginBottom: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, shadowColor: "#f6cf47", shadowOpacity: 0.3, shadowRadius: 5, elevation: 3 },
  seatCardSide: { width: 76, minHeight: 180, flexDirection: "column", justifyContent: "flex-start", padding: 5, marginBottom: 0 },
  seatCardBottom: { borderColor: "#d8ff36", borderWidth: 2, marginTop: 8 },
  seatIdentity: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1 },
  avatarCircle: { width: 39, height: 39, borderRadius: 20, backgroundColor: "#d5b46a", borderWidth: 2, borderColor: "#ffe47c", alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: "#102116", fontSize: 13, fontWeight: "900" },
  seatInfo: { flexShrink: 1 },
  seatName: { color: "#fff4cf", fontSize: 11, fontWeight: "900" },
  seatSub: { color: "#e8d49b", fontSize: 9, marginTop: 2 },
  seatStats: { color: "#d3e2d3", fontSize: 8, marginTop: 4 },
  seatBacks: { flexDirection: "row", gap: 3, flexShrink: 0 },
  seatBackCard: { width: 16, height: 25, borderRadius: 3, borderWidth: 1, borderColor: "#fff", backgroundColor: "#1d3967", alignItems: "center", justifyContent: "center" },
  seatBackMark: { color: "#fff", fontSize: 8 },

  kicker: { color: "#9a8050", fontSize: 10, fontWeight: "800", letterSpacing: 2, marginTop: 24 },
  title: { color: "#1b2a22", fontSize: 34, lineHeight: 40, fontWeight: "300", marginTop: 12, marginBottom: 22 },
  turnPanel: { backgroundColor: "#174c39", padding: 18, marginBottom: 14 },
  resultMessage: { color: "#fff", fontSize: 12, lineHeight: 18, marginTop: 10 },
  forfeitButton: { borderWidth: 1, borderColor: "#a94442", padding: 13, alignItems: "center", marginTop: 4, marginBottom: 14 },
  forfeitText: { color: "#a94442", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  turnLabel: { color: "#d6c59e", fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  turnName: { color: "#fff", fontSize: 24, fontWeight: "700", marginTop: 5 },
  muted: { color: "#9da99f", fontSize: 10, lineHeight: 15, marginTop: 5 },
  table: { flex: 1, minWidth: 0, backgroundColor: "#003b17", borderWidth: 4, borderColor: "#e8b52d", borderRadius: 16, padding: 10, minHeight: 260, marginBottom: 8 },
  tableHeader: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#d6b63e", paddingBottom: 7 },
  tableLabel: { color: "#ffd65b", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  emptyFloor: { color: "#c5d2c8", textAlign: "center", marginTop: 35, fontSize: 12 },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 16 },
  floorCard: { backgroundColor: "#fffefa", borderRadius: 6, width: 56, height: 82, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#d8d8cf", padding: 3 },
  buildsPanel: { backgroundColor: "#052b13", borderWidth: 1, borderColor: "#9b873e", padding: 12, marginBottom: 12, borderRadius: 8 },
  buildsHeading: { color: "#e5c45b", fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  buildRow: { borderTopWidth: 1, borderColor: "#e5e4db", paddingVertical: 11, marginTop: 10 },
  buildValue: { color: "#174c39", fontSize: 15, fontWeight: "800" },
  buildOwner: { color: "#7c877e", fontSize: 10, marginTop: 3 },
  topUpButton: { backgroundColor: "#e9ede5", borderWidth: 1, borderColor: "#b9c8b8", paddingHorizontal: 9, paddingVertical: 7, marginTop: 8, alignSelf: "flex-start" },
  topUpButtonText: { color: "#245b43", fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  buildCards: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 8 },
  buildCard: { backgroundColor: "#fffefa", width: 43, height: 62, borderWidth: 1, borderColor: "#d8d8cf", borderRadius: 4, padding: 2 },
  pileCardPreview: { alignItems: "center", gap: 4 },
  section: { color: "#f0d36e", fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginBottom: 11, marginTop: 5 },
  hand: { flexDirection: "row", flexWrap: "nowrap", gap: 5, marginBottom: 18, justifyContent: "center" },
  ownCard: { backgroundColor: "#fffefa", borderWidth: 1, borderColor: "#d9d9cf", borderRadius: 7, width: 48, height: 70, alignItems: "center", justifyContent: "center", padding: 3 },
  draggableCard: { zIndex: 2, elevation: 5 },
  selectedCard: { borderColor: "#b28b45", borderWidth: 2, transform: [{ translateY: -4 }] },
  buildPanel: { marginTop: 10, padding: 12, backgroundColor: "#f0f4ed", borderWidth: 1, borderColor: "#cbd7c9" },
  buildTotal: { color: "#174c39", fontSize: 18, fontWeight: "800", marginBottom: 5 },
  actions: { backgroundColor: "#052b13", borderWidth: 1, borderColor: "#b99b3d", padding: 12, marginBottom: 14, borderRadius: 8 },
  actionHint: { color: "#7c877e", fontSize: 10, marginBottom: 11 },
  actionRow: { flexDirection: "row", gap: 8 },
  actionButton: { flex: 1, backgroundColor: "#174c39", padding: 13, alignItems: "center", justifyContent: "center", minHeight: 45 },
  endButton: { flex: 1, backgroundColor: "#9a8050", padding: 13, alignItems: "center", justifyContent: "center", minHeight: 45 },
  actionText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  disabled: { opacity: 0.4 },
  cardFaceInner: { flex: 1, width: "100%", justifyContent: "space-between", alignItems: "center" },
  cardFaceCompact: { padding: 1 },
  cardCorner: { alignSelf: "flex-start", alignItems: "center", minWidth: 13 },
  cardCornerBottom: { alignSelf: "flex-end", transform: [{ rotate: "180deg" }] },
  cardCornerRank: { color: "#1b2a22", fontSize: 11, lineHeight: 12, fontWeight: "900" },
  cardCornerSuit: { color: "#1b2a22", fontSize: 9, lineHeight: 10, fontWeight: "800" },
  cardPips: { ...StyleSheet.absoluteFill },
  cardPip: { position: "absolute", width: 18, height: 20, marginLeft: -9, marginTop: -10, textAlign: "center", textAlignVertical: "center", fontSize: 16, lineHeight: 19, fontWeight: "700" },
  cardPipCompact: { width: 14, height: 15, marginLeft: -7, marginTop: -7.5, fontSize: 10, lineHeight: 12 },
  cardAcePip: { fontSize: 30, fontWeight: "700" },
  red: { color: "#b43b3b" },
  cardIndex: { color: "#a0a69e", fontSize: 8, marginTop: 7 },
  opponent: { backgroundColor: "#052b13", borderWidth: 1, borderColor: "#9b873e", padding: 10, marginBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  opponentName: { color: "#fff2c6", fontSize: 12, fontWeight: "800" },
  backCards: { flexDirection: "row" },
  backCard: { width: 22, height: 32, borderRadius: 3, backgroundColor: "#174c39", borderWidth: 1, borderColor: "#d6c59e", alignItems: "center", justifyContent: "center", marginLeft: -5 },
  backMark: { color: "#d6c59e", fontSize: 9 },
  notice: { backgroundColor: "#052b13", borderLeftWidth: 3, borderLeftColor: "#d6b63e", padding: 14, marginTop: 13 },
  noticeTitle: { color: "#e5c45b", fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  footer: { color: "#b9c8b8", textAlign: "center", fontSize: 8, letterSpacing: 1, marginTop: 20 }
});

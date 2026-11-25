"use client";

import { useMemo, useState } from "react";
import {
  type GameMode,
  type GameState,
  cardLabel,
  endTurn,
  isRed,
  playToFloor,
  startGame
} from "@/lib/game";

function PlayingCard({ card, selected, onClick }: {
  card: GameState["floor"][number];
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={`playing-card ${isRed(card) ? "red" : "black"} ${selected ? "selected" : ""}`}
      onClick={onClick}
      type="button"
      aria-label={cardLabel(card)}
    >
      <span className="card-corner">{card.rank === 1 ? "A" : card.rank}<small>{card.suit}</small></span>
      <span className="card-center">{card.suit}</span>
      <span className="card-corner bottom">{card.rank === 1 ? "A" : card.rank}<small>{card.suit}</small></span>
    </button>
  );
}

export default function Home() {
  const [mode, setMode] = useState<GameMode>("two");
  const [game, setGame] = useState<GameState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const activePlayer = game?.players[game.currentPlayer];
  const totalCards = useMemo(
    () => game ? game.players.reduce((sum, player) => sum + player.hand.length, 0) + game.deck.length + game.floor.length : 0,
    [game]
  );

  function begin() {
    setGame(startGame(mode));
    setSelected(null);
  }

  function playSelected() {
    if (!game || !selected) return;
    setGame(playToFloor(game, selected));
    setSelected(null);
  }

  function nextTurn() {
    if (!game) return;
    setGame(endTurn(game));
    setSelected(null);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Casino home"><span className="brand-mark">♠</span> CASINO</a>
        <span className="topbar-note">A game of skill, timing &amp; capture</span>
        <button className="new-game top-button" onClick={begin}>＋ New game</button>
      </header>

      {!game ? (
        <section className="welcome">
          <div className="eyebrow">THE TABLE IS YOURS</div>
          <h1>Every card has<br /><em>a purpose.</em></h1>
          <p className="welcome-copy">A fresh take on the classic South African card game. Gather your players and take your seats.</p>
          <div className="setup-card">
            <div className="setup-title">Choose your game</div>
            <div className="mode-options">
              <button className={`mode-option ${mode === "two" ? "active" : ""}`} onClick={() => setMode("two")}>
                <span className="mode-number">02</span><span><strong>Two Hands</strong><small>1 vs 1 · Two rounds</small></span>
                <span className="radio-dot" />
              </button>
              <button className={`mode-option ${mode === "four" ? "active" : ""}`} onClick={() => setMode("four")}>
                <span className="mode-number">04</span><span><strong>Four Hands</strong><small>2 vs 2 · One round</small></span>
                <span className="radio-dot" />
              </button>
            </div>
            <button className="start-button" onClick={begin}>Shuffle &amp; deal <span>↗</span></button>
            <p className="setup-footnote">40 cards · Ace to 10 · No face cards</p>
          </div>
        </section>
      ) : (
        <section className="game-screen">
          <div className="game-heading">
            <div><div className="eyebrow">ROUND {game.round} · {game.mode === "two" ? "TWO HANDS" : "FOUR HANDS"}</div><h1>The table</h1></div>
            <div className="game-stats"><span><b>{game.deck.length}</b> in deck</span><span><b>{game.floor.length}</b> on table</span><span><b>{totalCards}</b> cards in play</span></div>
          </div>

          <div className="felt-table">
            <div className="table-label">THE FLOOR <span>{game.floor.length} cards</span></div>
            <div className="floor-cards">
              {game.floor.length ? game.floor.map((card) => <PlayingCard key={card.id} card={card} />) : <div className="empty-floor"><span>♧</span><small>The table is clear</small></div>}
            </div>
            <div className="table-message">{game.message}</div>
          </div>

          <div className="players-grid" style={{ gridTemplateColumns: `repeat(${game.players.length}, minmax(0, 1fr))` }}>
            {game.players.map((player) => (
              <div className={`player-panel ${player.id === game.currentPlayer ? "current" : ""}`} key={player.id}>
                <div className="player-heading"><span className="player-avatar">{player.id + 1}</span><span><strong>{player.name}</strong><small>{game.mode === "four" ? `Team ${player.team + 1}` : player.id === 0 ? "You" : "Opponent"}</small></span>{player.id === game.currentPlayer && <span className="turn-indicator">TURN</span>}</div>
                <div className="hand-count">{player.hand.length} cards in hand</div>
                {player.id === game.currentPlayer ? (
                  <div className="hand-cards">
                    {player.hand.map((card) => <PlayingCard key={card.id} card={card} selected={selected === card.id} onClick={() => setSelected(card.id)} />)}
                    {!player.hand.length && <span className="empty-hand">No cards remaining</span>}
                  </div>
                ) : <div className="opponent-hand">{Array.from({ length: Math.min(player.hand.length, 10) }, (_, i) => <span key={i} className="card-back" />)}</div>}
              </div>
            ))}
          </div>

          <div className="action-bar">
            <div className="selection-hint">{selected ? "Card selected — play it to the floor" : "Select a card from your hand"}</div>
            <button className="play-button" onClick={playSelected} disabled={!selected}>Play card</button>
            <button className="end-button" onClick={nextTurn}>End turn →</button>
          </div>
          {game.phase !== "playing" && <div className="round-notice"><strong>Round complete</strong><p>{game.message}</p><button onClick={() => setGame(null)}>Back to setup</button></div>}
        </section>
      )}
      <footer className="footer"><span>CASINO · OUR RULES, OUR GAME</span><span>40 CARDS · {game ? "GAME IN PROGRESS" : "READY TO PLAY"}</span></footer>
    </main>
  );
}

const TILE_PRICE_BY_TIER = { S: 6000, A: 4500, B: 3200, C: 2200 };
const RENT_RATE_BY_LEVEL = [0.1, 0.2, 0.35, 0.55, 0.8];
const LEVEL_NAMES = ["空據點", "臨時據點", "英雄事務所", "大型事務所", "No.1 英雄事務所"];
const PLAYER_COLORS = ["#db4c40", "#2d6cdf", "#2f9d55", "#8b4ed6"];
const DEFAULT_GAME_OPTIONS = {
  startingCash: 20000,
  maxRound: 30,
  aiCount: 3,
  enableQuirks: true,
  enableRaids: true
};

let maxHandSize = 5;

let state = null;

function initialTiles() {
  return window.TAOFUWENG_TILES.map(tile => ({
    ...tile,
    price: tile.type === "land" ? TILE_PRICE_BY_TIER[tile.tier] : 0,
    level: 0,
    ownerId: null,
    rentBoostNext: false,
    guardTurns: 0,
    disruptedTurns: 0,
    disabledRentOnce: false
  }));
}

function getCharacter(player) {
  return window.TAOFUWENG_CHARACTERS.find(c => c.id === player.characterId);
}

function normalizeGameOptions(options = {}) {
  return {
    startingCash: Number(options.startingCash) || DEFAULT_GAME_OPTIONS.startingCash,
    maxRound: Number(options.maxRound) || DEFAULT_GAME_OPTIONS.maxRound,
    aiCount: Math.max(1, Math.min(3, Number(options.aiCount) || DEFAULT_GAME_OPTIONS.aiCount)),
    enableQuirks: options.enableQuirks !== false,
    enableRaids: options.enableRaids !== false
  };
}

function createNewState(selectedCharacterId, options = {}) {
  const gameOptions = normalizeGameOptions(options);
  maxHandSize = 5;

  const characters = [...window.TAOFUWENG_CHARACTERS];
  const selected = characters.find(c => c.id === selectedCharacterId) || characters[0];
  const aiCharacters = characters
    .filter(c => c.id !== selected.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, gameOptions.aiCount);

  const players = [
    makePlayer("p1", selected, "human", gameOptions.startingCash),
    ...aiCharacters.map((c, index) => makePlayer(`p${index + 2}`, c, "ai", gameOptions.startingCash))
  ];

  const gameState = {
    mode: "playing",
    round: 1,
    maxRound: gameOptions.maxRound,
    currentPlayerIndex: 0,
    phase: "waitingRoll",
    landActionUsed: false,
    lastDice: null,
    gameOver: false,
    winnerText: "",
    tiles: initialTiles(),
    players,
    eventLog: [`新遊戲開始｜起始支援預算 ${formatMoney(gameOptions.startingCash)}｜最大回合 ${gameOptions.maxRound}`],
    globalEffects: [],
    godSpawns: [],
    lotteryPool: 0,
    selectedTileId: null,
    options: gameOptions,
    stats: {
      cardUses: 0,
      routeUses: 0,
      defenseUses: 0,
      defenseSuccess: 0,
      damageUses: 0,
      completedSets: 0
    }
  };

  state = gameState;
  if (state.options.enableRaids) ensureGodSpawns();
  return gameState;
}

function makePlayer(id, character, type, startingCash = DEFAULT_GAME_OPTIONS.startingCash) {
  const baseCash = startingCash;
  return {
    id,
    characterId: character.id,
    name: character.name,
    type,
    cash: baseCash,
    position: 0,
    cards: [],
    statusEffects: [],
    isBankrupt: false,
    nextDice: null,
    nextDiceRange: null,
    noRentCount: 0,
    abilityCooldown: 0,
    skipNextTurn: false,
    trappedNextTurn: false,
    licenseUsedThisTurn: false,
    upgradeDiscountCount: 0,
    cancelNegativeFateCount: 0,
    blastUpgradeCount: 0
  };
}

function currentPlayer() {
  return state.players[state.currentPlayerIndex];
}

function currentTile(player = currentPlayer()) {
  return state.tiles[player.position];
}

function log(message) {
  const compact = compactLogMessage(message);
  state.eventLog.unshift(compact);
  if (state.eventLog.length > 120) state.eventLog.pop();
}

function compactLogMessage(message) {
  return String(message)
    .replaceAll("支援預算", "預算")
    .replaceAll("聲望資產", "聲望")
    .replaceAll("委託支援費", "支援費")
    .replaceAll("桃園 Hero City", "Hero City")
    .replace(/。理由：.*$/, "。")
    .replace(/，理由：.*$/, "。")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMoney(value) {
  return Math.round(value).toLocaleString("zh-Hant-TW");
}

function signed(value) {
  const n = Math.round(value);
  if (n > 0) return `+${formatMoney(n)}`;
  if (n < 0) return `-${formatMoney(Math.abs(n))}`;
  return "0";
}

function textSigned(value) {
  const n = Math.round(value);
  if (n > 0) return `+${formatMoney(n)}`;
  if (n < 0) return `-${formatMoney(Math.abs(n))}`;
  return "0";
}

function withPlayerDelta(player, reason, fn) {
  const beforeCash = player.cash;
  const beforeWorth = calculateNetWorth(player);
  fn();
  const afterCash = player.cash;
  const afterWorth = calculateNetWorth(player);
  log(`${reason}｜${player.name} 支援預算 ${signed(afterCash - beforeCash)}｜聲望資產 ${signed(afterWorth - beforeWorth)}`);
}

function getEffect(player, kind) {
  return player.statusEffects.filter(e => e.kind === kind).reduce((sum, e) => sum + e.value, 0);
}

function getZoneConfig(zone) {
  return window.TAOFUWENG_DISTRICTS?.[zone] || null;
}

function getZoneTiles(zone) {
  return state.tiles.filter(t => t.type === "land" && t.zone === zone);
}

function getPlayerZoneTiles(player, zone) {
  return getZoneTiles(zone).filter(t => t.ownerId === player.id);
}

function getZoneProgress(player, zone) {
  const total = getZoneTiles(zone).length;
  const owned = getPlayerZoneTiles(player, zone).length;
  return { owned, total, complete: total > 0 && owned === total };
}

function getZoneRentBonus(owner, zone) {
  if (!zone || !owner) return 0;
  const { owned, total } = getZoneProgress(owner, zone);
  if (total > 0 && owned === total) return 0.5;
  if (owned >= 4) return 0.3;
  if (owned >= 3) return 0.18;
  if (owned >= 2) return 0.1;
  return 0;
}

function getZoneUpgradeDiscount(player, zone) {
  if (!zone || !player) return 0;
  const { owned, total } = getZoneProgress(player, zone);
  if (total > 0 && owned === total) return 0.2;
  if (owned >= 4) return 0.15;
  if (owned >= 3) return 0.1;
  return 0;
}

function renderZoneBonusText(player, zone) {
  if (!zone) return "無";
  const config = getZoneConfig(zone);
  const progress = getZoneProgress(player, zone);
  const rentBonus = getZoneRentBonus(player, zone);
  const upgradeDiscount = getZoneUpgradeDiscount(player, zone);
  const parts = [`${config?.name || zone} ${progress.owned}/${progress.total}`];
  if (rentBonus) parts.push(`支援費 +${Math.round(rentBonus * 100)}%`);
  if (upgradeDiscount) parts.push(`擴建 -${Math.round(upgradeDiscount * 100)}%`);
  return parts.join("｜");
}

function getPlayerBestZoneSummary(player) {
  const zones = Object.keys(window.TAOFUWENG_DISTRICTS || {});
  const ranked = zones
    .map(zone => ({ zone, ...getZoneProgress(player, zone) }))
    .filter(item => item.owned > 0)
    .sort((a, b) => (b.owned / b.total) - (a.owned / a.total) || b.owned - a.owned);
  if (!ranked.length) return "尚無套裝";
  const top = ranked[0];
  const name = getZoneConfig(top.zone)?.name || top.zone;
  return `${name} ${top.owned}/${top.total}${top.complete ? " 完成" : ""}`;
}

function getPlayerCompletedSetCount(player) {
  return Object.keys(window.TAOFUWENG_DISTRICTS || {})
    .filter(zone => getZoneProgress(player, zone).complete).length;
}

function getZoneCompletionThreat(player, zone) {
  const progress = getZoneProgress(player, zone);
  return progress.total > 0 && progress.owned >= progress.total - 1;
}

function scoreTileForPlayer(player, tile) {
  if (!tile || tile.type !== "land") return 0;
  const tierScore = { S: 50, A: 36, B: 24, C: 16 }[tile.tier] || 10;
  const progress = getZoneProgress(player, tile.zone);
  let score = tierScore + progress.owned * 18;
  if (progress.owned === progress.total - 1) score += 70;
  if (tile.ownerId === player.id) score += tile.level * 20;
  return score;
}

function isBlockingTile(player, tile) {
  if (!tile || tile.type !== "land" || tile.ownerId) return false;
  return state.players
    .filter(p => p.id !== player.id && !p.isBankrupt)
    .some(p => getZoneCompletionThreat(p, tile.zone));
}

function findBestOwnedTile(player) {
  return state.tiles
    .filter(t => t.type === "land" && t.ownerId === player.id)
    .sort((a, b) => scoreTileForPlayer(player, b) - scoreTileForPlayer(player, a) || b.level - a.level)[0] || null;
}

function findBestEnemyTile(player, options = {}) {
  let candidates = state.tiles.filter(t => t.type === "land" && t.ownerId && t.ownerId !== player.id);
  if (options.needLevel) candidates = candidates.filter(t => t.level > 0);
  return candidates
    .sort((a, b) => {
      const ownerA = state.players.find(p => p.id === a.ownerId);
      const ownerB = state.players.find(p => p.id === b.ownerId);
      const threatA = ownerA && getZoneCompletionThreat(ownerA, a.zone) ? 120 : 0;
      const threatB = ownerB && getZoneCompletionThreat(ownerB, b.zone) ? 120 : 0;
      return (scoreTileForPlayer(ownerB || player, b) + threatB) - (scoreTileForPlayer(ownerA || player, a) + threatA);
    })[0] || null;
}

function setTileGuard(player, tile, sourceName = "據點防線") {
  if (!tile || tile.type !== "land" || tile.ownerId !== player.id) return false;
  tile.guardTurns = 3;
  state.stats.defenseUses += 1;
  log(`${player.name} 使用「${sourceName}」，${tile.name} 進入防守 3 回合。`);
  return true;
}

function clearTileStatus(tile) {
  if (!tile) return;
  tile.guardTurns = 0;
  tile.disruptedTurns = 0;
  tile.disabledRentOnce = false;
}

function applyTileDisruption(attacker, tile, sourceName = "媒體風波") {
  if (!tile || tile.type !== "land" || !tile.ownerId || tile.ownerId === attacker.id) return false;
  const owner = state.players.find(p => p.id === tile.ownerId);
  if (tile.guardTurns > 0) {
    tile.guardTurns = 0;
    state.stats.defenseSuccess += 1;
    log(`${owner.name} 的 ${tile.name} 防守生效，抵銷 ${attacker.name} 的「${sourceName}」。`);
    return true;
  }
  tile.disruptedTurns = 2;
  state.stats.damageUses += 1;
  log(`${attacker.name} 使用「${sourceName}」，${owner.name} 的 ${tile.name} 進入干擾 3 回合，支援費 -40%。`);
  return true;
}

function applyTileDamage(attacker, tile, sourceName = "死柄木接觸") {
  if (!tile || tile.type !== "land" || !tile.ownerId || tile.ownerId === attacker.id) return false;
  const owner = state.players.find(p => p.id === tile.ownerId);
  if (!owner) return false;

  if (tile.guardTurns > 0) {
    tile.guardTurns = 0;
    state.stats.defenseSuccess += 1;
    log(`${owner.name} 的 ${tile.name} 防守生效，抵銷 ${attacker.name} 的「${sourceName}」。`);
    return true;
  }

  const beforeWorth = calculateNetWorth(owner);
  if (tile.level > 0) {
    tile.level -= 1;
    state.stats.damageUses += 1;
    log(`${attacker.name} 使用「${sourceName}」，${owner.name} 的 ${tile.name} 降 1 級。${owner.name} 聲望 ${signed(calculateNetWorth(owner) - beforeWorth)}`);
  } else {
    tile.disabledRentOnce = true;
    state.stats.damageUses += 1;
    log(`${attacker.name} 使用「${sourceName}」，${owner.name} 的 ${tile.name} 停擺一次，下次不收支援費。`);
  }
  return true;
}

function decrementTileStatuses() {
  for (const tile of state.tiles) {
    if (tile.guardTurns > 0) tile.guardTurns -= 1;
    if (tile.disruptedTurns > 0) tile.disruptedTurns -= 1;
  }
}

function getTileStatusText(tile) {
  if (!tile || tile.type !== "land") return "無";
  const tags = [];
  if (tile.guardTurns > 0) tags.push(`防守 ${tile.guardTurns}`);
  if (tile.disruptedTurns > 0) tags.push(`干擾 ${tile.disruptedTurns}`);
  if (tile.disabledRentOnce) tags.push("停擺一次");
  return tags.join("、") || "無";
}

function useCardRecord() {
  if (state?.stats) state.stats.cardUses += 1;
}

function hasDiceLimit(player) {
  const effect = player.statusEffects.find(e => e.kind === "diceLimit");
  return effect ? effect.value : null;
}

function calculatePurchasePrice(player, tile) {
  let price = tile.price;
  const character = getCharacter(player);
  if (character?.id === "lin_mansion" && tile.tier === "C") {
    price *= 0.9;
  }
  return Math.round(price);
}

function calculateUpgradeCost(player, tile) {
  let cost = tile.price * 0.5;
  const character = getCharacter(player);

  if (character?.id === "gou_lift") {
    cost *= 0.85;
  }

  if (character?.id === "jobs_think" && tile.level === 3) {
    cost *= 1.2;
  }

  let discount = getEffect(player, "upgradeDiscount");

  if (tile.zone) {
    const zoneDiscount = getZoneUpgradeDiscount(player, tile.zone);
    if (zoneDiscount) discount += zoneDiscount;
  }

  if (player.upgradeDiscountCount > 0) {
    discount += 0.25;
  }

  for (const effect of state.globalEffects) {
    if (effect.kind === "upgradeDiscountAll") {
      discount += effect.value;
    }
  }

  if (player.blastUpgradeCount > 0) {
    cost *= 1.45;
  }

  cost *= Math.max(0.1, 1 - discount);

  return Math.round(cost);
}

function calculateRent(tile, payer, owner, options = { simulate: false }) {
  let rent = tile.price * RENT_RATE_BY_LEVEL[tile.level];
  const notes = [];

  for (const effect of state.globalEffects) {
    if (effect.kind === "rentAll") {
      rent *= 1 + effect.value;
      notes.push(effect.value > 0 ? "英雄曝光上升" : "輿論熱度下降");
    }
  }

  const ownerChar = getCharacter(owner);
  if (ownerChar?.id === "huang_smoke" && tile.tier === "S") {
    rent *= 1.08;
    notes.push("轟焦凍高價區壓制");
  }

  if (ownerChar?.id === "jobs_think" && tile.level === 4) {
    rent *= 1.2;
    notes.push("奮進人 No.1 事務所加成");
  }

  if (tile.zone) {
    const zoneBonus = getZoneRentBonus(owner, tile.zone);
    if (zoneBonus) {
      rent *= 1 + zoneBonus;
      notes.push(`地區套裝 +${Math.round(zoneBonus * 100)}%`);
    }
  }

  if (tile.disruptedTurns > 0) {
    rent *= 0.6;
    notes.push("據點干擾 -40%");
  }

  if (tile.disabledRentOnce) {
    rent = 0;
    notes.push("據點停擺");
    if (!options.simulate) tile.disabledRentOnce = false;
  }

  const incomeBoost = getEffect(owner, "rentIncomeBoost");
  if (incomeBoost) {
    rent *= 1 + incomeBoost;
    notes.push("歐爾麥特站台");
  }

  const payPenalty = getEffect(payer, "rentPayPenalty");
  if (payPenalty) {
    rent *= 1 + payPenalty;
    notes.push("敵聯合危險加收");
  }

  if (tile.rentBoostNext) {
    rent *= 2;
    notes.push("英雄廣告看板");
  }

  if (payer.noRentCount > 0) {
    rent = 0;
    notes.push("無重力漂浮");
    if (!options.simulate) payer.noRentCount -= 1;
  }

  const shield = getEffect(payer, "feeShield");
  if (shield && rent > 0) {
    rent *= Math.max(0.1, 1 - shield);
    notes.push("硬化防守");
  }

  const vigilant = getEffect(payer, "rentReduction");
  if (vigilant && rent > 0) {
    rent *= Math.max(0.1, 1 - vigilant);
    notes.push("敵人預警");
  }

  const payerChar = getCharacter(payer);
  if (!options.simulate && payerChar?.id === "jolin_zero" && rent > 0 && Math.random() < 0.2) {
    rent *= 0.8;
    notes.push("麗日無重力減免");
  }

  return { rent: Math.max(0, Math.round(rent)), notes };
}

function payBank(player, amount) {
  player.cash -= Math.round(amount);
  checkBankrupt(player);
}

function giveCash(player, amount) {
  player.cash += Math.round(amount);
}

function transferMoney(from, to, amount) {
  const payment = Math.round(amount);
  from.cash -= payment;
  to.cash += payment;
  checkBankrupt(from);
}

function checkBankrupt(player) {
  if (player.cash >= 0 || player.isBankrupt) return;

  const ownedTiles = state.tiles.filter(t => t.ownerId === player.id);
  if (ownedTiles.length > 0) {
    let needed = Math.abs(player.cash);
    for (const tile of ownedTiles) {
      if (needed <= 0) break;
      const refund = Math.round(tile.price * 0.5 + tile.level * tile.price * 0.25);
      player.cash += refund;
      needed = Math.abs(Math.min(0, player.cash));
      log(`${player.name} 支援預算不足，緊急撤收 ${tile.name} 回收 ${formatMoney(refund)}。`);
      tile.ownerId = null;
      tile.level = 0;
      tile.rentBoostNext = false;
    }
  }

  if (player.cash < 0) {
    player.isBankrupt = true;
    player.cash = 0;
    for (const tile of state.tiles) {
      if (tile.ownerId === player.id) {
        tile.ownerId = null;
        tile.level = 0;
        tile.rentBoostNext = false;
      }
    }
    log(`${player.name} 停業，退出遊戲。`);
  }
}

function rollDiceFor(player) {
  if (player.nextDice) {
    const dice = player.nextDice;
    player.nextDice = null;
    return dice;
  }

  if (player.nextDiceRange) {
    const [min, max] = player.nextDiceRange;
    player.nextDiceRange = null;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  const personalLimit = hasDiceLimit(player);
  const globalLimit = state.globalEffects.find(e => e.kind === "diceLimitAll")?.value || null;
  const limit = personalLimit || globalLimit;
  const max = limit || 6;
  return Math.floor(Math.random() * max) + 1;
}

function movePlayer(player, steps, options = { triggerStart: true }) {
  const oldPosition = player.position;
  const newPosition = (player.position + steps) % state.tiles.length;
  if (options.triggerStart && oldPosition + steps >= state.tiles.length) {
    withPlayerDelta(player, `${player.name} 經過英雄總部領薪水`, () => {
      giveCash(player, 2000);
    });
  }
  player.position = newPosition;
}

function movePlayerTo(player, tileId) {
  player.position = tileId;
}

function handleGodOverlay(player) {
  const spawnIndex = state.godSpawns.findIndex(g => g.tileId === player.position);
  if (spawnIndex < 0) return;

  const spawn = state.godSpawns[spawnIndex];
  const god = window.TAOFUWENG_GODS.find(g => g.id === spawn.godId);
  if (!god) return;

  player.statusEffects.push({ ...god });
  state.godSpawns.splice(spawnIndex, 1);
  log(`${player.name} 抵達隨機降臨的 ${god.name}：${god.description}，持續 ${god.duration} 回合。`);
}

function handleLanding(player) {
  handleGodOverlay(player);
  const tile = currentTile(player);

  if (tile.type === "start") {
    withPlayerDelta(player, `${player.name} 回到英雄總部`, () => {
      giveCash(player, 1000);
    });
    return;
  }

  if (tile.type === "land") {
    handleLandTile(player, tile);
    return;
  }

  if (tile.type === "card") {
    drawCard(player, 1, `${player.name} 抵達支援裝備卡`);
    return;
  }

  if (tile.type === "fate") {
    triggerFate(player);
    return;
  }

  if (tile.type === "traffic") {
    let fee = 300;
    if (getCharacter(player)?.id === "musk_bite") fee = Math.round(fee * 1.2);

    withPlayerDelta(player, `${player.name} 抵達 ${tile.name}，支付交通費`, () => {
      payBank(player, fee);
    });

    if (getCharacter(player)?.id === "musk_bite" && !player.isBankrupt) {
      movePlayer(player, 2, { triggerStart: false });
      log(`${player.name} 發動飯田引擎，從交通格額外前進 2 格到 ${currentTile(player).name}。`);
      handleLanding(player);
    }
    return;
  }

  if (tile.type === "lottery") {
    if (player.cash >= 500) {
      withPlayerDelta(player, `${player.name} 投入支援基金抽選`, () => {
        player.cash -= 800;
        state.lotteryPool += 500;
      });

      if (Math.random() < 0.2) {
        const prize = Math.round(state.lotteryPool * 0.7);
        withPlayerDelta(player, `${player.name} 支援基金中獎`, () => {
          player.cash += prize;
          state.lotteryPool -= prize;
        });
      } else {
        log(`${player.name} 支援基金未中，支援基金池累積至 ${formatMoney(state.lotteryPool)}。`);
      }
    }
  }
}

function handleLandTile(player, tile) {
  if (!tile.ownerId) {
    log(`${player.name} 抵達無主據點：${tile.name}，購入價 ${formatMoney(calculatePurchasePrice(player, tile))}。`);
    return;
  }

  if (tile.ownerId === player.id) {
    log(`${player.name} 抵達自己的據點：${tile.name}。`);
    return;
  }

  const owner = state.players.find(p => p.id === tile.ownerId);
  if (!owner || owner.isBankrupt) return;

  const beforePayerCash = player.cash;
  const beforePayerWorth = calculateNetWorth(player);
  const beforeOwnerCash = owner.cash;
  const beforeOwnerWorth = calculateNetWorth(owner);

  const { rent, notes } = calculateRent(tile, player, owner, { simulate: false });
  transferMoney(player, owner, rent);
  if (tile.rentBoostNext) tile.rentBoostNext = false;

  const noteText = notes.length ? `（${notes.join("、")}）` : "";
  log(`${player.name} 抵達 ${owner.name} 的 ${tile.name}，支付委託支援費 ${formatMoney(rent)}${noteText}。`);
  log(`${player.name} 支援預算 ${signed(player.cash - beforePayerCash)}｜聲望資產 ${signed(calculateNetWorth(player) - beforePayerWorth)}；${owner.name} 支援預算 ${signed(owner.cash - beforeOwnerCash)}｜聲望資產 ${signed(calculateNetWorth(owner) - beforeOwnerWorth)}`);
}

function drawCard(player, count, reason) {
  let actualCount = count;
  if (getCharacter(player)?.id === "jay_turn" && Math.random() < 0.2) {
    actualCount += 1;
    log(`${player.name} 發動八百萬百「創造」，多抽 1 張。`);
  }

  for (let i = 0; i < actualCount; i += 1) {
    const card = window.TAOFUWENG_CARDS[Math.floor(Math.random() * window.TAOFUWENG_CARDS.length)];
    if (player.cards.length >= maxHandSize) {
      log(`${reason}，但手牌已滿，丟棄抽到的「${card.name}」。`);
    } else {
      player.cards.push(card.id);
      log(`${reason}，獲得「${card.name}」。`);
    }
  }
}

function triggerFate(player) {
  const event = window.TAOFUWENG_EVENTS[Math.floor(Math.random() * window.TAOFUWENG_EVENTS.length)];
  log(`${player.name} 觸發突發事件「${event.name}」：${event.description}`);

  if (event.negative && player.cancelNegativeFateCount > 0) {
    player.cancelNegativeFateCount -= 1;
    log(`${player.name} 使用危機公關效果，抵銷「${event.name}」。`);
    return;
  }

  if (event.type === "cash") {
    withPlayerDelta(player, event.name, () => {
      player.cash += event.amount;
      checkBankrupt(player);
    });
    return;
  }

  if (event.type === "cash_all") {
    for (const p of state.players.filter(p => !p.isBankrupt)) {
      withPlayerDelta(p, event.name, () => {
        p.cash += event.amount;
        checkBankrupt(p);
      });
    }
    return;
  }

  if (event.type === "global_rent") {
    state.globalEffects.push({
      name: event.name,
      duration: event.duration,
      kind: "rentAll",
      value: event.value
    });
    log(`${event.name} 已加入全域效果：委託支援費 ${textSigned(event.value * 100)}%，持續 ${event.duration} 回合。`);
    return;
  }

  if (event.type === "upgrade_discount_all") {
    state.globalEffects.push({
      name: event.name,
      duration: event.duration,
      kind: "upgradeDiscountAll",
      value: event.value
    });
    log(`${event.name} 已加入全域效果：全體下次擴建費降低 ${Math.round(event.value * 100)}%。`);
    return;
  }

  if (event.type === "dice_limit_all") {
    state.globalEffects.push({
      name: event.name,
      duration: event.duration,
      kind: "diceLimitAll",
      value: event.value
    });
    log(`${event.name} 已加入全域效果：所有玩家移動點數上限 ${event.value}，持續 ${event.duration} 回合。`);
    return;
  }

  if (event.type === "cash_if_own_land") {
    const owned = state.tiles.filter(t => t.ownerId === player.id);
    if (!owned.length) {
      log(`${player.name} 沒有據點，維修單找不到收件人，本次免疫。`);
      return;
    }
    withPlayerDelta(player, event.name, () => {
      player.cash += event.amount;
      checkBankrupt(player);
    });
    return;
  }

  if (event.type === "damage_highest_land") {
    const owned = state.tiles.filter(t => t.ownerId === player.id).sort((a, b) => b.level - a.level || b.price - a.price);
    if (!owned.length) {
      log(`${player.name} 沒有可被破壞的設施，本次逃過敵人襲擊。`);
      return;
    }
    const tile = owned[0];
    if (tile.guardTurns > 0) {
      tile.guardTurns = 0;
      state.stats.defenseSuccess += 1;
      log(`${player.name} 的 ${tile.name} 防守生效，抵銷敵人襲擊。`);
      return;
    }
    const beforeWorth = calculateNetWorth(player);
    if (tile.level > 0) {
      tile.level -= 1;
      log(`${player.name} 的 ${tile.name} 遭敵人襲擊降 1 級｜聲望 ${signed(calculateNetWorth(player) - beforeWorth)}`);
    } else {
      tile.disabledRentOnce = true;
      log(`${player.name} 的 ${tile.name} 遭敵人襲擊，停擺一次。`);
    }
    state.stats.damageUses += 1;
    return;
  }

  if (event.type === "cash_most_land") {
    const candidates = state.players.filter(p => !p.isBankrupt);
    candidates.sort((a, b) => state.tiles.filter(t => t.ownerId === b.id).length - state.tiles.filter(t => t.ownerId === a.id).length);
    const target = candidates[0];
    withPlayerDelta(target, event.name, () => {
      target.cash += event.amount;
    });
    return;
  }

  if (event.type === "cash_highest_worth_percent") {
    const target = [...state.players].filter(p => !p.isBankrupt).sort((a, b) => calculateNetWorth(b) - calculateNetWorth(a))[0];
    const penalty = Math.round(target.cash * event.percent);
    withPlayerDelta(target, event.name, () => {
      target.cash -= penalty;
      checkBankrupt(target);
    });
    return;
  }

  if (event.type === "cash_high_tier_owners") {
    for (const p of state.players.filter(p => !p.isBankrupt)) {
      const hasHighTier = state.tiles.some(t => t.ownerId === p.id && (t.tier === "S" || t.tier === "A"));
      if (hasHighTier) {
        withPlayerDelta(p, event.name, () => {
          p.cash += event.amount;
        });
      }
    }
  }
}

function buyCurrentLand(player) {
  const tile = currentTile(player);
  if (state.landActionUsed) return false;
  if (tile.type !== "land") return false;
  if (tile.ownerId) return false;

  const price = calculatePurchasePrice(player, tile);
  if (player.cash < price) return false;

  const beforeComplete = tile.zone ? getZoneProgress(player, tile.zone).complete : false;

  withPlayerDelta(player, `${player.name} 進駐 ${tile.name}`, () => {
    player.cash -= price;
    tile.ownerId = player.id;
    tile.level = 0;
  });

  if (tile.zone && !beforeComplete && getZoneProgress(player, tile.zone).complete) {
    state.stats.completedSets += 1;
    log(`${player.name} 完成「${getZoneConfig(tile.zone)?.name || tile.zone}」套裝，該區支援費 +30%。`);
  }

  state.landActionUsed = true;
  return true;
}

function upgradeCurrentLand(player) {
  const tile = currentTile(player);
  if (state.landActionUsed) return false;
  if (tile.type !== "land") return false;
  if (tile.ownerId !== player.id) return false;
  if (tile.level >= 4) return false;

  const cost = calculateUpgradeCost(player, tile);
  if (player.cash < cost) return false;

  const levelGain = player.blastUpgradeCount > 0 ? Math.min(2, 4 - tile.level) : 1;
  withPlayerDelta(player, `${player.name} 擴建 ${tile.name} 至 ${LEVEL_NAMES[tile.level + levelGain]}`, () => {
    player.cash -= cost;
    tile.level += levelGain;
  });
  if (player.upgradeDiscountCount > 0) player.upgradeDiscountCount -= 1;
  if (player.blastUpgradeCount > 0) player.blastUpgradeCount -= 1;

  state.landActionUsed = true;
  return true;
}

function endTurn() {
  const player = currentPlayer();

  if (player.abilityCooldown > 0) {
    player.abilityCooldown -= 1;
  }

  for (const effect of player.statusEffects) {
    effect.duration -= 1;
  }
  player.statusEffects = player.statusEffects.filter(e => e.duration > 0);

  if (state.currentPlayerIndex === state.players.length - 1) {
    for (const effect of state.globalEffects) effect.duration -= 1;
    state.globalEffects = state.globalEffects.filter(e => e.duration > 0);
    decrementTileStatuses();
  }

  advanceToNextPlayer();

  let skipGuard = 0;
  while (!state.gameOver && currentPlayer().skipNextTurn && skipGuard < state.players.length) {
    const skipped = currentPlayer();
    skipped.skipNextTurn = false;
    log(`${skipped.name} 被捕縛 / 冰封，停留在 ${currentTile(skipped).name} 並再次觸發該格。`);
    handleLanding(skipped);
    log(`${skipped.name} 跳過本回合移動。`);
    advanceToNextPlayer();
    skipGuard += 1;
  }

  ensureGodSpawns();
  checkGameOver();

  state.phase = "waitingRoll";
  state.landActionUsed = false;
  currentPlayer().licenseUsedThisTurn = false;
  render();

  const next = currentPlayer();
  if (!state.gameOver && next.type === "ai") {
    setTimeout(runAITurns, 420);
  }
}

function advanceToNextPlayer() {
  let guard = 0;
  do {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    if (state.currentPlayerIndex === 0) state.round += 1;
    guard += 1;
  } while (currentPlayer().isBankrupt && guard < state.players.length + 1);
}

function calculateNetWorth(player) {
  const owned = state.tiles.filter(t => t.ownerId === player.id);
  const landValue = owned.reduce((sum, t) => sum + t.price, 0);
  const buildingValue = owned.reduce((sum, t) => sum + t.level * t.price * 0.35, 0);
  return Math.round(player.cash + landValue + buildingValue);
}

function checkGameOver() {
  const alive = state.players.filter(p => !p.isBankrupt);
  if (alive.length <= 1) {
    state.gameOver = true;
    state.winnerText = `${alive[0]?.name || "無人"} 勝利。`;
    log(`遊戲結束：${state.winnerText}`);
    return;
  }

  if (state.round > state.maxRound) {
    const ranking = [...state.players].sort((a, b) => calculateNetWorth(b) - calculateNetWorth(a));
    state.gameOver = true;
    state.winnerText = `${ranking[0].name} 以聲望資產 ${formatMoney(calculateNetWorth(ranking[0]))} 勝利。`;
    log(`${state.maxRound} 回合結束：${state.winnerText}`);
  }
}

function humanRoll() {
  if (state.gameOver) return;
  const player = currentPlayer();
  if (player.type !== "human" || state.phase !== "waitingRoll") return;

  aiPreRollDecision(player);
  const dice = rollDiceFor(player);
  state.lastDice = dice;
  log(`${player.name} 擲出 ${dice} 點。`);
  movePlayer(player, dice);
  handleLanding(player);
  state.phase = "action";
  checkGameOver();
  render();
}


function canUseAbility(player) {
  if (!state.options?.enableQuirks || !player || player.type !== "human" || player.isBankrupt || state.gameOver) return false;
  if (player.abilityCooldown > 0) return false;

  if (player.characterId === "bill_rice" || player.characterId === "musk_bite") {
    return state.phase === "waitingRoll";
  }

  return true;
}

function useAbility() {
  const player = currentPlayer();
  if (!canUseAbility(player)) return false;

  const char = getCharacter(player);

  if (player.characterId === "bill_rice") {
    if (player.cash < 800) return false;
    const raw = prompt("One For All：指定下一次移動點數 1～6，需支付 800 身體負擔費。", "6");
    const dice = Number(raw);
    if (!Number.isInteger(dice) || dice < 1 || dice > 6) return false;
    withPlayerDelta(player, `${player.name} 使用「${char.abilityName}」`, () => {
      player.cash -= 800;
      player.nextDice = dice;
      checkBankrupt(player);
    });
    player.abilityCooldown = 5;
    return true;
  }

  if (player.characterId === "musk_bite") {
    if (player.cash < 600) return false;
    withPlayerDelta(player, `${player.name} 使用「${char.abilityName}」`, () => {
      player.cash -= 600;
      player.nextDice = 6;
      checkBankrupt(player);
    });
    player.abilityCooldown = 4;
    return true;
  }

  if (player.characterId === "jay_turn") {
    if (player.cash < 600 || player.cards.length >= maxHandSize) return false;
    withPlayerDelta(player, `${player.name} 使用「${char.abilityName}」`, () => {
      player.cash -= 600;
      checkBankrupt(player);
    });
    drawCard(player, 1, `${player.name} 創造支援裝備`);
    player.abilityCooldown = 4;
    return true;
  }

  if (player.characterId === "jolin_zero") {
    player.noRentCount += 1;
    player.abilityCooldown = 4;
    log(`${player.name} 使用「${char.abilityName}」，下次抵達他人據點支援費 -50%。`);
    return true;
  }

  if (player.characterId === "gou_lift") {
    player.blastUpgradeCount += 1;
    player.abilityCooldown = 5;
    log(`${player.name} 使用「${char.abilityName}」，下一次擴建可連升 2 級，但費用 +45%。`);
    return true;
  }

  if (player.characterId === "huang_smoke") {
    const targets = state.players.filter(p => p.id !== player.id && !p.isBankrupt);
    const target = askPlayerTarget(targets);
    if (!target) return false;
    target.skipNextTurn = true;
    player.abilityCooldown = 5;
    log(`${player.name} 使用「${char.abilityName}」，冰封 ${target.name}，使其停 1 回合；下回合開始會再次觸發所在格。`);
    return true;
  }

  if (player.characterId === "jobs_think") {
    const owned = state.tiles.filter(t => t.ownerId === player.id).sort((a, b) => b.level - a.level || b.price - a.price);
    if (!owned.length) return false;
    const tile = owned[0];
    tile.rentBoostNext = true;
    player.abilityCooldown = 5;
    log(`${player.name} 使用「${char.abilityName}」，${tile.name} 下次支援費 ×1.5。`);
    return true;
  }

  if (player.characterId === "lin_mansion") {
    player.statusEffects.push({
      id: "hardening_guard",
      name: "硬化防守",
      duration: 3,
      kind: "feeShield",
      value: 0.2,
      description: "支付委託支援費 -20%。"
    });
    player.abilityCooldown = 4;
    log(`${player.name} 使用「${char.abilityName}」，3 回合內支付委託支援費 -20%。`);
    return true;
  }

  return false;
}

function aiUseCardDirect(player, cardId) {
  if (!player.cards.includes(cardId)) return false;
  const card = window.TAOFUWENG_CARDS.find(c => c.id === cardId);
  if (!card) return false;

  if (cardId === "site_guard") {
    const tile = findBestOwnedTile(player);
    if (!tile || tile.guardTurns > 0) return false;
    setTileGuard(player, tile, card.name);
    removeCardFromHand(player, cardId);
    useCardRecord();
    return true;
  }

  if (cardId === "demolish") {
    const target = findBestEnemyTile(player);
    if (!target) return false;
    applyTileDamage(player, target, card.name);
    removeCardFromHand(player, cardId);
    useCardRecord();
    return true;
  }

  if (cardId === "media_storm") {
    const target = findBestEnemyTile(player);
    if (!target) return false;
    applyTileDisruption(player, target, card.name);
    removeCardFromHand(player, cardId);
    useCardRecord();
    return true;
  }

  if (cardId === "support_repair") {
    const tile = state.tiles.find(t => t.ownerId === player.id && (t.disruptedTurns > 0 || t.disabledRentOnce));
    if (!tile) return false;
    clearTileStatus(tile);
    removeCardFromHand(player, cardId);
    useCardRecord();
    log(`${player.name} 使用「${card.name}」，維修 ${tile.name}。`);
    return true;
  }

  if (cardId === "low_speed_patrol" && state.phase === "waitingRoll") {
    player.nextDiceRange = [1, 3];
    removeCardFromHand(player, cardId);
    useCardRecord();
    state.stats.routeUses += 1;
    log(`${player.name} 使用「${card.name}」，準備低速巡邏。`);
    return true;
  }

  if (cardId === "high_speed_support" && state.phase === "waitingRoll") {
    player.nextDiceRange = [4, 6];
    removeCardFromHand(player, cardId);
    useCardRecord();
    state.stats.routeUses += 1;
    log(`${player.name} 使用「${card.name}」，準備高速支援。`);
    return true;
  }

  return false;
}

function aiPreRollDecision(player) {
  const targetsAhead = [];
  for (let step = 1; step <= 6; step += 1) {
    const tile = state.tiles[(player.position + step) % state.tiles.length];
    if (tile.type === "land" && (!tile.ownerId || tile.ownerId === player.id || isBlockingTile(player, tile))) {
      targetsAhead.push({ step, tile, score: scoreTileForPlayer(player, tile) + (isBlockingTile(player, tile) ? 80 : 0) });
    }
  }
  targetsAhead.sort((a, b) => b.score - a.score);
  const best = targetsAhead[0];

  if (best && best.step <= 3 && player.cards.includes("low_speed_patrol")) {
    aiUseCardDirect(player, "low_speed_patrol");
  } else if (best && best.step >= 4 && player.cards.includes("high_speed_support")) {
    aiUseCardDirect(player, "high_speed_support");
  }
}

function aiStrategyPressure(player) {
  if (player.cards.includes("site_guard")) {
    const best = findBestOwnedTile(player);
    if (best && scoreTileForPlayer(player, best) > 70 && best.guardTurns <= 0) aiUseCardDirect(player, "site_guard");
  }

  if (player.cards.includes("demolish")) {
    const target = findBestEnemyTile(player);
    if (target) {
      const owner = state.players.find(p => p.id === target.ownerId);
      if (owner && (getZoneCompletionThreat(owner, target.zone) || target.level >= 2)) aiUseCardDirect(player, "demolish");
    }
  }

  if (player.cards.includes("media_storm")) {
    const target = findBestEnemyTile(player);
    if (target && target.level >= 1 && target.disruptedTurns <= 0) aiUseCardDirect(player, "media_storm");
  }

  if (player.cards.includes("support_repair")) aiUseCardDirect(player, "support_repair");
}

function aiDecision(player) {
  const tile = currentTile(player);

  if (player.cards.includes("cash_bonus")) {
    useCardById(player, "cash_bonus", { silent: true });
  }
  if (player.cards.includes("first_aid") && player.cash < 7000) {
    useCardById(player, "first_aid", { silent: true });
  }
  if (player.cards.includes("support_item")) {
    useCardById(player, "support_item", { silent: true });
  }

  aiStrategyPressure(player);

  if (player.abilityCooldown <= 0 && player.characterId === "jay_turn" && player.cash > 7000 && player.cards.length < maxHandSize) {
    withPlayerDelta(player, `${player.name} 使用「道具創造」`, () => {
      player.cash -= 600;
    });
    drawCard(player, 1, `${player.name} 創造支援裝備`);
    player.abilityCooldown = 4;
  }

  if (tile.type === "land" && !tile.ownerId) {
    const price = calculatePurchasePrice(player, tile);
    const score = scoreTileForPlayer(player, tile);
    const block = isBlockingTile(player, tile);
    const reserve = block ? 1200 : (score > 100 ? 2500 : 4500);
    if (player.cash > price + reserve) {
      buyCurrentLand(player);
    }
  }

  if (
    !state.landActionUsed &&
    tile.type === "land" &&
    tile.ownerId === player.id &&
    tile.level < 4
  ) {
    const cost = calculateUpgradeCost(player, tile);
    const score = scoreTileForPlayer(player, tile);
    const reserve = score > 120 ? 2500 : 5500;
    if (player.cash > cost + reserve) {
      upgradeCurrentLand(player);
    }
  }
}

function runSingleAITurn() {
  if (state.gameOver) return;
  const player = currentPlayer();
  if (player.type !== "ai" || player.isBankrupt) return;

  const dice = rollDiceFor(player);
  state.lastDice = dice;
  log(`${player.name} 擲出 ${dice} 點。`);
  movePlayer(player, dice);
  handleLanding(player);
  state.phase = "action";
  aiDecision(player);
  checkGameOver();
  render();

  if (!state.gameOver) {
    setTimeout(endTurn, 300);
  }
}

function runAITurns() {
  if (state.gameOver) return;
  const player = currentPlayer();
  if (player.type === "ai") {
    runSingleAITurn();
  }
}

function ensureGodSpawns() {
  if (!state || state.options?.enableRaids === false) return;

  while (state.godSpawns.length < 2) {
    const occupied = new Set(state.players.filter(p => !p.isBankrupt).map(p => p.position));
    const existing = new Set(state.godSpawns.map(g => g.tileId));
    const candidates = state.tiles
      .filter(t => t.id !== 0 && !occupied.has(t.id) && !existing.has(t.id))
      .map(t => t.id);

    if (!candidates.length) return;

    const tileId = candidates[Math.floor(Math.random() * candidates.length)];
    const god = window.TAOFUWENG_GODS[Math.floor(Math.random() * window.TAOFUWENG_GODS.length)];
    state.godSpawns.push({ tileId, godId: god.id });
  }
}

function removeCardFromHand(player, cardId) {
  const index = player.cards.indexOf(cardId);
  if (index >= 0) player.cards.splice(index, 1);
}

function useSelectedCard() {
  const player = currentPlayer();
  const select = document.getElementById("cardSelect");
  if (!select || !select.value) return;
  useCardById(player, select.value);
  render();
}

function useCardById(player, cardId, options = {}) {
  if (!player.cards.includes(cardId)) return false;
  const card = window.TAOFUWENG_CARDS.find(c => c.id === cardId);
  if (!card) return false;

  if (cardId === "remote_dice") {
    if (state.phase !== "waitingRoll") {
      if (!options.silent) alert("全覆蓋衝刺只能在擲骰前使用。");
      return false;
    }
    const raw = prompt("請輸入下一次移動點數 1～6：", "6");
    const dice = Number(raw);
    if (!Number.isInteger(dice) || dice < 1 || dice > 6) return false;
    player.nextDice = dice;
    removeCardFromHand(player, cardId);
    useCardRecord();
    state.stats.routeUses += 1;
    log(`${player.name} 使用「${card.name}」，下一次擲骰指定為 ${dice}。`);
    return true;
  }


  if (cardId === "low_speed_patrol") {
    if (state.phase !== "waitingRoll") {
      if (!options.silent) alert("低速巡邏只能在擲骰前使用。");
      return false;
    }
    player.nextDiceRange = [1, 3];
    removeCardFromHand(player, cardId);
    useCardRecord();
    state.stats.routeUses += 1;
    log(`${player.name} 使用「${card.name}」，下一次移動限定 1～3。`);
    return true;
  }

  if (cardId === "high_speed_support") {
    if (state.phase !== "waitingRoll") {
      if (!options.silent) alert("高速支援只能在擲骰前使用。");
      return false;
    }
    player.nextDiceRange = [4, 6];
    removeCardFromHand(player, cardId);
    useCardRecord();
    state.stats.routeUses += 1;
    log(`${player.name} 使用「${card.name}」，下一次移動限定 4～6。`);
    return true;
  }

  if (cardId === "stay_deploy") {
    if (state.phase !== "waitingRoll") {
      if (!options.silent) alert("定點部署只能在擲骰前使用。");
      return false;
    }
    removeCardFromHand(player, cardId);
    useCardRecord();
    state.stats.routeUses += 1;
    state.lastDice = 0;
    log(`${player.name} 使用「${card.name}」，停留原地並觸發 ${currentTile(player).name}。`);
    handleLanding(player);
    state.phase = "action";
    checkGameOver();
    return true;
  }

  if (cardId === "rent_free") {
    player.noRentCount += 1;
    removeCardFromHand(player, cardId);
    useCardRecord();
    log(`${player.name} 使用「${card.name}」，下次抵達他人據點支援費 -50%。`);
    return true;
  }

  if (cardId === "cash_bonus") {
    withPlayerDelta(player, `${player.name} 使用「${card.name}」：救援任務完成，收到英雄協會補助`, () => {
      player.cash += 1200;
    });
    removeCardFromHand(player, cardId);
    return true;
  }

  if (cardId === "repair_bill") {
    withPlayerDelta(player, `${player.name} 使用「${card.name}」：訓練場維修單送達`, () => {
      player.cash -= 900;
      checkBankrupt(player);
    });
    removeCardFromHand(player, cardId);
    return true;
  }

  if (state.phase !== "action") {
    if (!options.silent) alert("這張卡只能在行動階段使用。");
    return false;
  }

  if (cardId === "rent_boost") {
    const owned = state.tiles.filter(t => t.ownerId === player.id);
    if (!owned.length) return false;
    const tileId = askTileId("請輸入自己據點 ID：\n" + owned.map(t => `${t.id}: ${t.name}`).join("\n"));
    const tile = owned.find(t => t.id === tileId);
    if (!tile) return false;
    tile.rentBoostNext = true;
    removeCardFromHand(player, cardId);
    log(`${player.name} 使用「${card.name}」，${tile.name} 下次委託支援費 ×1.5。理由：英雄廣告看板登上城市熱搜。`);
    return true;
  }

  if (cardId === "tax_check") {
    const targets = state.players.filter(p => p.id !== player.id && !p.isBankrupt);
    const target = askPlayerTarget(targets);
    if (!target) return false;
    const penalty = Math.min(5000, Math.round(target.cash * 0.05));
    withPlayerDelta(target, `${player.name} 使用「${card.name}」`, () => {
      target.cash -= penalty;
      checkBankrupt(target);
    });
    removeCardFromHand(player, cardId);
    useCardRecord();
    return true;
  }

  if (cardId === "demolish") {
    const candidates = state.tiles.filter(t => t.ownerId && t.ownerId !== player.id);
    if (!candidates.length) return false;
    const tileId = askTileId("請輸入要破壞的對手據點 ID：\n" + candidates.map(t => `${t.id}: ${t.name}｜Lv${t.level}｜${getTileStatusText(t)}`).join("\n"));
    const tile = candidates.find(t => t.id === tileId);
    if (!tile) return false;
    if (!applyTileDamage(player, tile, card.name)) return false;
    removeCardFromHand(player, cardId);
    useCardRecord();
    return true;
  }

  if (cardId === "media_storm") {
    const candidates = state.tiles.filter(t => t.ownerId && t.ownerId !== player.id);
    if (!candidates.length) return false;
    const tileId = askTileId("請輸入要干擾的對手據點 ID：\n" + candidates.map(t => `${t.id}: ${t.name}｜${getTileStatusText(t)}`).join("\n"));
    const tile = candidates.find(t => t.id === tileId);
    if (!tile) return false;
    if (!applyTileDisruption(player, tile, card.name)) return false;
    removeCardFromHand(player, cardId);
    useCardRecord();
    return true;
  }

  if (cardId === "site_guard") {
    const owned = state.tiles.filter(t => t.ownerId === player.id);
    if (!owned.length) return false;
    const tileId = askTileId("請輸入要防守的自己據點 ID：\n" + owned.map(t => `${t.id}: ${t.name}｜${getTileStatusText(t)}`).join("\n"));
    const tile = owned.find(t => t.id === tileId);
    if (!tile) return false;
    if (!setTileGuard(player, tile, card.name)) return false;
    removeCardFromHand(player, cardId);
    useCardRecord();
    return true;
  }

  if (cardId === "support_repair") {
    const owned = state.tiles.filter(t => t.ownerId === player.id);
    if (!owned.length) return false;
    const tileId = askTileId("請輸入要維修的自己據點 ID：\n" + owned.map(t => `${t.id}: ${t.name}｜${getTileStatusText(t)}`).join("\n"));
    const tile = owned.find(t => t.id === tileId);
    if (!tile) return false;
    clearTileStatus(tile);
    removeCardFromHand(player, cardId);
    useCardRecord();
    log(`${player.name} 使用「${card.name}」，清除 ${tile.name} 的干擾 / 停擺 / 防守狀態。`);
    return true;
  }

  if (cardId === "airport_express") {
    const trafficTiles = state.tiles.filter(t => t.type === "traffic");
    const tileId = askTileId("請輸入要前往的交通格 ID：\n" + trafficTiles.map(t => `${t.id}: ${t.name}`).join("\n"));
    const tile = trafficTiles.find(t => t.id === tileId);
    if (!tile) return false;
    movePlayerTo(player, tile.id);
    removeCardFromHand(player, cardId);
    useCardRecord();
    state.stats.routeUses += 1;
    log(`${player.name} 使用「${card.name}」，直接前往 ${tile.name}，不支付交通費。`);
    handleGodOverlay(player);
    return true;
  }

  if (cardId === "traffic_dispatch") {
    const trafficTiles = state.tiles.filter(t => t.type === "traffic");
    const tileId = askTileId("請輸入要調度前往的交通格 ID：\n" + trafficTiles.map(t => `${t.id}: ${t.name}`).join("\n"));
    const tile = trafficTiles.find(t => t.id === tileId);
    if (!tile) return false;
    movePlayerTo(player, tile.id);
    removeCardFromHand(player, cardId);
    useCardRecord();
    state.stats.routeUses += 1;
    log(`${player.name} 使用「${card.name}」，調度到 ${tile.name}。`);
    handleGodOverlay(player);
    return true;
  }


  if (cardId === "binding_cloth") {
    if (state.phase !== "action") {
      if (!options.silent) alert("捕縛布只能在行動階段使用。");
      return false;
    }
    const targets = state.players.filter(p => p.id !== player.id && !p.isBankrupt);
    const target = askPlayerTarget(targets);
    if (!target) return false;
    target.skipNextTurn = true;
    removeCardFromHand(player, cardId);
    log(`${player.name} 使用「${card.name}」，${target.name} 停 1 回合；下回合開始會再次觸發所在格。`);
    return true;
  }

  if (cardId === "support_item") {
    player.upgradeDiscountCount += 1;
    removeCardFromHand(player, cardId);
    useCardRecord();
    log(`${player.name} 使用「${card.name}」，下一次擴建費 -25%。`);
    return true;
  }

  if (cardId === "provisional_license") {
    if (state.phase !== "action") {
      if (!options.silent) alert("臨時執照只能在行動階段使用。");
      return false;
    }
    if (player.licenseUsedThisTurn) {
      if (!options.silent) alert("臨時執照每回合只能實際使用一次。");
      return false;
    }
    state.landActionUsed = false;
    player.licenseUsedThisTurn = true;
    removeCardFromHand(player, cardId);
    useCardRecord();
    log(`${player.name} 使用「${card.name}」，本回合可再進行一次進駐 / 擴建。`);
    return true;
  }

  if (cardId === "patrol_route") {
    if (state.phase !== "action") {
      if (!options.silent) alert("巡邏路線變更只能在行動階段使用。");
      return false;
    }
    const candidates = [];
    for (let step = 1; step <= 8; step += 1) {
      const tile = state.tiles[(player.position + step) % state.tiles.length];
      if (tile.type === "land") candidates.push(tile);
    }
    if (!candidates.length) return false;
    const tileId = askTileId("請輸入前方據點 ID：\n" + candidates.map(t => `${t.id}: ${t.name}`).join("\n"));
    const tile = candidates.find(t => t.id === tileId);
    if (!tile) return false;
    movePlayerTo(player, tile.id);
    removeCardFromHand(player, cardId);
    useCardRecord();
    state.stats.routeUses += 1;
    log(`${player.name} 使用「${card.name}」，移動到 ${tile.name}。`);
    handleLanding(player);
    return true;
  }

  if (cardId === "crisis_pr") {
    player.cancelNegativeFateCount += 1;
    removeCardFromHand(player, cardId);
    useCardRecord();
    log(`${player.name} 使用「${card.name}」，下一次負面突發事件將被抵銷。`);
    return true;
  }

  if (cardId === "quirk_boost") {
    player.abilityCooldown = Math.max(0, player.abilityCooldown - 2);
    removeCardFromHand(player, cardId);
    useCardRecord();
    log(`${player.name} 使用「${card.name}」，個性冷卻 -2 回合。`);
    return true;
  }

  if (cardId === "first_aid") {
    withPlayerDelta(player, `${player.name} 使用「${card.name}」`, () => {
      player.cash += 1000;
    });
    player.skipNextTurn = false;
    player.statusEffects = player.statusEffects.filter(e => e.kind !== "diceLimit");
    removeCardFromHand(player, cardId);
    return true;
  }

  if (cardId === "villain_alert") {
    player.statusEffects.push({
      id: "villain_alert",
      name: "敵人預警",
      duration: 2,
      kind: "rentReduction",
      value: 0.2,
      description: "支付委託支援費 -20%。"
    });
    removeCardFromHand(player, cardId);
    useCardRecord();
    log(`${player.name} 使用「${card.name}」，2 回合內支付委託支援費 -20%。`);
    return true;
  }

  return false;
}

function askTileId(message) {
  const raw = prompt(message);
  if (raw === null) return null;
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

function askPlayerTarget(targets) {
  const raw = prompt("請輸入目標玩家編號：\n" + targets.map((p, i) => `${i + 1}: ${p.name}`).join("\n"));
  const index = Number(raw) - 1;
  return targets[index] || null;
}

function tileGridPosition(id) {
  if (id >= 0 && id <= 14) return { row: 15, col: id + 1 };
  if (id >= 15 && id <= 28) return { row: 29 - id, col: 15 };
  if (id >= 29 && id <= 42) return { row: 1, col: 43 - id };
  return { row: id - 41, col: 1 };
}

function restoreSetupOptions() {
  try {
    const saved = JSON.parse(localStorage.getItem("taofuwengOptionsV06e") || "null");
    if (!saved) return;
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el && value !== undefined && value !== null) el.value = String(value);
    };
    setValue("characterSelect", saved.selected);
    setValue("startingCashSelect", saved.startingCash);
    setValue("maxRoundSelect", saved.maxRound);
    setValue("aiCountSelect", saved.aiCount);
    setValue("raidSelect", saved.enableRaids ? "on" : "off");
  } catch (error) {
    console.warn("Failed to restore setup options", error);
  }
}

function renderSetup() {
  const board = document.getElementById("board");
  board.innerHTML = `
    <div class="center-dashboard setup" style="grid-column: 2 / 15; grid-row: 2 / 15;">
      <div class="setup-card">
        <h2>桃園 Hero City</h2>
        <p>選擇英雄角色與測試參數。預設為標準局：20,000 支援預算、30 回合、3 位 AI。v0.7c 已啟用角色與卡片平衡版，格子資訊改為精簡排版。</p>

        <div class="setup-grid">
          <div class="setup-field" style="grid-column: 1 / -1;">
            <label for="characterSelect">英雄角色</label>
            <select id="characterSelect">
              ${window.TAOFUWENG_CHARACTERS.map(c => `<option value="${c.id}">${c.name}｜個性：${c.quirk}｜${c.abilityText}</option>`).join("")}
            </select>
          </div>

          <div class="setup-field">
            <label for="startingCashSelect">起始支援預算</label>
            <select id="startingCashSelect">
              <option value="20000" selected>20,000｜標準局</option>
              <option value="80000">80,000｜富裕局</option>
              <option value="200000">200,000｜豪門局</option>
              <option value="400000">400,000｜失控局</option>
            </select>
          </div>

          <div class="setup-field">
            <label for="maxRoundSelect">最大回合數</label>
            <select id="maxRoundSelect">
              <option value="30" selected>30｜標準</option>
              <option value="60">60｜長局</option>
              <option value="90">90｜耐久</option>
              <option value="180">180｜超長測試</option>
            </select>
          </div>

          <div class="setup-field">
            <label for="aiCountSelect">AI 人數</label>
            <select id="aiCountSelect">
              <option value="1">1 位 AI</option>
              <option value="2">2 位 AI</option>
              <option value="3" selected>3 位 AI</option>
            </select>
          </div>

          <div class="setup-field">
            <label for="raidSelect">英雄 / 反派亂入</label>
            <select id="raidSelect">
              <option value="on" selected>啟用</option>
              <option value="off">關閉</option>
            </select>
          </div>
        </div>

        <div class="setup-actions">
          <button id="startGameBtn">開始遊戲</button>
        </div>
      </div>
    </div>
  `;

  for (const tile of initialTiles()) {
    board.appendChild(renderTileElement(tile, []));
  }

  restoreSetupOptions();

  document.getElementById("startGameBtn").addEventListener("click", () => {
    const selected = document.getElementById("characterSelect").value;
    const options = {
      startingCash: Number(document.getElementById("startingCashSelect").value),
      maxRound: Number(document.getElementById("maxRoundSelect").value),
      aiCount: Number(document.getElementById("aiCountSelect").value),
      enableRaids: document.getElementById("raidSelect").value === "on",
      enableQuirks: true
    };
    localStorage.setItem("taofuwengOptionsV06e", JSON.stringify({ selected, ...options }));
    createNewState(selected, options);
    render();
    if (currentPlayer().type === "ai") setTimeout(runAITurns, 400);
  });
}

function renderTileElement(tile, playersHere) {
  const div = document.createElement("div");
  const pos = tileGridPosition(tile.id);
  const typeClass = tile.type === "land" ? "land" :
    tile.type === "card" ? "card-tile" :
    tile.type === "fate" ? "fate-tile" :
    tile.type === "traffic" ? "traffic-tile" :
    tile.type === "lottery" ? "lottery-tile" : "";

  div.className = `tile ${typeClass}`;
  div.style.gridRow = pos.row;
  div.style.gridColumn = pos.col;
  if (tile.type === "land" && tile.zone) {
    div.style.setProperty("--zone-color", getZoneConfig(tile.zone)?.color || "transparent");
  } else {
    div.style.setProperty("--zone-color", "transparent");
  }

  if (state && playersHere.some(p => p.id === currentPlayer().id)) div.classList.add("current");
  if (state && state.selectedTileId === tile.id) div.classList.add("selected");

  const owner = state ? state.players.find(p => p.id === tile.ownerId) : null;
  const godSpawn = state ? state.godSpawns.find(g => g.tileId === tile.id) : null;
  const god = godSpawn ? window.TAOFUWENG_GODS.find(g => g.id === godSpawn.godId) : null;

  div.innerHTML = `
    <div class="tile-head">
      <span class="tile-id">#${tile.id}</span>
      <span class="tile-type-pill">${renderTileMeta(tile)}</span>
    </div>
    <div class="tile-name" title="${tile.name}">${tile.name}</div>
    ${renderBuildings(tile)}
    ${renderTileStatusBadges(tile)}
    ${owner ? `<div class="owner-strip" style="background:${PLAYER_COLORS[state.players.indexOf(owner)]}"></div>` : ""}
    ${god ? `<div class="god-marker" title="${god.name}">✨</div>` : ""}
    <div class="tokens">
      ${playersHere.map(p => `<span class="token" title="${p.name}" style="background:${PLAYER_COLORS[state.players.indexOf(p)]}"></span>`).join("")}
    </div>
  `;

  if (state) {
    div.addEventListener("click", () => openTileModal(tile.id));
  }

  return div;
}

function renderBoard() {
  const board = document.getElementById("board");
  board.innerHTML = "";

  for (const tile of state.tiles) {
    const playersHere = state.players.filter(p => !p.isBankrupt && p.position === tile.id);
    board.appendChild(renderTileElement(tile, playersHere));
  }

  const center = document.createElement("div");
  center.className = "center-dashboard";
  center.innerHTML = renderDashboard();
  board.appendChild(center);

  const modalWrap = document.createElement("div");
  modalWrap.innerHTML = renderTileModal();
  board.appendChild(modalWrap.firstElementChild);

  bindDynamicControls();
}

function renderDashboard() {
  const waiting = state.phase === "waitingRoll";
  return `
    <div class="dashboard-grid expanded-dashboard">
      <section class="info-card hero-control-card">
        <div class="hero-control-head">
          <h2>目前回合</h2>
          <div id="turnInfo" class="turn-info spacious">${renderTurnInfo()}</div>
        </div>
        <div class="hero-control-body">
          <div id="diceBox" class="dice-box large">${state.lastDice ?? "-"}</div>
          <div class="hero-action-stack">
            <div class="action-buttons spacious-actions ${waiting ? "phase-roll" : "phase-action"}">
              <button id="rollBtn" class="${waiting ? "featured-action" : "secondary"}">擲骰</button>
              <button id="abilityBtn" class="ability-btn">個性</button>
              <button id="buyBtn" class="secondary">進駐</button>
              <button id="upgradeBtn" class="secondary">擴建</button>
              <button id="endTurnBtn" class="${waiting ? "secondary" : "featured-action end-action"}">結束回合</button>
            </div>
            <div class="hint-row">${renderHint()}</div>
          </div>
        </div>
      </section>

      <section class="info-card hero-side-card">
        <div class="hero-side-grid">
          <div class="side-block">
            <h3>手牌 / 狀態</h3>
            <div class="card-actions spacious-card-actions">
              <select id="cardSelect">${renderCardOptions()}</select>
              <button id="useCardBtn" class="secondary">使用</button>
            </div>
            <div class="card-help card-help-box">${renderCardHelp()}</div>
          </div>
          <div class="side-block">
            <h3>全域 / 亂入</h3>
            <div class="world-block-line">支援基金：${formatMoney(state.lotteryPool)}</div>
            <div class="world-block-line">全域：${state.globalEffects.length ? state.globalEffects.map(e => `${e.name}(${e.duration})`).join("、") : "無"}</div>
            <div class="world-block-line">亂入：${state.options?.enableRaids === false ? "關閉" : (state.godSpawns.map(s => {
              const tile = state.tiles.find(t => t.id === s.tileId);
              const god = window.TAOFUWENG_GODS.find(g => g.id === s.godId);
              return `${god?.name || "亂入"}@${tile?.name || s.tileId}`;
            }).join("、") || "無")}</div>
          </div>
          <div class="side-block side-block-wide">
            <h3>平衡測試</h3>
            ${renderBalancePanel()}
          </div>
        </div>
      </section>

      <section class="info-card players-card spacious-panel">
        <h3>英雄事務所狀態</h3>
        <div id="playersPanel">${renderPlayers()}</div>
        ${state.gameOver ? renderEndSummary() : ""}
      </section>

      <section class="info-card log-card spacious-panel">
        <h3>事件紀錄</h3>
        <div class="log-panel roomier-log">
          ${renderLogItems()}
        </div>
      </section>
    </div>
  `;
}

function renderBalancePanel() {
  const alive = state.players.filter(p => !p.isBankrupt);
  const avgCash = alive.length ? Math.round(alive.reduce((sum, p) => sum + p.cash, 0) / alive.length) : 0;
  const ownedTiles = state.tiles.filter(t => t.ownerId).length;
  const bankruptCount = state.players.filter(p => p.isBankrupt).length;
  const highestRent = Math.max(0, ...state.tiles
    .filter(t => t.type === "land" && t.ownerId)
    .map(t => {
      const owner = state.players.find(p => p.id === t.ownerId) || currentPlayer();
      return calculateRent(t, currentPlayer(), owner, { simulate: true }).rent;
    }));
  const completedSets = state.players.reduce((sum, p) => sum + getPlayerCompletedSetCount(p), 0);
  const defended = state.tiles.filter(t => t.guardTurns > 0).length;
  const disrupted = state.tiles.filter(t => t.disruptedTurns > 0 || t.disabledRentOnce).length;

  return `
    <div class="balance-panel">
      <div class="balance-chip">均預算 <b>${formatMoney(avgCash)}</b></div>
      <div class="balance-chip">據點 <b>${ownedTiles}/${state.tiles.filter(t => t.type === "land").length}</b></div>
      <div class="balance-chip">最高費 <b>${formatMoney(highestRent)}</b></div>
      <div class="balance-chip">套裝 <b>${completedSets}</b></div>
      <div class="balance-chip">防守 <b>${defended}</b></div>
      <div class="balance-chip">干擾 <b>${disrupted}</b></div>
      <div class="balance-chip">破壞 <b>${state.stats.damageUses}</b></div>
      <div class="balance-chip">路線 <b>${state.stats.routeUses}</b></div>
      <div class="balance-chip">停業 <b>${bankruptCount}</b></div>
    </div>
  `;
}

function renderLogItems() {
  return state.eventLog.map(item => `<div class="log-item">${formatLogItem(item)}</div>`).join("");
}

function formatLogItem(item) {
  let html = escapeHtml(item);

  for (let i = 0; i < state.players.length; i += 1) {
    const p = state.players[i];
    const color = PLAYER_COLORS[i];
    const pattern = new RegExp(escapeRegExp(p.name), "g");
    html = html.replace(pattern, `<span class="log-player" style="color:${color}">${p.name}</span>`);
  }

  html = html.replace(/([+]\s?[\d,]+)/g, `<span class="log-money-pos">$1</span>`);
  html = html.replace(/([-]\s?[\d,]+)/g, `<span class="log-money-neg">$1</span>`);

  return html;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function openTileModal(tileId) {
  state.selectedTileId = tileId;
  render();
  const modal = document.getElementById("tileModalBackdrop");
  if (modal) modal.classList.add("open");
}

function closeTileModal() {
  const modal = document.getElementById("tileModalBackdrop");
  if (modal) modal.classList.remove("open");
}

function renderTileModal() {
  const tileId = state.selectedTileId ?? currentPlayer().position;
  const tile = state.tiles.find(t => t.id === tileId) || currentTile();
  const owner = state.players.find(p => p.id === tile.ownerId);
  const playersHere = state.players.filter(p => !p.isBankrupt && p.position === tile.id);
  const godSpawn = state.godSpawns.find(g => g.tileId === tile.id);
  const god = godSpawn ? window.TAOFUWENG_GODS.find(g => g.id === godSpawn.godId) : null;

  let detailContent = "";
  if (tile.type === "land") {
    const sampleOwner = owner || currentPlayer();
    const sampleRent = calculateRent(tile, currentPlayer(), sampleOwner, { simulate: true }).rent;
    detailContent = `
      <div class="detail-chip"><b>行政區</b><span>${tile.district}</span></div>
      <div class="detail-chip"><b>策略區域</b><span>${getZoneConfig(tile.zone)?.name || "無"}</span></div>
      <div class="detail-chip"><b>套裝進度</b><span>${owner ? renderZoneBonusText(owner, tile.zone) : renderZoneBonusText(currentPlayer(), tile.zone)}</span></div>
      <div class="detail-chip"><b>等級</b><span>${tile.tier} 級｜${LEVEL_NAMES[tile.level]}</span></div>
      <div class="detail-chip"><b>進駐費</b><span>${formatMoney(calculatePurchasePrice(currentPlayer(), tile))}</span></div>
      <div class="detail-chip"><b>擴建費</b><span>${formatMoney(calculateUpgradeCost(currentPlayer(), tile))}</span></div>
      <div class="detail-chip"><b>委託支援費</b><span>${formatMoney(sampleRent)}</span></div>
      <div class="detail-chip"><b>據點狀態</b><span>${getTileStatusText(tile)}</span></div>
      <div class="detail-chip"><b>所有者</b><span>${owner ? owner.name : "無主"}</span></div>
    `;
  } else {
    detailContent = `
      <div class="detail-chip"><b>類型</b><span>${renderTileMeta(tile)}</span></div>
      <div class="detail-chip"><b>格子效果</b><span>${renderTileTypeEffect(tile)}</span></div>
    `;
  }

  return `
    <div id="tileModalBackdrop" class="modal-backdrop">
      <div class="tile-modal" role="dialog" aria-modal="true">
        <div class="tile-modal-header">
          <div>
            <h2 class="tile-modal-title">#${tile.id} ${tile.name}</h2>
            <div class="tile-modal-subtitle">${tile.subtitle || "城市據點資訊"}</div>
          </div>
          <button id="closeTileModalBtn" class="modal-close">×</button>
        </div>
        <div class="tile-detail-grid">
          ${detailContent}
          <div class="detail-chip"><b>玩家</b><span>${playersHere.map(p => p.name).join("、") || "無"}</span></div>
          <div class="detail-chip"><b>亂入</b><span>${god ? god.name : "無"}</span></div>
        </div>
        <div class="modal-note">
          ${renderTileModalNote(tile, owner, god)}
        </div>
      </div>
    </div>
  `;
}

function renderTileTypeEffect(tile) {
  if (tile.type === "card") return "抽取支援裝備";
  if (tile.type === "fate") return "觸發突發事件";
  if (tile.type === "traffic") return "支付交通費 / 交通角色觸發";
  if (tile.type === "lottery") return "投入支援基金抽選";
  if (tile.type === "start") return "英雄總部補給";
  return "一般格子";
}

function renderTileModalNote(tile, owner, god) {
  if (tile.type === "land") {
    if (!owner) return "這是無主據點。玩家抵達後可選擇進駐，但同一回合進駐後不可再擴建。";
    if (owner.id === currentPlayer().id) return "這是目前玩家持有的據點。抵達時可擴建，但一回合只能進行一次地產操作。";
    return `這是 ${owner.name} 的據點。其他玩家抵達時需支付委託支援費。`;
  }

  if (tile.type === "card") return "抵達後可抽取支援裝備卡。手牌上限為 5 張。";
  if (tile.type === "fate") return "抵達後會觸發突發事件，可能影響支援預算、據點、移動或全域效果。";
  if (tile.type === "traffic") return "抵達交通站會支付交通費，部分角色或卡片可改變交通效果。";
  if (tile.type === "lottery") return "可投入支援基金抽選，未中獎時基金會累積。";
  if (tile.type === "start") return "英雄總部。經過時可取得支援預算。";
  return "一般格子。";
}

function renderTileStatusBadges(tile) {
  if (!tile || tile.type !== "land") return "";
  const badges = [];
  if (tile.guardTurns > 0) badges.push(`<span title="防守中">🛡️</span>`);
  if (tile.disruptedTurns > 0) badges.push(`<span title="干擾中">⚠️</span>`);
  if (tile.disabledRentOnce) badges.push(`<span title="停擺一次">⛔</span>`);
  if (!badges.length) return "";
  return `<div class="tile-status-badges">${badges.join("")}</div>`;
}

function compactMoney(value) {
  if (value >= 10000) return `${Math.round(value / 1000)}k`;
  return formatMoney(value);
}

function renderTileMeta(tile) {
  if (tile.type === "land") {
    return `${tile.tier}｜${compactMoney(tile.price)}`;
  }
  const labels = {
    start: "總部",
    card: "支援",
    fate: "突發",
    traffic: "交通",
    lottery: "基金"
  };
  return labels[tile.type] || tile.type;
}

function renderBuildings(tile) {
  if (tile.type !== "land" || tile.level <= 0) return "";
  const icon = tile.level === 4 ? "🏢" : "🏠".repeat(tile.level);
  return `<div class="buildings" title="${LEVEL_NAMES[tile.level]}">${icon}</div>`;
}

function renderTurnInfo() {
  const p = currentPlayer();
  if (state.gameOver) return `<strong>遊戲結束</strong><br>${state.winnerText}`;

  return `
    回合：${Math.min(state.round, state.maxRound)} / ${state.maxRound}<br>
    目前玩家：<strong>${p.name}</strong> ${p.type === "human" ? "真人" : "AI"}<br>
    個性：${getCharacter(p)?.abilityName || "無"}｜冷卻：${p.abilityCooldown || 0}<br>
    狀態：${state.phase === "waitingRoll" ? "等待擲骰" : "行動階段"}｜地產操作：${state.landActionUsed ? "已使用" : "可使用"}
  `;
}

function renderEndSummary() {
  const ranking = [...state.players].sort((a, b) => calculateNetWorth(b) - calculateNetWorth(a));
  return `
    <div class="end-summary">
      <h4>結算</h4>
      ${ranking.map((p, index) => {
        const owned = state.tiles.filter(t => t.ownerId === p.id);
        const bestTile = owned.sort((a, b) => b.level - a.level || b.price - a.price)[0];
        return `<div class="end-row">
          <b>#${index + 1} ${p.name}</b>
          <span>聲望 ${formatMoney(calculateNetWorth(p))}｜預算 ${formatMoney(p.cash)}｜據點 ${owned.length}｜套裝 ${getPlayerCompletedSetCount(p)}｜最高 ${bestTile ? bestTile.name : "無"}</span>
        </div>`;
      }).join("")}
      <div class="end-stats">破壞 ${state.stats.damageUses}｜防守成功 ${state.stats.defenseSuccess}｜路線控制 ${state.stats.routeUses}｜卡片使用 ${state.stats.cardUses}</div>
    </div>
  `;
}

function renderPlayers() {
  const ranking = [...state.players].sort((a, b) => calculateNetWorth(b) - calculateNetWorth(a));
  const rankMap = new Map(ranking.map((p, index) => [p.id, index + 1]));

  return `
    <div class="players-grid">
      ${state.players.map((p, index) => {
        const owned = state.tiles.filter(t => t.ownerId === p.id);
        const effects = p.statusEffects.map(e => `${e.name}(${e.duration})`).join("、") || "無";
        const char = getCharacter(p);
        const rank = rankMap.get(p.id);
        const active = p.id === currentPlayer().id && !state.gameOver ? " active" : "";
        const bankrupt = p.isBankrupt ? " bankrupt-card" : "";
        const rankClass = rank === 1 ? " rank-1" : "";
        return `
          <div class="player-card${active}${bankrupt}${rankClass}" title="${char?.abilityText || ""}">
            <div class="player-main">
              <div class="player-title">
                <div class="player-dot" style="background:${PLAYER_COLORS[index]}"></div>
                <strong>${rank === 1 ? "👑 " : ""}${p.name}</strong>
              </div>
              <span class="rank-chip">#${rank}</span>
              <span class="badge">${p.type === "human" ? "真人" : "AI"}</span>
            </div>
            <div class="player-quirk">個性：${char?.quirk || "無"}</div>
            <div class="player-compact-stats">
              <span class="stat-chip">預算 ${formatMoney(p.cash)}</span>
              <span class="stat-chip">據點 ${owned.length}</span>
              <span class="stat-chip">套裝 ${getPlayerCompletedSetCount(p)}</span>
              <span class="stat-chip">聲望 ${formatMoney(calculateNetWorth(p))}</span>
              <span class="stat-chip">手牌 ${p.cards.length}/${maxHandSize}</span>
              <span class="stat-chip cooldown-chip">CD ${p.abilityCooldown || 0}</span>
            </div>
            <div class="status-line">
              位置：${state.tiles[p.position].name}｜套裝：${getPlayerBestZoneSummary(p)}｜狀態：${effects}${p.noRentCount ? `｜支援費-50% ${p.noRentCount}` : ""}${p.cancelNegativeFateCount ? `｜公關 ${p.cancelNegativeFateCount}` : ""}${p.upgradeDiscountCount ? `｜折扣 ${p.upgradeDiscountCount}` : ""}${p.skipNextTurn ? "｜停行" : ""}${p.isBankrupt ? "｜停業" : ""}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderCardOptions() {
  const p = currentPlayer();
  if (!p || p.type !== "human" || !p.cards.length) return `<option value="">無可用手牌</option>`;
  return p.cards.map((cardId, index) => {
    const card = window.TAOFUWENG_CARDS.find(c => c.id === cardId);
    return `<option value="${cardId}">${index + 1}. ${card?.name || cardId}</option>`;
  }).join("");
}

function renderCardHelp() {
  const p = currentPlayer();
  if (!p || p.type !== "human" || !p.cards.length) return "抵達支援裝備卡可取得手牌，上限 5 張。";
  const selectedCardId = document.getElementById("cardSelect")?.value || p.cards[0];
  const card = window.TAOFUWENG_CARDS.find(c => c.id === selectedCardId);
  return card ? `${card.name}：${card.description}` : "選擇手牌後使用。";
}

function renderHint() {
  if (state.gameOver) return state.winnerText;
  const p = currentPlayer();
  const tile = currentTile(p);

  if (p.type === "ai") return "AI 行動中。";
  if (state.phase === "waitingRoll") return "可先使用擲骰前卡片或角色個性，或直接擲骰。";
  if (tile.type === "land" && !tile.ownerId && !state.landActionUsed) return "可進駐；買完本回合不可再擴建。";
  if (tile.type === "land" && tile.ownerId === p.id && !state.landActionUsed) return "可擴建；本回合只能做一次地產操作。";
  return "本格效果已處理，可使用手牌或結束回合。";
}

function renderControls() {
  const p = currentPlayer();
  const tile = currentTile(p);
  const isHumanTurn = !state.gameOver && p.type === "human";

  const roll = document.getElementById("rollBtn");
  const buy = document.getElementById("buyBtn");
  const upgrade = document.getElementById("upgradeBtn");
  const end = document.getElementById("endTurnBtn");
  const useCard = document.getElementById("useCardBtn");
  const ability = document.getElementById("abilityBtn");

  if (!roll || !buy || !upgrade || !end || !useCard || !ability) return;

  roll.disabled = !(isHumanTurn && state.phase === "waitingRoll");
  buy.disabled = !(isHumanTurn && state.phase === "action" && !state.landActionUsed && tile.type === "land" && !tile.ownerId && p.cash >= calculatePurchasePrice(p, tile));
  upgrade.disabled = !(isHumanTurn && state.phase === "action" && !state.landActionUsed && tile.type === "land" && tile.ownerId === p.id && tile.level < 4 && p.cash >= calculateUpgradeCost(p, tile));
  end.disabled = !(isHumanTurn && state.phase === "action");
  useCard.disabled = !(isHumanTurn && p.cards.length > 0);
  ability.disabled = !canUseAbility(p);
}

function bindDynamicControls() {
  const roll = document.getElementById("rollBtn");
  const buy = document.getElementById("buyBtn");
  const upgrade = document.getElementById("upgradeBtn");
  const end = document.getElementById("endTurnBtn");
  const useCard = document.getElementById("useCardBtn");
  const ability = document.getElementById("abilityBtn");
  const cardSelect = document.getElementById("cardSelect");
  const closeModal = document.getElementById("closeTileModalBtn");
  const modalBackdrop = document.getElementById("tileModalBackdrop");

  if (roll) roll.addEventListener("click", humanRoll);
  if (buy) buy.addEventListener("click", () => { if (buyCurrentLand(currentPlayer())) render(); });
  if (upgrade) upgrade.addEventListener("click", () => { if (upgradeCurrentLand(currentPlayer())) render(); });
  if (end) end.addEventListener("click", endTurn);
  if (useCard) useCard.addEventListener("click", useSelectedCard);
  if (ability) ability.addEventListener("click", () => { if (useAbility()) render(); });
  if (closeModal) closeModal.addEventListener("click", closeTileModal);
  if (modalBackdrop) modalBackdrop.addEventListener("click", (event) => {
    if (event.target === modalBackdrop) closeTileModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeTileModal();
  }, { once: true });

  if (cardSelect) cardSelect.addEventListener("change", () => {
    const help = document.querySelector(".card-help");
    const card = window.TAOFUWENG_CARDS.find(c => c.id === cardSelect.value);
    if (help && card) help.textContent = `${card.name}：${card.description}`;
  });

  renderControls();
}

function render() {
  if (!state) {
    renderSetup();
    return;
  }
  renderBoard();
}

function init() {
  state = null;
  render();
}

document.getElementById("newGameBtn").addEventListener("click", () => {
  init();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeTileModal();
});

init();

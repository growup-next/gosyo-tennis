import { Match, Member, Attendance } from '@/types';
import { generateCoinTossResult } from './coinToss';

interface MatchGenerationContext {
    presentMembers: Member[];
    attendances: Attendance[];
    existingMatches: Match[];
    eventId: string;
}

interface PlayerScore {
    memberId: string;
    score: number;
    matchCount: number;
    lastMatchNumber: number;
    isEarlyLeaver: boolean;
    earlyLeaveTime?: string;
    earlyLeaveMatchCount: number;
}

/**
 * ダブルス組み合わせ最適化エンジン
 * 
 * 最適化ルール:
 * 1. 試合数が均等化されるようローテーション
 * 2. 同一ペアの連続発生を抑制
 * 3. 同一対戦カードの偏りを軽減
 * 4. 同一人物が2試合以上連続出場しないよう極力回避
 * 5. 早退予定者を優先的に試合に割り当て
 * 6. 早退者について最低2試合出場保証
 */

/**
 * プレイヤースコア初期化
 */
function initializePlayerScores(
    presentMembers: Member[],
    attendances: Attendance[],
    existingMatches: Match[]
): Map<string, PlayerScore> {
    const scores = new Map<string, PlayerScore>();

    presentMembers.forEach(member => {
        const attendance = attendances.find(a => a.memberId === member.id);
        const matchCount = countPlayerMatches(member.id, existingMatches);
        const lastMatch = getLastMatchNumber(member.id, existingMatches);

        scores.set(member.id, {
            memberId: member.id,
            score: 0,
            matchCount,
            lastMatchNumber: lastMatch,
            isEarlyLeaver: attendance?.earlyLeave || false,
            earlyLeaveTime: attendance?.earlyLeaveTime,
            earlyLeaveMatchCount: matchCount,
        });
    });

    return scores;
}

/**
 * プレイヤーの試合数をカウント
 */
function countPlayerMatches(playerId: string, matches: Match[]): number {
    return matches.filter(m =>
        !m.isNoGame && (
            m.team1.includes(playerId) ||
            m.team2.includes(playerId)
        )
    ).length;
}

/**
 * プレイヤーの最後の試合番号を取得
 */
function getLastMatchNumber(playerId: string, matches: Match[]): number {
    const playerMatches = matches.filter(m =>
        m.team1.includes(playerId) || m.team2.includes(playerId)
    );
    if (playerMatches.length === 0) return -1;
    return Math.max(...playerMatches.map(m => m.matchNumber));
}

/**
 * ペア履歴をチェック
 */
function getPairCount(
    player1: string,
    player2: string,
    matches: Match[]
): number {
    return matches.filter(m => {
        const team1Has = m.team1.includes(player1) && m.team1.includes(player2);
        const team2Has = m.team2.includes(player1) && m.team2.includes(player2);
        return team1Has || team2Has;
    }).length;
}

/**
 * 対戦履歴をチェック
 */
function getMatchupCount(
    team1: [string, string],
    team2: [string, string],
    matches: Match[]
): number {
    return matches.filter(m => {
        const sameMatchup = (
            (m.team1.includes(team1[0]) && m.team1.includes(team1[1]) &&
                m.team2.includes(team2[0]) && m.team2.includes(team2[1])) ||
            (m.team1.includes(team2[0]) && m.team1.includes(team2[1]) &&
                m.team2.includes(team1[0]) && m.team2.includes(team1[1]))
        );
        return sameMatchup;
    }).length;
}

/**
 * 全ての4人組み合わせを生成
 */
function generateAllCombinations(players: string[]): [string, string, string, string][] {
    const combinations: [string, string, string, string][] = [];

    for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
            for (let k = j + 1; k < players.length; k++) {
                for (let l = k + 1; l < players.length; l++) {
                    combinations.push([players[i], players[j], players[k], players[l]]);
                }
            }
        }
    }

    return combinations;
}

/**
 * 4人からチーム分けのパターンを生成
 */
function generateTeamPatterns(
    fourPlayers: [string, string, string, string]
): Array<{ team1: [string, string]; team2: [string, string] }> {
    const [a, b, c, d] = fourPlayers;
    return [
        { team1: [a, b], team2: [c, d] },
        { team1: [a, c], team2: [b, d] },
        { team1: [a, d], team2: [b, c] },
    ];
}

/**
 * 組み合わせのスコアを計算
 */
function calculateCombinationScore(
    team1: [string, string],
    team2: [string, string],
    playerScores: Map<string, PlayerScore>,
    existingMatches: Match[],
    nextMatchNumber: number
): number {
    let score = 0;
    const allPlayers = [...team1, ...team2];

    // 1. 試合数均等化ボーナス（試合数が少ない人ほど高スコア）
    const minMatchCount = Math.min(
        ...allPlayers.map(p => playerScores.get(p)?.matchCount || 0)
    );
    allPlayers.forEach(p => {
        const playerScore = playerScores.get(p);
        if (playerScore) {
            const matchDiff = playerScore.matchCount - minMatchCount;
            score -= matchDiff * 100; // 試合数差がある場合はペナルティ
        }
    });

    // 2. 連続出場ペナルティ
    allPlayers.forEach(p => {
        const playerScore = playerScores.get(p);
        if (playerScore && playerScore.lastMatchNumber === nextMatchNumber - 1) {
            score -= 200; // 直前試合出場者はペナルティ
        }
        if (playerScore && playerScore.lastMatchNumber === nextMatchNumber - 2) {
            score -= 50; // 2試合前出場者は軽いペナルティ
        }
    });

    // 3. 早退者優先ボーナス
    allPlayers.forEach(p => {
        const playerScore = playerScores.get(p);
        if (playerScore?.isEarlyLeaver) {
            // 早退者で2試合未満の場合は優先ボーナス
            if (playerScore.earlyLeaveMatchCount < 2) {
                score += 300;
            }
            // 早退時刻が近い場合はさらにボーナス
            if (playerScore.earlyLeaveTime) {
                score += 100;
            }
        }
    });

    // 4. 同一ペア抑制
    const team1PairCount = getPairCount(team1[0], team1[1], existingMatches);
    const team2PairCount = getPairCount(team2[0], team2[1], existingMatches);
    score -= (team1PairCount + team2PairCount) * 50;

    // 5. 同一対戦カード抑制
    const matchupCount = getMatchupCount(team1, team2, existingMatches);
    score -= matchupCount * 150;

    return score;
}

/**
 * 最適な次の試合を生成
 */
export function generateNextMatch(context: MatchGenerationContext): Match | null {
    const { presentMembers, attendances, existingMatches, eventId } = context;

    if (presentMembers.length < 4) {
        return null; // 4人未満では試合不可
    }

    const playerScores = initializePlayerScores(
        presentMembers,
        attendances,
        existingMatches
    );

    const playerIds = presentMembers.map(m => m.id);
    const allCombinations = generateAllCombinations(playerIds);
    const nextMatchNumber = existingMatches.length + 1;

    type MatchTeams = { team1: [string, string]; team2: [string, string] };
    let bestMatch: MatchTeams | null = null;
    let bestScore = -Infinity;

    // 全ての4人組み合わせを評価
    allCombinations.forEach(fourPlayers => {
        const teamPatterns = generateTeamPatterns(fourPlayers);

        teamPatterns.forEach(pattern => {
            const score = calculateCombinationScore(
                pattern.team1,
                pattern.team2,
                playerScores,
                existingMatches,
                nextMatchNumber
            );

            if (score > bestScore) {
                bestScore = score;
                bestMatch = pattern;
            }
        });
    });

    if (!bestMatch) {
        return null;
    }

    // 型アサーションでTypeScriptに型を明示
    const finalMatch = bestMatch as MatchTeams;

    // 試合データを生成
    const match: Match = {
        id: `${eventId}_match_${nextMatchNumber}`,
        eventId,
        matchNumber: nextMatchNumber,
        team1: finalMatch.team1,
        team2: finalMatch.team2,
        coinToss: generateCoinTossResult(),
        isNoGame: false,
        createdAt: new Date().toISOString(),
    };

    return match;
}

/**
 * 複数試合を一括生成
 */
export function generateMatches(
    context: MatchGenerationContext,
    count: number
): Match[] {
    const matches: Match[] = [];
    let currentMatches = [...context.existingMatches];

    for (let i = 0; i < count; i++) {
        const match = generateNextMatch({
            ...context,
            existingMatches: currentMatches,
        });

        if (match) {
            matches.push(match);
            currentMatches.push(match);
        } else {
            break;
        }
    }

    return matches;
}

/**
 * 途中退場時の再ローテーション
 */
export function regenerateMatchesAfterWithdrawal(
    context: MatchGenerationContext,
    withdrawnPlayerId: string,
    matchToCancel: Match
): {
    cancelledMatch: Match;
    newMatches: Match[];
} {
    // 該当試合をノーゲームに
    const cancelledMatch: Match = {
        ...matchToCancel,
        isNoGame: true,
        noGameReason: '途中退場のためノーゲーム',
    };

    // 退場者を除いた新しいメンバーリスト
    const remainingMembers = context.presentMembers.filter(
        m => m.id !== withdrawnPlayerId
    );

    // 残りの試合を再生成
    const newMatches = generateMatches(
        {
            ...context,
            presentMembers: remainingMembers,
            existingMatches: context.existingMatches.filter(
                m => m.id !== matchToCancel.id
            ),
        },
        3 // 3試合分を再生成
    );

    return {
        cancelledMatch,
        newMatches,
    };
}

/**
 * 早退者の2試合保証チェック
 */
export function checkEarlyLeaverGuarantee(
    attendances: Attendance[],
    matches: Match[]
): { playerId: string; currentMatches: number; guaranteed: boolean }[] {
    const earlyLeavers = attendances.filter(a => a.earlyLeave && a.status === 'present');

    return earlyLeavers.map(attendance => {
        const matchCount = countPlayerMatches(attendance.memberId, matches);
        return {
            playerId: attendance.memberId,
            currentMatches: matchCount,
            guaranteed: matchCount >= 2,
        };
    });
}

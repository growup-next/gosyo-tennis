import { Match, PlayerStats, Member } from '@/types';

/**
 * 試合形式を決定（出席人数に基づく）
 * 6名以上：ノーアド、6名以下：1デュース
 */
export function determineMatchFormat(presentCount: number): 'no-ad' | 'one-deuce' {
    return presentCount > 6 ? 'no-ad' : 'one-deuce';
}

/**
 * スコアから勝者を判定
 * 4ゲーム先取制
 */
export function determineWinner(
    team1Games: number,
    team2Games: number
): 'team1' | 'team2' | null {
    if (team1Games >= 4 && team1Games > team2Games) return 'team1';
    if (team2Games >= 4 && team2Games > team1Games) return 'team2';
    return null;
}

/**
 * 試合結果から選手成績を集計
 */
export function calculatePlayerStats(
    matches: Match[],
    members: Member[]
): PlayerStats[] {
    const statsMap = new Map<string, PlayerStats>();

    // 全メンバーの初期化
    members.forEach(member => {
        statsMap.set(member.id, {
            memberId: member.id,
            memberName: member.name,
            isGuest: member.isGuest,
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
        });
    });

    // 試合結果を集計（ノーゲームは除外）
    matches
        .filter(match => !match.isNoGame && match.score)
        .forEach(match => {
            const team1Ids = match.team1;
            const team2Ids = match.team2;
            const winner = match.score!.winner;

            // チーム1のメンバー
            team1Ids.forEach(id => {
                const stats = statsMap.get(id);
                if (stats) {
                    stats.matchesPlayed++;
                    if (winner === 'team1') {
                        stats.wins++;
                    } else {
                        stats.losses++;
                    }
                }
            });

            // チーム2のメンバー
            team2Ids.forEach(id => {
                const stats = statsMap.get(id);
                if (stats) {
                    stats.matchesPlayed++;
                    if (winner === 'team2') {
                        stats.wins++;
                    } else {
                        stats.losses++;
                    }
                }
            });
        });

    // 勝率計算
    statsMap.forEach(stats => {
        if (stats.matchesPlayed > 0) {
            stats.winRate = stats.wins / stats.matchesPlayed;
        }
    });

    return Array.from(statsMap.values());
}

/**
 * ランキングを計算（ゲストは対象外）
 * 勝率優先でソート
 */
export function calculateRankings(stats: PlayerStats[]): PlayerStats[] {
    // ゲスト以外をフィルタリング
    const regularMembers = stats.filter(s => !s.isGuest);

    // 勝率でソート（同率の場合は試合数で）
    const sorted = [...regularMembers].sort((a, b) => {
        if (b.winRate !== a.winRate) {
            return b.winRate - a.winRate;
        }
        return b.matchesPlayed - a.matchesPlayed;
    });

    // ランキング付与
    sorted.forEach((stats, index) => {
        stats.rank = index + 1;
    });

    // ゲストを最後に追加（ランキングなし）
    const guests = stats.filter(s => s.isGuest);

    return [...sorted, ...guests];
}

/**
 * 日付でフィルタリング
 */
export function filterMatchesByDate(
    matches: Match[],
    startDate: string,
    endDate: string
): Match[] {
    return matches.filter(match => {
        // eventIdから日付を抽出する想定
        // 実際の実装ではイベントデータと紐付けが必要
        return true;
    });
}

/**
 * スコアの表示形式
 */
export function formatScore(team1Games: number, team2Games: number): string {
    return `${team1Games} - ${team2Games}`;
}

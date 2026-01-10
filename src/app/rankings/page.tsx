'use client';

import { useState, useEffect } from 'react';
import { Match, PlayerStats, Member } from '@/types';
import { FIXED_MEMBERS } from '@/data/members';
import { calculatePlayerStats, calculateRankings } from '@/lib/scoring';
import styles from './page.module.css';

type Period = 'today' | 'month' | 'year' | 'all';

export default function RankingsPage() {
    const [rankings, setRankings] = useState<PlayerStats[]>([]);
    const [period, setPeriod] = useState<Period>('all');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadRankings();
    }, [period]);

    const loadRankings = async () => {
        setIsLoading(true);

        try {
            // スプレッドシートから試合データを取得
            const matchesResponse = await fetch('/api/sheets/data?sheet=Matches');
            const matchesData = await matchesResponse.json();

            const resultsResponse = await fetch('/api/sheets/data?sheet=Results');
            const resultsData = await resultsResponse.json();

            let matches: Match[] = [];

            if (matchesResponse.ok && matchesData.data && matchesData.data.length > 0 &&
                resultsResponse.ok && resultsData.data) {
                // スプレッドシートのデータをMatch型に変換
                matches = matchesData.data.map((row: Record<string, string>) => {
                    const result = resultsData.data.find((r: Record<string, string>) => r.matchId === row.id);
                    return {
                        id: row.id,
                        eventId: row.eventId,
                        matchNumber: parseInt(row.matchNumber, 10) || 0,
                        team1: [row.team1Player1, row.team1Player2] as [string, string],
                        team2: [row.team2Player1, row.team2Player2] as [string, string],
                        isNoGame: row.isNoGame === 'true',
                        noGameReason: row.noGameReason || undefined,
                        isConfirmed: row.isConfirmed === 'true',
                        createdAt: row.createdAt,
                        score: result ? {
                            team1Games: parseInt(result.team1Games, 10) || 0,
                            team2Games: parseInt(result.team2Games, 10) || 0,
                            winner: result.winner as 'team1' | 'team2',
                        } : undefined,
                    };
                });
                // ローカルストレージにキャッシュ
                localStorage.setItem('tennis_matches', JSON.stringify(matches));
            } else {
                // フォールバック: ローカルストレージから読み込み
                const matchesStr = localStorage.getItem('tennis_matches');
                matches = matchesStr ? JSON.parse(matchesStr) : [];
            }

            // ゲストを含む全メンバー
            const guestsStr = localStorage.getItem('tennis_guests');
            const guests: Member[] = guestsStr ? JSON.parse(guestsStr) : [];
            const allMembers = [...FIXED_MEMBERS, ...guests];

            // 期間でフィルタリング
            const filteredMatches = filterMatchesByPeriod(matches, period);

            // 成績を計算
            const stats = calculatePlayerStats(filteredMatches, allMembers);
            const ranked = calculateRankings(stats);

            setRankings(ranked);

            // スプレッドシートにランキングを保存（確定済みの試合がある場合のみ）
            const confirmedMatches = filteredMatches.filter(m => m.isConfirmed && m.score);
            if (confirmedMatches.length > 0) {
                saveRankingsToSheet(ranked, period);
            }
        } catch (error) {
            console.error('Failed to load from spreadsheet:', error);
            // エラー時: ローカルストレージから読み込み
            const matchesStr = localStorage.getItem('tennis_matches');
            const matches: Match[] = matchesStr ? JSON.parse(matchesStr) : [];

            const guestsStr = localStorage.getItem('tennis_guests');
            const guests: Member[] = guestsStr ? JSON.parse(guestsStr) : [];
            const allMembers = [...FIXED_MEMBERS, ...guests];

            const filteredMatches = filterMatchesByPeriod(matches, period);
            const stats = calculatePlayerStats(filteredMatches, allMembers);
            const ranked = calculateRankings(stats);

            setRankings(ranked);
        } finally {
            setIsLoading(false);
        }
    };

    const saveRankingsToSheet = async (rankings: PlayerStats[], period: Period) => {
        try {
            // 各プレイヤーのランキングを保存
            for (const player of rankings) {
                if (player.matchesPlayed > 0) {
                    await fetch('/api/sheets/data', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sheetName: 'Rankings',
                            data: {
                                memberId: player.memberId,
                                memberName: player.memberName,
                                isGuest: player.isGuest ? 'true' : 'false',
                                matchesPlayed: player.matchesPlayed,
                                wins: player.wins,
                                losses: player.losses,
                                winRate: player.winRate,
                                rank: player.rank || 0,
                                period: period,
                                updatedAt: new Date().toISOString(),
                            },
                        }),
                    });
                }
            }
            console.log('Rankings saved to spreadsheet');
        } catch (error) {
            console.error('Failed to save rankings to spreadsheet:', error);
        }
    };

    const filterMatchesByPeriod = (matches: Match[], period: Period): Match[] => {
        // 簡易実装：全期間のみ対応
        // 実際の実装ではイベントデータと紐付けて日付フィルタリング
        return matches;
    };

    const regularMembers = rankings.filter(r => !r.isGuest);
    const guests = rankings.filter(r => r.isGuest);

    return (
        <div className={styles.container}>
            <h1 className={styles.pageTitle}>🏆 ランキング</h1>

            {/* 期間切替 */}
            <div className={styles.periodTabs}>
                <button
                    className={`${styles.periodTab} ${period === 'today' ? styles.active : ''}`}
                    onClick={() => setPeriod('today')}
                >
                    今日
                </button>
                <button
                    className={`${styles.periodTab} ${period === 'month' ? styles.active : ''}`}
                    onClick={() => setPeriod('month')}
                >
                    今月
                </button>
                <button
                    className={`${styles.periodTab} ${period === 'year' ? styles.active : ''}`}
                    onClick={() => setPeriod('year')}
                >
                    今年
                </button>
                <button
                    className={`${styles.periodTab} ${period === 'all' ? styles.active : ''}`}
                    onClick={() => setPeriod('all')}
                >
                    全期間
                </button>
            </div>

            {isLoading ? (
                <div className={styles.loading}>読み込み中...</div>
            ) : (
                <>
                    {/* トップ3 */}
                    {regularMembers.length >= 3 && (
                        <div className={styles.podium}>
                            <div className={styles.podiumItem} data-rank="2">
                                <div className={styles.podiumRank}>🥈</div>
                                <div className={styles.podiumName}>{regularMembers[1]?.memberName}</div>
                                <div className={styles.podiumStats}>
                                    {formatWinRate(regularMembers[1]?.winRate || 0)}
                                </div>
                            </div>
                            <div className={styles.podiumItem} data-rank="1">
                                <div className={styles.podiumRank}>🥇</div>
                                <div className={styles.podiumName}>{regularMembers[0]?.memberName}</div>
                                <div className={styles.podiumStats}>
                                    {formatWinRate(regularMembers[0]?.winRate || 0)}
                                </div>
                            </div>
                            <div className={styles.podiumItem} data-rank="3">
                                <div className={styles.podiumRank}>🥉</div>
                                <div className={styles.podiumName}>{regularMembers[2]?.memberName}</div>
                                <div className={styles.podiumStats}>
                                    {formatWinRate(regularMembers[2]?.winRate || 0)}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ランキングテーブル */}
                    <div className={styles.rankingTable}>
                        <div className={styles.tableHeader}>
                            <span className={styles.colRank}>順位</span>
                            <span className={styles.colName}>名前</span>
                            <span className={styles.colMatches}>試合</span>
                            <span className={styles.colRecord}>勝-負</span>
                            <span className={styles.colRate}>勝率</span>
                        </div>

                        {regularMembers.map((player, index) => (
                            <div
                                key={player.memberId}
                                className={`${styles.tableRow} ${index < 3 ? styles.topThree : ''}`}
                            >
                                <span className={styles.colRank}>
                                    {index < 3 ? ['🥇', '🥈', '🥉'][index] : index + 1}
                                </span>
                                <span className={styles.colName}>{player.memberName}</span>
                                <span className={styles.colMatches}>{player.matchesPlayed}</span>
                                <span className={styles.colRecord}>
                                    {player.wins}-{player.losses}
                                </span>
                                <span className={styles.colRate}>
                                    {formatWinRate(player.winRate)}
                                </span>
                            </div>
                        ))}

                        {regularMembers.length === 0 && (
                            <div className={styles.emptyState}>
                                まだ試合結果がありません
                            </div>
                        )}
                    </div>

                    {/* ゲスト成績（参考値） */}
                    {guests.length > 0 && (
                        <section className={styles.guestSection}>
                            <h2 className={styles.sectionTitle}>ゲスト成績（参考）</h2>
                            <div className={styles.guestList}>
                                {guests.map(guest => (
                                    <div key={guest.memberId} className={styles.guestRow}>
                                        <span className={styles.guestName}>{guest.memberName}</span>
                                        <span className={styles.guestStats}>
                                            {guest.matchesPlayed}試合 / {guest.wins}勝{guest.losses}敗 / {formatWinRate(guest.winRate)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* 統計サマリー */}
                    <section className={styles.summarySection}>
                        <h2 className={styles.sectionTitle}>📊 統計</h2>
                        <div className={styles.summaryGrid}>
                            <div className={styles.summaryCard}>
                                <span className={styles.summaryLabel}>総試合数</span>
                                <span className={styles.summaryValue}>
                                    {Math.floor(regularMembers.reduce((sum, p) => sum + p.matchesPlayed, 0) / 4)}
                                </span>
                            </div>
                            <div className={styles.summaryCard}>
                                <span className={styles.summaryLabel}>参加者数</span>
                                <span className={styles.summaryValue}>
                                    {regularMembers.filter(p => p.matchesPlayed > 0).length}
                                </span>
                            </div>
                            <div className={styles.summaryCard}>
                                <span className={styles.summaryLabel}>平均試合数</span>
                                <span className={styles.summaryValue}>
                                    {(regularMembers.reduce((sum, p) => sum + p.matchesPlayed, 0) /
                                        Math.max(1, regularMembers.filter(p => p.matchesPlayed > 0).length)).toFixed(1)}
                                </span>
                            </div>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}

function formatWinRate(rate: number): string {
    if (rate === 0) return '-';
    return `${(rate * 100).toFixed(0)}%`;
}

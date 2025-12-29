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

    const loadRankings = () => {
        setIsLoading(true);

        // 試合データを取得
        const matchesStr = localStorage.getItem('tennis_matches');
        const matches: Match[] = matchesStr ? JSON.parse(matchesStr) : [];

        // ゲストを含む全メンバー
        const guestsStr = localStorage.getItem('tennis_guests');
        const guests: Member[] = guestsStr ? JSON.parse(guestsStr) : [];
        const allMembers = [...FIXED_MEMBERS, ...guests];

        // 期間でフィルタリング（実際の実装ではイベント日付でフィルタ）
        const filteredMatches = filterMatchesByPeriod(matches, period);

        // 成績を計算
        const stats = calculatePlayerStats(filteredMatches, allMembers);
        const ranked = calculateRankings(stats);

        setRankings(ranked);
        setIsLoading(false);
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

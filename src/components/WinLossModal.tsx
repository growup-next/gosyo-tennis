'use client';

import { useState, useMemo } from 'react';
import { Match, Member } from '@/types';
import { FIXED_MEMBERS } from '@/data/members';
import styles from './WinLossModal.module.css';

interface EventInfo {
    id: string;
    date: string;
    startTime?: string;
    endTime?: string;
    courtNumber?: string;
}

interface WinLossModalProps {
    matches: Match[];
    events: EventInfo[];
    onClose: () => void;
}

type TabType = 'results' | 'pairs' | 'versus';

export default function WinLossModal({ matches, events, onClose }: WinLossModalProps) {
    const [activeTab, setActiveTab] = useState<TabType>('results');

    // メンバー名を取得
    const getMemberName = (id: string): string => {
        const member = FIXED_MEMBERS.find(m => m.id === id);
        return member ? member.name : id;
    };

    // 確定済み試合のみ
    const confirmedMatches = useMemo(() =>
        matches.filter(m => m.isConfirmed && m.score),
        [matches]);

    // 対戦結果一覧（日付順）
    const matchResults = useMemo(() => {
        return confirmedMatches
            .map(match => {
                const event = events.find(e => e.id === match.eventId);
                return {
                    ...match,
                    date: event?.date || '',
                };
            })
            .sort((a, b) => b.date.localeCompare(a.date));
    }, [confirmedMatches, events]);

    // ペア戦績
    const pairStats = useMemo(() => {
        const stats: Record<string, { wins: number; losses: number; matches: number }> = {};

        confirmedMatches.forEach(match => {
            const { team1, team2, score } = match;
            if (!score) return;

            // チーム1のペア
            const pair1Key = [...team1].sort().join('-');
            if (!stats[pair1Key]) {
                stats[pair1Key] = { wins: 0, losses: 0, matches: 0 };
            }
            stats[pair1Key].matches++;
            if (score.winner === 'team1') {
                stats[pair1Key].wins++;
            } else {
                stats[pair1Key].losses++;
            }

            // チーム2のペア
            const pair2Key = [...team2].sort().join('-');
            if (!stats[pair2Key]) {
                stats[pair2Key] = { wins: 0, losses: 0, matches: 0 };
            }
            stats[pair2Key].matches++;
            if (score.winner === 'team2') {
                stats[pair2Key].wins++;
            } else {
                stats[pair2Key].losses++;
            }
        });

        return Object.entries(stats)
            .map(([key, data]) => {
                const [id1, id2] = key.split('-');
                return {
                    pair: `${getMemberName(id1)}・${getMemberName(id2)}`,
                    ...data,
                    winRate: data.matches > 0 ? data.wins / data.matches : 0,
                };
            })
            .sort((a, b) => b.winRate - a.winRate);
    }, [confirmedMatches]);

    // 対戦戦績（直接対決マトリックス）
    const versusMatrix = useMemo(() => {
        const members = FIXED_MEMBERS.filter(m => !m.isGuest);
        const matrix: Record<string, Record<string, { wins: number; losses: number }>> = {};

        members.forEach(m => {
            matrix[m.id] = {};
            members.forEach(n => {
                if (m.id !== n.id) {
                    matrix[m.id][n.id] = { wins: 0, losses: 0 };
                }
            });
        });

        confirmedMatches.forEach(match => {
            const { team1, team2, score } = match;
            if (!score) return;

            team1.forEach(p1 => {
                team2.forEach(p2 => {
                    if (matrix[p1]?.[p2]) {
                        if (score.winner === 'team1') {
                            matrix[p1][p2].wins++;
                        } else {
                            matrix[p1][p2].losses++;
                        }
                    }
                    if (matrix[p2]?.[p1]) {
                        if (score.winner === 'team2') {
                            matrix[p2][p1].wins++;
                        } else {
                            matrix[p2][p1].losses++;
                        }
                    }
                });
            });
        });

        // 試合のある人だけフィルタ
        const activeMembers = members.filter(m => {
            return Object.values(matrix[m.id]).some(v => v.wins > 0 || v.losses > 0);
        });

        return { matrix, members: activeMembers };
    }, [confirmedMatches]);

    // 日付フォーマット
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return `${month}/${day}`;
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose}>
                    ✕
                </button>

                {/* タブ */}
                <div className={styles.tabs}>
                    <button
                        className={`${styles.tab} ${activeTab === 'results' ? styles.active : ''}`}
                        onClick={() => setActiveTab('results')}
                    >
                        対戦結果
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'pairs' ? styles.active : ''}`}
                        onClick={() => setActiveTab('pairs')}
                    >
                        ペア戦績
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'versus' ? styles.active : ''}`}
                        onClick={() => setActiveTab('versus')}
                    >
                        対戦戦績
                    </button>
                </div>

                {/* コンテンツ */}
                <div className={styles.content}>
                    {/* 対戦結果一覧 */}
                    {activeTab === 'results' && (
                        <div className={styles.resultsList}>
                            {matchResults.length > 0 ? (
                                matchResults.map(match => (
                                    <div key={match.id} className={styles.resultItem}>
                                        <div className={styles.resultHeader}>
                                            <span className={styles.resultDate}>
                                                {formatDate(match.date)}
                                            </span>
                                            <span className={styles.resultMatch}>
                                                第{match.matchNumber}試合
                                            </span>
                                        </div>
                                        <div className={styles.resultTeams}>
                                            <div className={`${styles.team} ${match.score?.winner === 'team1' ? styles.winner : ''}`}>
                                                {match.team1.map(getMemberName).join('・')}
                                            </div>
                                            <div className={styles.vs}>vs</div>
                                            <div className={`${styles.team} ${match.score?.winner === 'team2' ? styles.winner : ''}`}>
                                                {match.team2.map(getMemberName).join('・')}
                                            </div>
                                        </div>
                                        <div className={styles.resultScore}>
                                            {match.score?.team1Games} - {match.score?.team2Games}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className={styles.noData}>試合データがありません</p>
                            )}
                        </div>
                    )}

                    {/* ペア戦績 */}
                    {activeTab === 'pairs' && (
                        <div className={styles.pairsList}>
                            {pairStats.length > 0 ? (
                                pairStats.map((stat, idx) => (
                                    <div key={stat.pair} className={styles.pairItem}>
                                        <span className={styles.pairRank}>
                                            {idx + 1}
                                        </span>
                                        <span className={styles.pairName}>
                                            {stat.pair}
                                        </span>
                                        <span className={styles.pairRecord}>
                                            {stat.wins}勝{stat.losses}敗
                                        </span>
                                        <span className={styles.pairRate}>
                                            {(stat.winRate * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <p className={styles.noData}>ペアデータがありません</p>
                            )}
                        </div>
                    )}

                    {/* 対戦戦績 */}
                    {activeTab === 'versus' && (
                        <div className={styles.versusTable}>
                            {versusMatrix.members.length > 0 ? (
                                <div className={styles.tableWrapper}>
                                    <table className={styles.matrix}>
                                        <thead>
                                            <tr>
                                                <th></th>
                                                {versusMatrix.members.map(m => (
                                                    <th key={m.id}>{m.name}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {versusMatrix.members.map(row => (
                                                <tr key={row.id}>
                                                    <th>{row.name}</th>
                                                    {versusMatrix.members.map(col => (
                                                        <td key={col.id}>
                                                            {row.id === col.id ? (
                                                                <span className={styles.diag}>-</span>
                                                            ) : (
                                                                <span className={styles.record}>
                                                                    {versusMatrix.matrix[row.id]?.[col.id]?.wins || 0}
                                                                    -
                                                                    {versusMatrix.matrix[row.id]?.[col.id]?.losses || 0}
                                                                </span>
                                                            )}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className={styles.noData}>対戦データがありません</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

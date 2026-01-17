'use client';

import { useState, useEffect } from 'react';
import { Match, Member, PlayerStats } from '@/types';
import { FIXED_MEMBERS } from '@/data/members';
import { calculatePlayerStats, calculateRankings } from '@/lib/scoring';
import styles from './Dashboard.module.css';
import WinLossModal from './WinLossModal';

// イベント情報の型
interface EventInfo {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    courtNumber: string;
}

// 出欠情報の型
interface AttendanceInfo {
    eventId: string;
    memberId: string;
    status: string;
}

export default function Dashboard() {
    const [events, setEvents] = useState<EventInfo[]>([]);
    const [allEvents, setAllEvents] = useState<EventInfo[]>([]);
    const [attendances, setAttendances] = useState<AttendanceInfo[]>([]);
    const [matches, setMatches] = useState<Match[]>([]);
    const [rankings, setRankings] = useState<PlayerStats[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        setIsLoading(true);
        try {
            // 並列でデータを取得
            const [eventsRes, attendanceRes, matchesRes, resultsRes] = await Promise.all([
                fetch('/api/sheets/schedule'),
                fetch('/api/sheets/data?sheet=Attendance'),
                fetch('/api/sheets/data?sheet=Matches'),
                fetch('/api/sheets/data?sheet=Results'),
            ]);

            const eventsData = await eventsRes.json();
            const attendanceData = await attendanceRes.json();
            const matchesData = await matchesRes.json();
            const resultsData = await resultsRes.json();

            // 今日以降の開催をフィルタリング
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0]; // "YYYY-MM-DD"
            const thisMonth = todayStr.slice(0, 7); // "YYYY-MM"

            if (eventsRes.ok && eventsData.events) {
                // 全イベントを保持（サマリ・勝敗表用）
                setAllEvents(eventsData.events);

                // 今日以降のイベントのみ表示用にフィルタリング
                const upcomingEvents = eventsData.events.filter(
                    (e: EventInfo) => e.date && e.date >= todayStr && e.date.startsWith(thisMonth)
                );
                setEvents(upcomingEvents);
            }

            // 出欠データ（重複排除: eventId+memberIdで最新のレコードのみ保持）
            if (attendanceRes.ok && attendanceData.data) {
                console.log('Attendance data loaded:', attendanceData.data.length, 'records');

                // 重複排除: eventId+memberIdをキーとして最新のレコードを保持
                const attendanceMap = new Map<string, AttendanceInfo>();
                attendanceData.data.forEach((a: AttendanceInfo) => {
                    const key = `${a.eventId}-${a.memberId}`;
                    // 常に上書き（後のレコードが新しいと仮定）
                    attendanceMap.set(key, a);
                });
                const uniqueAttendances = Array.from(attendanceMap.values());
                console.log('Unique attendance records:', uniqueAttendances.length);

                setAttendances(uniqueAttendances);
            }

            // 試合データ（今年分）
            const thisYear = todayStr.slice(0, 4);
            if (matchesRes.ok && matchesData.data && resultsRes.ok) {
                const eventsList = eventsRes.ok && eventsData.events ? eventsData.events : [];
                const resultsList = resultsData.data || [];

                console.log('Matches data loaded:', matchesData.data.length, 'matches');
                console.log('Results data loaded:', resultsList.length, 'results');

                const yearMatches: Match[] = matchesData.data
                    .map((row: Record<string, string>) => {
                        const result = resultsList.find(
                            (r: Record<string, string>) => r.matchId === row.id
                        );
                        return {
                            id: row.id,
                            eventId: row.eventId,
                            matchNumber: parseInt(row.matchNumber, 10) || 0,
                            team1: [row.team1Player1, row.team1Player2] as [string, string],
                            team2: [row.team2Player1, row.team2Player2] as [string, string],
                            isNoGame: String(row.isNoGame).toLowerCase() === 'true',
                            noGameReason: row.noGameReason || undefined,
                            isConfirmed: String(row.isConfirmed).toLowerCase() === 'true',
                            createdAt: row.createdAt,
                            score: result ? {
                                team1Games: parseInt(result.team1Games, 10) || 0,
                                team2Games: parseInt(result.team2Games, 10) || 0,
                                winner: result.winner as 'team1' | 'team2',
                            } : undefined,
                        };
                    })
                    .filter((match: Match) => {
                        const event = eventsList.find((e: EventInfo) => e.id === match.eventId);
                        return event && event.date && event.date.startsWith(thisYear);
                    });

                console.log('Year matches filtered:', yearMatches.length, 'matches');
                console.log('Confirmed matches:', yearMatches.filter(m => m.isConfirmed && m.score).length);

                setMatches(yearMatches);

                // ランキング計算
                const guestsStr = localStorage.getItem('tennis_guests');
                const guests: Member[] = guestsStr ? JSON.parse(guestsStr) : [];
                const allMembersList = [...FIXED_MEMBERS, ...guests];
                const stats = calculatePlayerStats(yearMatches, allMembersList);
                const ranked = calculateRankings(stats);
                setRankings(ranked);
            }
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // イベントの参加者を取得
    const getEventAttendees = (eventId: string): string[] => {
        return attendances
            .filter(a => a.eventId === eventId && a.status === 'present')
            .map(a => {
                const member = FIXED_MEMBERS.find(m => m.id === a.memberId);
                return member ? member.name : a.memberId;
            });
    };

    // 月次統計を計算
    const getMonthlySummary = () => {
        const today = new Date();
        const thisMonth = today.toISOString().slice(0, 7);

        // 今月のイベントIDを取得（allEventsから）
        const monthEventIds = allEvents
            .filter(e => e.date && e.date.startsWith(thisMonth))
            .map(e => e.id);

        // 今月の試合をフィルタリング
        const monthMatches = matches.filter(m => monthEventIds.includes(m.eventId));
        const confirmedMatches = monthMatches.filter(m => m.isConfirmed && m.score);

        // 参加者数
        const participants = new Set<string>();
        confirmedMatches.forEach(m => {
            m.team1.forEach(id => participants.add(id));
            m.team2.forEach(id => participants.add(id));
        });

        // 勝率トップ
        const monthStats = calculatePlayerStats(confirmedMatches, FIXED_MEMBERS);
        const topPlayer = monthStats
            .filter(s => !s.isGuest && s.matchesPlayed > 0)
            .sort((a, b) => b.winRate - a.winRate)[0];

        return {
            matchCount: confirmedMatches.length,
            participantCount: participants.size,
            topPlayer: topPlayer?.memberName || '-',
            avgMatches: participants.size > 0
                ? (confirmedMatches.length * 4 / participants.size).toFixed(1)
                : '0',
        };
    };

    // 勝敗マトリックスを生成（簡易版：上位6名のみ表示）
    const getWinLossMatrix = () => {
        const topMembers = rankings.filter(r => !r.isGuest && r.matchesPlayed > 0).slice(0, 6);
        const matrix: Record<string, Record<string, { wins: number; losses: number }>> = {};

        topMembers.forEach(m => {
            matrix[m.memberId] = {};
            topMembers.forEach(n => {
                if (m.memberId !== n.memberId) {
                    matrix[m.memberId][n.memberId] = { wins: 0, losses: 0 };
                }
            });
        });

        // 試合結果を集計
        matches.filter(m => m.isConfirmed && m.score).forEach(match => {
            const { team1, team2, score } = match;
            if (!score) return;

            // チーム1のメンバーとチーム2のメンバーの対戦を記録
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

        return { matrix, members: topMembers };
    };

    const summary = getMonthlySummary();
    const { matrix, members: matrixMembers } = getWinLossMatrix();

    // 日付フォーマット
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
        const weekday = weekdays[date.getDay()];
        return `${month}/${day}(${weekday})`;
    };

    if (isLoading) {
        return <div className={styles.loading}>読み込み中...</div>;
    }

    return (
        <div className={styles.dashboard}>
            {/* 今月の開催情報 */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>📅 今月の開催</h2>
                {events.length > 0 ? (
                    <div className={styles.eventList}>
                        {events.map(event => {
                            const attendees = getEventAttendees(event.id);
                            return (
                                <div key={event.id} className={styles.eventCard}>
                                    <div className={styles.eventHeader}>
                                        <span className={styles.eventDate}>
                                            {formatDate(event.date)}
                                        </span>
                                        <span className={styles.eventCourt}>
                                            コート{event.courtNumber}
                                        </span>
                                    </div>
                                    <div className={styles.eventTime}>
                                        {event.startTime} - {event.endTime}
                                    </div>
                                    <div className={styles.eventAttendees}>
                                        {attendees.length > 0 ? (
                                            <>
                                                <span className={styles.attendeeLabel}>参加:</span>
                                                <span className={styles.attendeeNames}>
                                                    {attendees.join(', ')}
                                                </span>
                                            </>
                                        ) : (
                                            <span className={styles.noAttendees}>参加者未定</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className={styles.noEvents}>今月の開催予定はありません</p>
                )}
            </section>

            {/* 月次サマリ */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>📊 今月のサマリ</h2>
                <div className={styles.summaryGrid}>
                    <div className={styles.summaryItem}>
                        <span className={styles.summaryValue}>{summary.matchCount}</span>
                        <span className={styles.summaryLabel}>試合数</span>
                    </div>
                    <div className={styles.summaryItem}>
                        <span className={styles.summaryValue}>{summary.participantCount}</span>
                        <span className={styles.summaryLabel}>参加者</span>
                    </div>
                    <div className={styles.summaryItem}>
                        <span className={styles.summaryValue}>{summary.topPlayer}</span>
                        <span className={styles.summaryLabel}>勝率1位</span>
                    </div>
                    <div className={styles.summaryItem}>
                        <span className={styles.summaryValue}>{summary.avgMatches}</span>
                        <span className={styles.summaryLabel}>平均試合</span>
                    </div>
                </div>
            </section>

            {/* 勝敗表 */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>🏆 勝敗表（今年）</h2>
                {matrixMembers.length > 0 ? (
                    <>
                        <div className={styles.matrixWrapper}>
                            <table className={styles.matrix}>
                                <thead>
                                    <tr>
                                        <th></th>
                                        {matrixMembers.map(m => (
                                            <th key={m.memberId}>{m.memberName}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {matrixMembers.map(row => (
                                        <tr key={row.memberId}>
                                            <th>{row.memberName}</th>
                                            {matrixMembers.map(col => (
                                                <td key={col.memberId}>
                                                    {row.memberId === col.memberId ? (
                                                        <span className={styles.diag}>-</span>
                                                    ) : (
                                                        <span className={styles.record}>
                                                            {matrix[row.memberId]?.[col.memberId]?.wins || 0}
                                                            -
                                                            {matrix[row.memberId]?.[col.memberId]?.losses || 0}
                                                        </span>
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <button
                            className={styles.detailButton}
                            onClick={() => setShowModal(true)}
                        >
                            詳細を見る
                        </button>
                    </>
                ) : (
                    <p className={styles.noData}>まだ試合データがありません</p>
                )}
            </section>

            {/* 詳細モーダル */}
            {showModal && (
                <WinLossModal
                    matches={matches}
                    events={events}
                    onClose={() => setShowModal(false)}
                />
            )}
        </div>
    );
}

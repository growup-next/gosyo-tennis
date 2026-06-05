'use client';

import { useState, useEffect, useCallback } from 'react';
import { Member, Match, Attendance, CoinTossResult, Score } from '@/types';
import { FIXED_MEMBERS, findMemberById } from '@/data/members';
import { generateNextMatch } from '@/lib/matchOptimizer';
import { determineMatchFormat, determineWinner } from '@/lib/scoring';
import { getCoinTossDisplayText } from '@/lib/coinToss';
import styles from './page.module.css';

interface StoredEvent {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    courtNumber: number;
}

interface AttendanceSheetRow {
    eventId: string;
    memberId: string;
    status: string;
    earlyLeave: string;
    earlyLeaveTime: string;
}

interface MatchSheetRow {
    id: string;
    eventId: string;
    matchNumber: string;
    team1Player1: string;
    team1Player2: string;
    team2Player1: string;
    team2Player2: string;
    coinTossWinner: string;
    coinTossChoice: string;
    coinTossLoserSide: string;
    isNoGame: string;
    noGameReason: string;
    isConfirmed: string;
    createdAt: string;
}

interface ResultSheetRow {
    matchId: string;
    eventId: string;
    team1Games: string;
    team2Games: string;
    winner: string;
}

export default function MatchesPage() {
    const [events, setEvents] = useState<StoredEvent[]>([]);
    const [selectedEventId, setSelectedEventId] = useState<string>('');
    const [matches, setMatches] = useState<Match[]>([]);
    const [presentMembers, setPresentMembers] = useState<Member[]>([]);
    const [attendances, setAttendances] = useState<Attendance[]>([]);
    const [matchFormat, setMatchFormat] = useState<'no-ad' | 'one-deuce'>('no-ad');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // イベント読み込み
    useEffect(() => {
        loadEvents();
    }, []);

    // 選択されたイベントが変更されたらデータを読み込む
    useEffect(() => {
        if (selectedEventId) {
            void loadEventData(selectedEventId);
        }
    }, [selectedEventId]);

    const loadEvents = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/sheets/schedule');
            const data = await response.json();

            if (response.ok && data.events && data.events.length > 0) {
                const parsed: StoredEvent[] = data.events.map((ev: Record<string, string>) => ({
                    id: ev.id,
                    date: ev.date,
                    startTime: ev.startTime,
                    endTime: ev.endTime,
                    courtNumber: parseInt(ev.courtNumber, 10) || 1,
                }));
                const sorted = parsed.sort((a, b) =>
                    new Date(b.date).getTime() - new Date(a.date).getTime()
                );
                setEvents(sorted);
                localStorage.setItem('tennis_events', JSON.stringify(parsed));

                const today = new Date().toISOString().split('T')[0];
                const upcoming = sorted.filter(ev => ev.date >= today);
                if (upcoming.length > 0) {
                    setSelectedEventId(upcoming[upcoming.length - 1].id);
                } else if (sorted.length > 0) {
                    setSelectedEventId(sorted[0].id);
                }
            } else {
                // フォールバック: ローカルストレージから読み込み
                const stored = localStorage.getItem('tennis_events');
                if (stored) {
                    const parsed: StoredEvent[] = JSON.parse(stored);
                    const sorted = parsed.sort((a, b) =>
                        new Date(b.date).getTime() - new Date(a.date).getTime()
                    );
                    setEvents(sorted);

                    const today = new Date().toISOString().split('T')[0];
                    const upcoming = sorted.filter(ev => ev.date >= today);
                    if (upcoming.length > 0) {
                        setSelectedEventId(upcoming[upcoming.length - 1].id);
                    } else if (sorted.length > 0) {
                        setSelectedEventId(sorted[0].id);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load events from spreadsheet:', error);
            const stored = localStorage.getItem('tennis_events');
            if (stored) {
                const parsed: StoredEvent[] = JSON.parse(stored);
                const sorted = parsed.sort((a, b) =>
                    new Date(b.date).getTime() - new Date(a.date).getTime()
                );
                setEvents(sorted);

                const today = new Date().toISOString().split('T')[0];
                const upcoming = sorted.filter(ev => ev.date >= today);
                if (upcoming.length > 0) {
                    setSelectedEventId(upcoming[upcoming.length - 1].id);
                } else if (sorted.length > 0) {
                    setSelectedEventId(sorted[0].id);
                }
            }
        } finally {
            setIsLoading(false);
        }
    };

    const loadEventData = async (eventId: string) => {
        try {
            const [attendanceResponse, matchesResponse, resultsResponse] = await Promise.all([
                fetch('/api/sheets/data?sheet=Attendance'),
                fetch('/api/sheets/data?sheet=Matches'),
                fetch('/api/sheets/data?sheet=Results'),
            ]);

            if (!attendanceResponse.ok || !matchesResponse.ok || !resultsResponse.ok) {
                throw new Error('Failed to load spreadsheet data');
            }

            const [attendanceData, matchesData, resultsData] = await Promise.all([
                attendanceResponse.json(),
                matchesResponse.json(),
                resultsResponse.json(),
            ]);

            const sheetAttendances = mapSheetAttendances(
                eventId,
                (attendanceData.data || []) as AttendanceSheetRow[]
            );
            const sheetMatches = mapSheetMatches(
                eventId,
                (matchesData.data || []) as MatchSheetRow[],
                (resultsData.data || []) as ResultSheetRow[]
            );

            cacheEventAttendances(eventId, sheetAttendances);
            cacheEventMatches(eventId, sheetMatches);
            applyEventData(sheetAttendances, sheetMatches);
        } catch (error) {
            console.error('Failed to load event data from spreadsheet:', error);
            loadEventDataFromLocal(eventId);
        }
    };

    const loadEventDataFromLocal = (eventId: string) => {
        const attendancesStr = localStorage.getItem('tennis_attendances');
        const allAttendances: Attendance[] = attendancesStr ? JSON.parse(attendancesStr) : [];
        const eventAttendances = allAttendances.filter(a => a.eventId === eventId);

        const matchesStr = localStorage.getItem('tennis_matches');
        const allMatches: Match[] = matchesStr ? JSON.parse(matchesStr) : [];
        const eventMatches = allMatches.filter(m => m.eventId === eventId);

        applyEventData(eventAttendances, eventMatches);
    };

    const applyEventData = (
        eventAttendances: Attendance[],
        eventMatches: Match[]
    ) => {
        setAttendances(eventAttendances);

        // 出席者を抽出
        const guestsStr = localStorage.getItem('tennis_guests');
        const guests: Member[] = guestsStr ? JSON.parse(guestsStr) : [];
        const allMembers = [...FIXED_MEMBERS, ...guests];

        const present = allMembers.filter(member => {
            const attendance = eventAttendances.find(a => a.memberId === member.id);
            return attendance?.status === 'present';
        });
        setPresentMembers(present);

        // 試合形式を決定
        const format = determineMatchFormat(present.length);
        setMatchFormat(format);

        setMatches(eventMatches);
    };

    const mapSheetAttendances = (
        eventId: string,
        rows: AttendanceSheetRow[]
    ): Attendance[] => rows
        .filter(row => row.eventId === eventId)
        .map(row => ({
            eventId: row.eventId,
            memberId: row.memberId,
            status: row.status as Attendance['status'],
            earlyLeave: isTrue(row.earlyLeave),
            earlyLeaveTime: row.earlyLeaveTime || '',
        }));

    const mapSheetMatches = (
        eventId: string,
        matchRows: MatchSheetRow[],
        resultRows: ResultSheetRow[]
    ): Match[] => {
        const resultsByMatchId = new Map(
            resultRows
                .filter(row => row.eventId === eventId)
                .map(row => [row.matchId, row])
        );

        return matchRows
            .filter(row => row.eventId === eventId)
            .map(row => {
                const result = resultsByMatchId.get(row.id);
                const winner = result?.winner === 'team1' || result?.winner === 'team2'
                    ? result.winner
                    : undefined;
                const team1Games = parseNumber(result?.team1Games);
                const team2Games = parseNumber(result?.team2Games);
                const score: Score | undefined = winner !== undefined && team1Games !== undefined && team2Games !== undefined
                    ? { team1Games, team2Games, winner }
                    : undefined;
                const coinToss = toCoinToss(row);

                return {
                    id: row.id,
                    eventId: row.eventId,
                    matchNumber: parseNumber(row.matchNumber) || 0,
                    team1: [row.team1Player1, row.team1Player2] as [string, string],
                    team2: [row.team2Player1, row.team2Player2] as [string, string],
                    ...(coinToss ? { coinToss } : {}),
                    ...(score ? { score } : {}),
                    isNoGame: isTrue(row.isNoGame),
                    noGameReason: row.noGameReason || undefined,
                    isConfirmed: isTrue(row.isConfirmed),
                    createdAt: row.createdAt || new Date().toISOString(),
                };
            })
            .sort((a, b) => a.matchNumber - b.matchNumber);
    };

    const toCoinToss = (row: MatchSheetRow): CoinTossResult | undefined => {
        if (
            (row.coinTossWinner === 'team1' || row.coinTossWinner === 'team2') &&
            (row.coinTossChoice === 'serve' || row.coinTossChoice === 'receive') &&
            (row.coinTossLoserSide === 'left' || row.coinTossLoserSide === 'right')
        ) {
            return {
                winner: row.coinTossWinner,
                winnerChoice: row.coinTossChoice,
                loserSide: row.coinTossLoserSide,
            };
        }
        return undefined;
    };

    const cacheEventAttendances = (eventId: string, eventAttendances: Attendance[]) => {
        const attendancesStr = localStorage.getItem('tennis_attendances');
        const allAttendances: Attendance[] = attendancesStr ? JSON.parse(attendancesStr) : [];
        const otherAttendances = allAttendances.filter(a => a.eventId !== eventId);
        localStorage.setItem('tennis_attendances', JSON.stringify([...otherAttendances, ...eventAttendances]));
    };

    const cacheEventMatches = (eventId: string, eventMatches: Match[]) => {
        const matchesStr = localStorage.getItem('tennis_matches');
        const allMatches: Match[] = matchesStr ? JSON.parse(matchesStr) : [];
        const otherMatches = allMatches.filter(m => m.eventId !== eventId);
        localStorage.setItem('tennis_matches', JSON.stringify([...otherMatches, ...eventMatches]));
    };

    const parseNumber = (value: string | undefined): number | undefined => {
        if (value === undefined || value === '') return undefined;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    };

    const isTrue = (value: string | boolean | undefined): boolean => {
        if (typeof value === 'boolean') return value;
        return value?.toLowerCase() === 'true';
    };

    const generateMatch = useCallback(() => {
        if (presentMembers.length < 4) {
            alert('4名以上の出席者が必要です');
            return;
        }

        setIsGenerating(true);

        setTimeout(() => {
            const newMatch = generateNextMatch({
                presentMembers,
                attendances,
                existingMatches: matches,
                eventId: selectedEventId,
            });

            if (newMatch) {
                // 全試合データを更新
                const allMatchesStr = localStorage.getItem('tennis_matches');
                const allMatches: Match[] = allMatchesStr ? JSON.parse(allMatchesStr) : [];
                allMatches.push(newMatch);
                localStorage.setItem('tennis_matches', JSON.stringify(allMatches));

                setMatches(prev => [...prev, newMatch]);
            }

            setIsGenerating(false);
        }, 500);
    }, [presentMembers, attendances, matches, selectedEventId]);

    const updateCoinToss = (matchId: string, field: keyof CoinTossResult, value: string) => {
        setMatches(prev => {
            const updated = prev.map(m => {
                if (m.id === matchId && m.coinToss) {
                    return {
                        ...m,
                        coinToss: {
                            ...m.coinToss,
                            [field]: value,
                        },
                    };
                }
                return m;
            });

            // 全試合データを更新
            const allMatchesStr = localStorage.getItem('tennis_matches');
            const allMatches: Match[] = allMatchesStr ? JSON.parse(allMatchesStr) : [];
            const otherMatches = allMatches.filter(m => m.eventId !== selectedEventId);
            localStorage.setItem('tennis_matches', JSON.stringify([...otherMatches, ...updated]));

            return updated;
        });
    };

    const updateScore = (matchId: string, team1Games: number, team2Games: number) => {
        setMatches(prev => {
            const updated = prev.map(m => {
                if (m.id === matchId) {
                    const winner = determineWinner(team1Games, team2Games);
                    const score: Score | undefined = winner ? {
                        team1Games,
                        team2Games,
                        winner,
                    } : undefined;
                    return { ...m, score };
                }
                return m;
            });

            // 全試合データを更新
            const allMatchesStr = localStorage.getItem('tennis_matches');
            const allMatches: Match[] = allMatchesStr ? JSON.parse(allMatchesStr) : [];
            const otherMatches = allMatches.filter(m => m.eventId !== selectedEventId);
            localStorage.setItem('tennis_matches', JSON.stringify([...otherMatches, ...updated]));

            return updated;
        });
    };

    const markAsNoGame = (matchId: string, reason: string) => {
        setMatches(prev => {
            const updated = prev.map(m => {
                if (m.id === matchId) {
                    return {
                        ...m,
                        isNoGame: true,
                        noGameReason: reason,
                        score: undefined,
                    };
                }
                return m;
            });

            // 全試合データを更新
            const allMatchesStr = localStorage.getItem('tennis_matches');
            const allMatches: Match[] = allMatchesStr ? JSON.parse(allMatchesStr) : [];
            const otherMatches = allMatches.filter(m => m.eventId !== selectedEventId);
            localStorage.setItem('tennis_matches', JSON.stringify([...otherMatches, ...updated]));

            return updated;
        });
    };

    const deleteMatch = (matchId: string) => {
        setMatches(prev => {
            const updated = prev.filter(m => m.id !== matchId);

            // 試合番号を振り直す
            const renumbered = updated.map((m, idx) => ({
                ...m,
                matchNumber: idx + 1,
            }));

            // 全試合データを更新
            const allMatchesStr = localStorage.getItem('tennis_matches');
            const allMatches: Match[] = allMatchesStr ? JSON.parse(allMatchesStr) : [];
            const otherMatches = allMatches.filter(m => m.eventId !== selectedEventId);
            localStorage.setItem('tennis_matches', JSON.stringify([...otherMatches, ...renumbered]));

            return renumbered;
        });
    };

    const confirmMatch = async (matchId: string) => {
        const matchToConfirm = matches.find(m => m.id === matchId);
        if (!matchToConfirm) return;

        setMatches(prev => {
            const updated = prev.map(m => {
                if (m.id === matchId) {
                    return { ...m, isConfirmed: true };
                }
                return m;
            });

            // 全試合データを更新
            const allMatchesStr = localStorage.getItem('tennis_matches');
            const allMatches: Match[] = allMatchesStr ? JSON.parse(allMatchesStr) : [];
            const otherMatches = allMatches.filter(m => m.eventId !== selectedEventId);
            localStorage.setItem('tennis_matches', JSON.stringify([...otherMatches, ...updated]));

            return updated;
        });

        // スプレッドシートに保存
        try {
            // 試合データを保存
            await fetch('/api/sheets/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sheetName: 'Matches',
                    data: {
                        id: matchToConfirm.id,
                        eventId: matchToConfirm.eventId,
                        matchNumber: matchToConfirm.matchNumber,
                        team1Player1: matchToConfirm.team1[0],
                        team1Player2: matchToConfirm.team1[1],
                        team2Player1: matchToConfirm.team2[0],
                        team2Player2: matchToConfirm.team2[1],
                        coinTossWinner: matchToConfirm.coinToss?.winner || '',
                        coinTossChoice: matchToConfirm.coinToss?.winnerChoice || '',
                        coinTossLoserSide: matchToConfirm.coinToss?.loserSide || '',
                        isNoGame: matchToConfirm.isNoGame ? 'true' : 'false',
                        noGameReason: matchToConfirm.noGameReason || '',
                        isConfirmed: 'true',
                        createdAt: matchToConfirm.createdAt,
                    },
                }),
            });

            // 結果データを保存（スコアがある場合）
            if (matchToConfirm.score) {
                await fetch('/api/sheets/data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sheetName: 'Results',
                        data: {
                            matchId: matchToConfirm.id,
                            eventId: matchToConfirm.eventId,
                            team1Games: matchToConfirm.score.team1Games,
                            team2Games: matchToConfirm.score.team2Games,
                            winner: matchToConfirm.score.winner,
                            updatedAt: new Date().toISOString(),
                        },
                    }),
                });
            }

            console.log('Match saved to spreadsheet');
        } catch (error) {
            console.error('Failed to save match to spreadsheet:', error);
            // ローカルには保存済みなので、エラーは通知のみ
            alert('スプレッドシートへの保存に失敗しました。ローカルには保存されています。');
        }
    };

    const resetMatch = (matchId: string) => {
        setMatches(prev => {
            const updated = prev.map(m => {
                if (m.id === matchId) {
                    return { ...m, score: undefined, isConfirmed: false, isNoGame: false, noGameReason: undefined };
                }
                return m;
            });

            // 全試合データを更新
            const allMatchesStr = localStorage.getItem('tennis_matches');
            const allMatches: Match[] = allMatchesStr ? JSON.parse(allMatchesStr) : [];
            const otherMatches = allMatches.filter(m => m.eventId !== selectedEventId);
            localStorage.setItem('tennis_matches', JSON.stringify([...otherMatches, ...updated]));

            return updated;
        });
    };

    // チームメンバーを更新
    const updateTeamMembers = (
        matchId: string,
        team1: [string, string],
        team2: [string, string]
    ) => {
        setMatches(prev => {
            const updated = prev.map(m => {
                if (m.id === matchId) {
                    return { ...m, team1, team2 };
                }
                return m;
            });

            // 全試合データを更新
            const allMatchesStr = localStorage.getItem('tennis_matches');
            const allMatches: Match[] = allMatchesStr ? JSON.parse(allMatchesStr) : [];
            const otherMatches = allMatches.filter(m => m.eventId !== selectedEventId);
            localStorage.setItem('tennis_matches', JSON.stringify([...otherMatches, ...updated]));

            return updated;
        });
    };

    const getMemberName = (id: string): string => {
        const guestsStr = localStorage.getItem('tennis_guests');
        const guests: Member[] = guestsStr ? JSON.parse(guestsStr) : [];
        const allMembers = [...FIXED_MEMBERS, ...guests];
        return findMemberById(allMembers, id)?.name || id;
    };

    const selectedEvent = events.find(e => e.id === selectedEventId);
    const today = new Date().toISOString().split('T')[0];
    const isPastEvent = selectedEvent ? selectedEvent.date < today : false;

    // イベントを今後と過去に分ける
    const upcomingEvents = events.filter(ev => ev.date >= today).reverse();
    const pastEvents = events.filter(ev => ev.date < today);

    return (
        <div className={styles.container}>
            <h1 className={styles.pageTitle}>🎾 試合管理</h1>

            {/* 開催日選択 */}
            {events.length > 0 ? (
                <div className={styles.eventSelector}>
                    <label className={styles.label}>開催日を選択</label>
                    <select
                        className={styles.eventSelect}
                        value={selectedEventId}
                        onChange={(e) => setSelectedEventId(e.target.value)}
                    >
                        {upcomingEvents.length > 0 && (
                            <optgroup label="📆 今後の開催">
                                {upcomingEvents.map(event => (
                                    <option key={event.id} value={event.id}>
                                        {formatDate(event.date)} {event.startTime}〜 コート{event.courtNumber}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                        {pastEvents.length > 0 && (
                            <optgroup label="📁 過去の開催">
                                {pastEvents.map(event => (
                                    <option key={event.id} value={event.id}>
                                        {formatDate(event.date)} {event.startTime}〜 コート{event.courtNumber}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                </div>
            ) : (
                <div className={styles.noEvent}>
                    <p>開催日が登録されていません</p>
                    <a href="/schedule" className={styles.link}>開催日を登録する →</a>
                </div>
            )}

            {selectedEvent && (
                <>
                    {/* 選択中の開催情報 */}
                    <div className={`${styles.eventInfo} ${isPastEvent ? styles.pastEvent : ''}`}>
                        <span className={styles.eventDate}>📅 {formatDateFull(selectedEvent.date)}</span>
                        <span className={styles.eventTime}>🕐 {selectedEvent.startTime} 〜 {selectedEvent.endTime}</span>
                        <span className={styles.eventCourt}>🎾 コート {selectedEvent.courtNumber}</span>
                        {isPastEvent && <span className={styles.pastBadge}>過去</span>}
                    </div>

                    {/* 情報バー */}
                    <div className={styles.infoBar}>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>出席者数</span>
                            <span className={styles.infoValue}>{presentMembers.length}名</span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>試合形式</span>
                            <span className={styles.infoValue}>
                                {matchFormat === 'no-ad' ? 'ノーアド' : '1デュース'}
                            </span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>試合数</span>
                            <span className={styles.infoValue}>{matches.length}</span>
                        </div>
                    </div>

                    {/* 試合形式切替 */}
                    <div className={styles.formatToggle}>
                        <button
                            className={`${styles.formatBtn} ${matchFormat === 'no-ad' ? styles.active : ''}`}
                            onClick={() => setMatchFormat('no-ad')}
                        >
                            ノーアド
                        </button>
                        <button
                            className={`${styles.formatBtn} ${matchFormat === 'one-deuce' ? styles.active : ''}`}
                            onClick={() => setMatchFormat('one-deuce')}
                        >
                            1デュース
                        </button>
                    </div>

                    {/* 試合生成ボタン */}
                    <button
                        className={styles.generateBtn}
                        onClick={generateMatch}
                        disabled={isGenerating || presentMembers.length < 4}
                    >
                        {isGenerating ? (
                            <span className={styles.spinner}>⏳</span>
                        ) : (
                            <>
                                <span>🎲</span>
                                <span>次の試合を生成</span>
                            </>
                        )}
                    </button>

                    {presentMembers.length < 4 && (
                        <p className={styles.warning}>
                            ⚠️ 4名以上の出席者が必要です（現在: {presentMembers.length}名）
                            <br />
                            <a href="/attendance" className={styles.link}>出欠登録へ →</a>
                        </p>
                    )}

                    {/* 試合一覧 */}
                    <div className={styles.matchList}>
                        {matches.slice().reverse().map(match => (
                            <MatchCard
                                key={match.id}
                                match={match}
                                getMemberName={getMemberName}
                                presentMembers={presentMembers}
                                onUpdateCoinToss={updateCoinToss}
                                onUpdateScore={updateScore}
                                onMarkAsNoGame={markAsNoGame}
                                onConfirm={confirmMatch}
                                onReset={resetMatch}
                                onDelete={deleteMatch}
                                onUpdateTeamMembers={updateTeamMembers}
                            />
                        ))}
                    </div>

                    {matches.length === 0 && presentMembers.length >= 4 && (
                        <div className={styles.emptyState}>
                            <p>まだ試合がありません</p>
                            <p>「次の試合を生成」ボタンを押してください</p>
                        </div>
                    )}

                    {matches.length === 0 && presentMembers.length === 0 && (
                        <div className={styles.emptyState}>
                            <p>出席者が登録されていません</p>
                            <a href="/attendance" className={styles.link}>出欠登録へ →</a>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${date.getMonth() + 1}/${date.getDate()}(${weekDays[date.getDay()]})`;
}

function formatDateFull(dateStr: string): string {
    const date = new Date(dateStr);
    const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${date.getMonth() + 1}月${date.getDate()}日(${weekDays[date.getDay()]})`;
}

interface MatchCardProps {
    match: Match;
    getMemberName: (id: string) => string;
    presentMembers: Member[];
    onUpdateCoinToss: (matchId: string, field: keyof CoinTossResult, value: string) => void;
    onUpdateScore: (matchId: string, team1Games: number, team2Games: number) => void;
    onMarkAsNoGame: (matchId: string, reason: string) => void;
    onConfirm: (matchId: string) => void;
    onReset: (matchId: string) => void;
    onDelete: (matchId: string) => void;
    onUpdateTeamMembers: (matchId: string, team1: [string, string], team2: [string, string]) => void;
}

function MatchCard({
    match,
    getMemberName,
    presentMembers,
    onUpdateCoinToss,
    onUpdateScore,
    onMarkAsNoGame,
    onConfirm,
    onReset,
    onDelete,
    onUpdateTeamMembers,
}: MatchCardProps) {
    const [showNoGameModal, setShowNoGameModal] = useState(false);
    const [noGameReason, setNoGameReason] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showEditTeamModal, setShowEditTeamModal] = useState(false);
    const [editTeam1, setEditTeam1] = useState<[string, string]>(match.team1);
    const [editTeam2, setEditTeam2] = useState<[string, string]>(match.team2);
    const [editError, setEditError] = useState('');

    const team1Names = match.team1.map(getMemberName);
    const team2Names = match.team2.map(getMemberName);

    const handleNoGame = () => {
        onMarkAsNoGame(match.id, noGameReason || '途中退場');
        setShowNoGameModal(false);
        setNoGameReason('');
    };

    const handleDelete = () => {
        onDelete(match.id);
        setShowDeleteConfirm(false);
    };

    const openEditTeamModal = () => {
        setEditTeam1([...match.team1] as [string, string]);
        setEditTeam2([...match.team2] as [string, string]);
        setEditError('');
        setShowEditTeamModal(true);
    };

    const handleEditTeamSubmit = () => {
        // 全員異なるプレイヤーかチェック
        const allPlayers = [...editTeam1, ...editTeam2];
        const uniquePlayers = new Set(allPlayers);
        if (uniquePlayers.size !== 4) {
            setEditError('同じプレイヤーを複数選択することはできません');
            return;
        }

        // 空のプレイヤーがないかチェック
        if (allPlayers.some(p => !p)) {
            setEditError('全てのプレイヤーを選択してください');
            return;
        }

        onUpdateTeamMembers(match.id, editTeam1, editTeam2);
        setShowEditTeamModal(false);
        setEditError('');
    };

    const isEditable = !match.isConfirmed;

    return (
        <div className={`${styles.matchCard} ${match.isNoGame ? styles.noGame : ''}`}>
            <div className={styles.matchHeader}>
                <span className={styles.matchNumber}>第{match.matchNumber}試合</span>
                {match.isNoGame && (
                    <span className={styles.noGameBadge}>ノーゲーム</span>
                )}
                {match.score && (
                    <span className={styles.completedBadge}>完了</span>
                )}
            </div>

            {/* チーム対戦 */}
            <div className={styles.versus}>
                <div className={`${styles.team} ${match.score?.winner === 'team1' ? styles.winner : ''}`}>
                    <div className={styles.teamNames}>
                        {team1Names.join(' / ')}
                    </div>
                    {match.score && (
                        <div className={styles.teamScore}>{match.score.team1Games}</div>
                    )}
                </div>

                <div className={styles.vsLabel}>VS</div>

                <div className={`${styles.team} ${match.score?.winner === 'team2' ? styles.winner : ''}`}>
                    <div className={styles.teamNames}>
                        {team2Names.join(' / ')}
                    </div>
                    {match.score && (
                        <div className={styles.teamScore}>{match.score.team2Games}</div>
                    )}
                </div>
            </div>

            {/* 組み合わせ変更ボタン */}
            {isEditable && !match.isNoGame && (
                <button
                    className={styles.editTeamBtn}
                    onClick={openEditTeamModal}
                >
                    ✏️ 組み合わせ変更
                </button>
            )}

            {/* コイントス */}
            {match.coinToss && !match.isNoGame && (
                <div className={styles.coinToss}>
                    <div className={styles.coinTossTitle}>🎲 コイントス</div>
                    <div className={styles.coinTossResult}>
                        {getCoinTossDisplayText(match.coinToss, team1Names, team2Names)}
                    </div>

                    <div className={styles.coinTossOptions}>
                        <div className={styles.optionGroup}>
                            <label>勝者の選択:</label>
                            <select
                                value={match.coinToss.winnerChoice}
                                onChange={(e) => onUpdateCoinToss(match.id, 'winnerChoice', e.target.value)}
                            >
                                <option value="serve">サービス</option>
                                <option value="receive">レシーブ</option>
                            </select>
                        </div>
                        <div className={styles.optionGroup}>
                            <label>敗者のサイド:</label>
                            <select
                                value={match.coinToss.loserSide}
                                onChange={(e) => onUpdateCoinToss(match.id, 'loserSide', e.target.value)}
                            >
                                <option value="left">左サイド</option>
                                <option value="right">右サイド</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* スコア入力 */}
            {!match.isNoGame && (
                <div className={styles.scoreInput}>
                    <div className={styles.scoreInputTitle}>スコア入力</div>
                    <div className={styles.scoreRow}>
                        <div className={styles.scoreTeam}>
                            <span>{team1Names[0]?.charAt(0)}{team1Names[1]?.charAt(0)}</span>
                            <div className={styles.scoreButtons}>
                                {[0, 1, 2, 3, 4].map(n => (
                                    <button
                                        key={n}
                                        className={`${styles.scoreBtn} ${match.score?.team1Games === n ? styles.active : ''}`}
                                        onClick={() => onUpdateScore(match.id, n, match.score?.team2Games || 0)}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <span className={styles.scoreDash}>-</span>
                        <div className={styles.scoreTeam}>
                            <span>{team2Names[0]?.charAt(0)}{team2Names[1]?.charAt(0)}</span>
                            <div className={styles.scoreButtons}>
                                {[0, 1, 2, 3, 4].map(n => (
                                    <button
                                        key={n}
                                        className={`${styles.scoreBtn} ${match.score?.team2Games === n ? styles.active : ''}`}
                                        onClick={() => onUpdateScore(match.id, match.score?.team1Games || 0, n)}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ノーゲームボタン */}
            {!match.isNoGame && !match.score && isEditable && (
                <button
                    className={styles.noGameBtn}
                    onClick={() => setShowNoGameModal(true)}
                >
                    途中退場 / ノーゲーム
                </button>
            )}

            {match.isNoGame && match.noGameReason && (
                <div className={styles.noGameReason}>
                    理由: {match.noGameReason}
                </div>
            )}

            {/* アクションボタン */}
            <div className={styles.matchActions}>
                {/* 確定ボタン */}
                {!match.isConfirmed && (match.score || match.isNoGame) && (
                    <button
                        className={styles.confirmMatchBtn}
                        onClick={() => onConfirm(match.id)}
                    >
                        ✓ 確定
                    </button>
                )}

                {/* 編集ボタン（確定済みの場合のみ表示） */}
                {match.isConfirmed && (
                    <button
                        className={styles.editMatchBtn}
                        onClick={() => onReset(match.id)}
                    >
                        ✏️ 編集
                    </button>
                )}

                {/* 削除ボタン */}
                <button
                    className={styles.deleteMatchBtn}
                    onClick={() => setShowDeleteConfirm(true)}
                >
                    🗑️ 削除
                </button>
            </div>

            {/* ノーゲームモーダル */}
            {showNoGameModal && (
                <div className={styles.modal}>
                    <div className={styles.modalContent}>
                        <h3>ノーゲームにする</h3>
                        <input
                            type="text"
                            placeholder="理由（例：怪我、体調不良）"
                            value={noGameReason}
                            onChange={(e) => setNoGameReason(e.target.value)}
                            className={styles.modalInput}
                        />
                        <div className={styles.modalButtons}>
                            <button onClick={() => setShowNoGameModal(false)}>キャンセル</button>
                            <button onClick={handleNoGame} className={styles.confirmBtn}>確定</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 削除確認モーダル */}
            {showDeleteConfirm && (
                <div className={styles.modal}>
                    <div className={styles.modalContent}>
                        <h3>試合を削除しますか？</h3>
                        <p className={styles.modalText}>第{match.matchNumber}試合を削除します。この操作は取り消せません。</p>
                        <div className={styles.modalButtons}>
                            <button onClick={() => setShowDeleteConfirm(false)}>キャンセル</button>
                            <button onClick={handleDelete} className={styles.deleteBtn}>削除する</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 組み合わせ編集モーダル */}
            {showEditTeamModal && (
                <div className={styles.modal}>
                    <div className={styles.modalContent}>
                        <h3>組み合わせを変更</h3>

                        {editError && (
                            <p className={styles.errorText}>{editError}</p>
                        )}

                        <div className={styles.teamEditSection}>
                            <label className={styles.teamEditLabel}>チーム1</label>
                            <div className={styles.teamEditRow}>
                                <select
                                    className={styles.memberSelect}
                                    value={editTeam1[0]}
                                    onChange={(e) => setEditTeam1([e.target.value, editTeam1[1]])}
                                >
                                    <option value="">選択してください</option>
                                    {presentMembers.map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </select>
                                <select
                                    className={styles.memberSelect}
                                    value={editTeam1[1]}
                                    onChange={(e) => setEditTeam1([editTeam1[0], e.target.value])}
                                >
                                    <option value="">選択してください</option>
                                    {presentMembers.map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className={styles.teamEditSection}>
                            <label className={styles.teamEditLabel}>チーム2</label>
                            <div className={styles.teamEditRow}>
                                <select
                                    className={styles.memberSelect}
                                    value={editTeam2[0]}
                                    onChange={(e) => setEditTeam2([e.target.value, editTeam2[1]])}
                                >
                                    <option value="">選択してください</option>
                                    {presentMembers.map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </select>
                                <select
                                    className={styles.memberSelect}
                                    value={editTeam2[1]}
                                    onChange={(e) => setEditTeam2([editTeam2[0], e.target.value])}
                                >
                                    <option value="">選択してください</option>
                                    {presentMembers.map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className={styles.modalButtons}>
                            <button onClick={() => setShowEditTeamModal(false)}>キャンセル</button>
                            <button onClick={handleEditTeamSubmit} className={styles.applyBtn}>変更を適用</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

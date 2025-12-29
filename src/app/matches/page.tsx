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

export default function MatchesPage() {
    const [events, setEvents] = useState<StoredEvent[]>([]);
    const [selectedEventId, setSelectedEventId] = useState<string>('');
    const [matches, setMatches] = useState<Match[]>([]);
    const [presentMembers, setPresentMembers] = useState<Member[]>([]);
    const [attendances, setAttendances] = useState<Attendance[]>([]);
    const [matchFormat, setMatchFormat] = useState<'no-ad' | 'one-deuce'>('no-ad');
    const [isGenerating, setIsGenerating] = useState(false);

    // イベント読み込み
    useEffect(() => {
        loadEvents();
    }, []);

    // 選択されたイベントが変更されたらデータを読み込む
    useEffect(() => {
        if (selectedEventId) {
            loadEventData(selectedEventId);
        }
    }, [selectedEventId]);

    const loadEvents = () => {
        const stored = localStorage.getItem('tennis_events');
        if (stored) {
            const parsed: StoredEvent[] = JSON.parse(stored);
            // 日付順にソート（新しい順）
            const sorted = parsed.sort((a, b) =>
                new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            setEvents(sorted);

            // デフォルトで次の開催日（今日以降で最も近い日）を選択
            const today = new Date().toISOString().split('T')[0];
            const upcoming = sorted.filter(ev => ev.date >= today);
            if (upcoming.length > 0) {
                // 次の開催日（日付が近い順なので最後）
                setSelectedEventId(upcoming[upcoming.length - 1].id);
            } else if (sorted.length > 0) {
                // 過去の日程しかない場合は最新を選択
                setSelectedEventId(sorted[0].id);
            }
        }
    };

    const loadEventData = (eventId: string) => {
        // 出欠データ
        const attendancesStr = localStorage.getItem('tennis_attendances');
        const allAttendances: Attendance[] = attendancesStr ? JSON.parse(attendancesStr) : [];
        const eventAttendances = allAttendances.filter(a => a.eventId === eventId);
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

        // 既存の試合データ（選択されたイベントのみ）
        const matchesStr = localStorage.getItem('tennis_matches');
        if (matchesStr) {
            const allMatches: Match[] = JSON.parse(matchesStr);
            const eventMatches = allMatches.filter(m => m.eventId === eventId);
            setMatches(eventMatches);
        } else {
            setMatches([]);
        }
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
                                onUpdateCoinToss={updateCoinToss}
                                onUpdateScore={updateScore}
                                onMarkAsNoGame={markAsNoGame}
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
    onUpdateCoinToss: (matchId: string, field: keyof CoinTossResult, value: string) => void;
    onUpdateScore: (matchId: string, team1Games: number, team2Games: number) => void;
    onMarkAsNoGame: (matchId: string, reason: string) => void;
}

function MatchCard({
    match,
    getMemberName,
    onUpdateCoinToss,
    onUpdateScore,
    onMarkAsNoGame,
}: MatchCardProps) {
    const [showNoGameModal, setShowNoGameModal] = useState(false);
    const [noGameReason, setNoGameReason] = useState('');

    const team1Names = match.team1.map(getMemberName);
    const team2Names = match.team2.map(getMemberName);

    const handleNoGame = () => {
        onMarkAsNoGame(match.id, noGameReason || '途中退場');
        setShowNoGameModal(false);
        setNoGameReason('');
    };

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
            {!match.isNoGame && !match.score && (
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
        </div>
    );
}
